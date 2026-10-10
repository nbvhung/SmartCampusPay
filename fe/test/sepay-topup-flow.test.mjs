import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiPath = new URL("../src/lib/sepay-api.ts", import.meta.url);
const pagePath = new URL("../src/app/student/topup/page.tsx", import.meta.url);

test("student dynamic top-up sends a fixed amount and polls its SCP reference", async () => {
  const [api, page] = await Promise.all([
    readFile(apiPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(api, /createPayment: \(amount: number\)/);
  assert.match(api, /['"]\/sepay\/create-payment['"], \{ amount \}/);
  assert.match(api, /\/sepay\/status\/\$\{referenceCode\}/);
  assert.match(page, /sepayApi\.createPayment\(num\)/);
  assert.match(page, /sepayApi\.checkStatus\(data\.referenceCode\)/);
  assert.match(page, /setBalance\(prev => prev \+ st\.amount\)/);
  assert.match(page, /payment\.amount\.toLocaleString\(\)/);
  assert.match(page, /payment\.referenceCode/);
});

test("student top-up keeps amount bounds and the static QR fallback", async () => {
  const [api, page] = await Promise.all([
    readFile(apiPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(api, /['"]\/sepay\/static-qr['"]/);
  assert.match(page, /num < 1000/);
  assert.match(page, /num > 5000000/);
  assert.match(page, /min=\{1000\}/);
  assert.match(page, /max=\{5000000\}/);
  assert.match(page, /setMode\('static'\)/);
});
