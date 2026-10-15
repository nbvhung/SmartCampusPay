// Run after HTTPS is configured: node deploy/smoke.mjs https://pay.example.org
const origin = process.argv[2];
if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) {
  throw new Error('Provide an HTTPS origin without a trailing slash');
}

async function check(path, options, expectedStatus, expectedCode) {
  const response = await fetch(origin + path, {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(10000),
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${path}: expected ${expectedStatus}, received ${response.status}`);
  }
  if (expectedCode && (await response.json()).code !== expectedCode) {
    throw new Error(`${path}: unexpected response code`);
  }
  console.log(`PASS ${path}`);
}

try {
  await check('/api/v1/health/ready', {}, 200);
  await check('/login/student', {}, 200);
  await check('/login/admin', {}, 200);
  await check('/api/v1/auth/me', {}, 401);
  await check('/api/v1/auth/register/request-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentCode: 'B23DCCN001', phone: '0912345678' }),
  }, 401);
  console.log('Infrastructure smoke passed. Banking and real-user onboarding are not verified by this check.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
