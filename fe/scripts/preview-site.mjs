import { spawn } from 'node:child_process';
import { fixture } from './preview-fixtures.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('.preview');
await mkdir(output, { recursive: true });
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '4300'], { windowsHide: true, stdio: 'ignore' });
let edge;
let ws;
const pending = new Map();
let id = 0;
let role = 'super_admin';
const browserErrors = [];
const requests = [];
function call(method, params = {}) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(requestId, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}
const settle = () => evaluate('new Promise(resolve => { document.fonts.ready.then(() => setTimeout(resolve, 800)) })');
const capture = async name => {
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(output, name), Buffer.from(data, 'base64'));
};
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { ready = (await fetch('http://127.0.0.1:4300/login')).ok; } catch { /* wait */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Next server unavailable');
  edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9466',
    `--user-data-dir=${resolve(output, 'edge-profile')}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { targets = await (await fetch('http://127.0.0.1:9466/json/list')).json(); } catch { /* wait */ }
    if (targets?.some(target => target.type === 'page')) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const target = targets?.find(target => target.type === 'page');
  if (!target) throw new Error('Headless Edge unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const response = JSON.parse(event.data);
    if (response.method === 'Runtime.exceptionThrown') browserErrors.push(response.params.exceptionDetails.text);
    if (response.method === 'Fetch.requestPaused') {
      const { requestId, request } = response.params;
      const path = new URL(request.url).pathname;
      requests.push(path);
      try {
        const data = fixture(path, role);
        void call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() })).toString('base64') }).catch(error => browserErrors.push(error.message));
      } catch (error) {
        browserErrors.push(error.message);
        void call('Fetch.fulfillRequest', { requestId, responseCode: 500, body: '' });
      }
      return;
    }
    const item = pending.get(response.id);
    if (!item) return;
    clearTimeout(item.timeout);
    pending.delete(response.id);
    if (response.error) item.reject(new Error(response.error.message)); else item.resolve(response.result);
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*://127.0.0.1:4300/api/v1/*' }] });
  const setRole = async next => {
    role = next;
    await call('Network.clearBrowserCookies');
    if (!next) return;
    const token = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'preview', role: next, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.preview';
    await call('Network.setCookie', { name: 'access_token', value: token, url: 'http://127.0.0.1:4300', path: '/' });
  };
  const allRoutes = ['/', '/login', '/change-password', '/pos', '/admin/dashboard', '/admin/students', '/admin/cards', '/admin/accounts', '/admin/merchants', '/admin/transactions', '/admin/topup-pending', '/admin/admins', '/student/dashboard', '/student/topup', '/student/profile', '/student/transactions'];
  const routes = process.argv.length > 2 ? process.argv.slice(2) : allRoutes;
  for (const route of routes) {
    await setRole(route.startsWith('/student') ? 'student' : route.startsWith('/admin') ? 'super_admin' : null);
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: 'http://127.0.0.1:4300' + route });
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await evaluate('location.pathname === ' + JSON.stringify(route) + ' && !!document.querySelector(".theme-toggle")')) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    await settle();
    if (await evaluate('location.pathname') !== route) throw new Error('Unexpected redirect: ' + route);
    if (await evaluate('document.body.innerText.includes("??")')) throw new Error('Broken text encoding: ' + route);
    for (const theme of ['light', 'dark']) {
      await evaluate('localStorage.setItem("scp.theme", ' + JSON.stringify(theme) + ');document.documentElement.dataset.theme=' + JSON.stringify(theme) + ';window.dispatchEvent(new Event("scp-theme"));');
      await settle();
      if (!await evaluate('!!document.querySelector("img[src*=ptit-logo]")')) throw new Error('PTIT logo missing: ' + route);
      if (await evaluate('document.documentElement.scrollWidth > innerWidth')) throw new Error('Desktop overflow: ' + route);
      if (await evaluate('getComputedStyle(document.body).backgroundColor') !== (theme === 'dark' ? 'rgb(11, 17, 32)' : 'rgb(245, 246, 250)')) throw new Error('Global palette failed: ' + route);
      const name = route === '/' ? 'home' : route.slice(1).replaceAll('/', '-');
      await capture(name + '-' + theme + '-desktop.png');
      await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await settle();
      if (await evaluate('document.documentElement.scrollWidth > innerWidth')) throw new Error('Mobile overflow: ' + route);
      if (route.startsWith('/student') && await evaluate('[...document.querySelectorAll(".student-content .grid p")].some(p => p.scrollWidth > p.clientWidth + 1)')) throw new Error('Student text overflows its grid cell: ' + route);
      if (route.startsWith('/admin')) {
        if (!await evaluate('document.querySelector(".app-sidebar").inert')) throw new Error('Hidden mobile menu must be inert');
        await evaluate('document.querySelector(".mobile-menu").click()');
        if (!await evaluate('document.querySelector(".app-sidebar").classList.contains("is-open")')) throw new Error('Mobile menu failed');
        await evaluate('document.querySelector(".sidebar-close").click();document.activeElement?.blur()');
      }
      if (route === '/admin/students') {
        if (await evaluate('document.querySelector("input[aria-label]").getBoundingClientRect().width') < 300) throw new Error('Mobile search is too narrow');
      }
      await capture(name + '-' + theme + '-mobile.png');
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    }
    console.log('PASS ' + route + ' light/dark desktop/mobile');
  }
  if (browserErrors.length) throw new Error(browserErrors.join('\n'));
  await evaluate('document.querySelector(".theme-toggle").click()');
  const saved = await evaluate('document.documentElement.dataset.theme');
  await call('Page.reload');
  await settle();
  if (await evaluate('document.documentElement.dataset.theme') !== saved) throw new Error('Global persistence failed');
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (await evaluate('getComputedStyle(document.querySelector("main")).animationName') !== 'none') throw new Error('Reduced motion failed');
  console.log('PASS persistence and reduced motion. Read-only fixture requests: ' + requests.length);

} finally {
  for (const item of pending.values()) clearTimeout(item.timeout);
  try { if (ws?.readyState === WebSocket.OPEN) await call('Browser.close'); } catch { /* process fallback */ }
  ws?.close();
  if (edge && edge.exitCode === null) edge.kill();
  if (next.exitCode === null) next.kill();
}
