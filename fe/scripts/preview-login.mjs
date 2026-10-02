import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('.preview');
await mkdir(output, { recursive: true });
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '4300'], { windowsHide: true, stdio: 'ignore' });
let edge;
let ws;
const pending = new Map();
let id = 0;
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
    const item = pending.get(response.id);
    if (!item) return;
    clearTimeout(item.timeout);
    pending.delete(response.id);
    if (response.error) item.reject(new Error(response.error.message)); else item.resolve(response.result);
  };
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await call('Page.navigate', { url: 'http://127.0.0.1:4300/login' });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate('!!document.querySelector(".theme-toggle")')) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await settle();
  await evaluate(`localStorage.removeItem('scp.theme');document.documentElement.dataset.theme='light';window.dispatchEvent(new Event('scp-theme'));`);
  await settle();
  await capture('login-light-desktop.png');
  await evaluate('document.querySelector(".theme-toggle").click()');
  await settle();
  if (await evaluate('document.documentElement.dataset.theme') !== 'dark') throw new Error('Dark toggle failed');
  await capture('login-dark-desktop.png');
  await call('Page.reload');
  await settle();
  if (await evaluate('document.documentElement.dataset.theme') !== 'dark') throw new Error('Theme persistence failed');
  await evaluate('document.querySelector(".login-password-toggle").click()');
  if (await evaluate('document.querySelector("#password").type') !== 'text') throw new Error('Show password failed');
  await evaluate('document.querySelector(".login-text-button").click()');
  await settle();
  if (!await evaluate('document.querySelector(".login-help").open')) throw new Error('Help disclosure failed');
  await evaluate('document.querySelector(".login-help summary").click()');
  await evaluate('document.querySelector(".login-password-toggle").click(); document.activeElement?.blur()');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await settle();
  if (await evaluate('document.documentElement.scrollWidth > innerWidth')) throw new Error('Mobile horizontal overflow');
  await capture('login-dark-mobile.png');
  await evaluate('document.querySelector(".theme-toggle").click()');
  await evaluate('document.activeElement?.blur()');
  await settle();
  await capture('login-light-mobile.png');
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (await evaluate('getComputedStyle(document.querySelector(".login-content")).animationName') !== 'none') throw new Error('Reduced motion not respected');
  console.log('Preview passed: light/dark, persistence, password visibility, help, mobile overflow, reduced motion.');
  console.log(`Screenshots: ${output}`);
} finally {
  for (const item of pending.values()) clearTimeout(item.timeout);
  try { if (ws?.readyState === WebSocket.OPEN) await call('Browser.close'); } catch { /* process fallback */ }
  ws?.close();
  if (edge && edge.exitCode === null) edge.kill();
  if (next.exitCode === null) next.kill();
}
