import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const typesPath = new URL("../src/types/index.ts", import.meta.url);
const authApiPath = new URL("../src/lib/auth-api.ts", import.meta.url);
const consumerPaths = [
  new URL("../src/app/student/dashboard/page.tsx", import.meta.url),
  new URL("../src/app/student/profile/page.tsx", import.meta.url),
  new URL("../src/app/student/topup/page.tsx", import.meta.url),
  new URL("../src/app/admin/students/page.tsx", import.meta.url),
];

test("frontend models the wallet as a one-to-one account", async () => {
  const [types, authApi] = await Promise.all([
    readFile(typesPath, "utf8"),
    readFile(authApiPath, "utf8"),
  ]);

  assert.match(types, /account\?: Account \| null/);
  assert.doesNotMatch(types, /accounts\?: Account\[\]/);
  assert.match(authApi, /account\?: Account \| null/);
});

test("student and admin pages no longer index an accounts array", async () => {
  const sources = await Promise.all(
    consumerPaths.map((path) => readFile(path, "utf8")),
  );

  for (const source of sources) {
    assert.doesNotMatch(source, /\.accounts\b/);
  }
});

test("transaction type exposes nullable legacy audit snapshots", async () => {
  const types = await readFile(typesPath, "utf8");

  assert.match(types, /balanceBefore: number \| null/);
  assert.match(types, /balanceAfter: number \| null/);
});
