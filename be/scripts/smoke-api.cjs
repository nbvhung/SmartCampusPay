const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const port = 4100;

(async () => {
  // Fail if another service already owns the smoke-test port.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  const child = spawn(process.execPath, ['dist/main.js'], {
    env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
  let exited = false;
  child.once('exit', () => { exited = true; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (exited) throw new Error(`Backend exited during startup: ${stderr}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/docs-json`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          const document = await response.json();
          if (!document.paths['/api/v1/transactions/payments/{key}']) throw new Error('Payment lookup missing from OpenAPI');
          ready = true;
          break;
        }
      } catch { /* wait for startup */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('Backend was not ready within 30 seconds');
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/hardware/static-qr`);
    const body = await response.json();
    if (response.status !== 401 || body.success !== false || body.data !== null) throw new Error('Device auth/envelope smoke check failed');
    console.log('Full AppModule startup OK; OpenAPI payment lookup OK; device auth/error envelope OK.');
  } finally {
    if (!exited) {
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await stopped;
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
