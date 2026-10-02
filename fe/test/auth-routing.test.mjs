import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server.js';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.runInNewContext(source, { exports, require, URL });
const { proxy } = exports;
function response(path, payload) {
  const headers = {};
  if (payload) {
    const token = `e30.${Buffer.from(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + 600, ...payload })).toString('base64url')}.signature`;
    headers.cookie = `access_token=${token}`;
  }
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}
function destination(res) { return new URL(res.headers.get('location')).pathname; }

test('anonymous protected routes return to their dedicated login portals', () => {
  assert.equal(destination(response('/student/dashboard')), '/login/student');
  assert.equal(destination(response('/admin/dashboard')), '/login/admin');
  assert.equal(destination(response('/change-password')), '/login/student');
});
test('roles cannot enter the other portal in either direction', () => {
  assert.equal(destination(response('/admin/dashboard', { role: 'student' })), '/student/dashboard');
  for (const role of ['admin', 'super_admin']) {
    assert.equal(destination(response('/student/dashboard', { role })), '/admin/dashboard');
  }
});
test('first login is sent to password setup', () => {
  assert.equal(destination(response('/student/dashboard', { role: 'student', mustChangePassword: true })), '/change-password');
  assert.equal(response('/change-password', { role: 'student', mustChangePassword: true }).status, 200);
});
test('active sessions skip login; unknown roles are rejected', () => {
  assert.equal(destination(response('/login/admin', { role: 'super_admin' })), '/admin/dashboard');
  assert.equal(destination(response('/login/student', { role: 'student' })), '/student/dashboard');
  const invalid = response('/admin/dashboard', { role: 'unknown' });
  assert.equal(destination(invalid), '/login');
  assert.match(invalid.headers.get('set-cookie'), /access_token=;/);
});
