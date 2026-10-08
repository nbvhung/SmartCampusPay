import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const changePasswordPage = readFileSync(
  new URL("../src/app/(auth)/change-password/page.tsx", import.meta.url),
  "utf8",
);
const authApi = readFileSync(
  new URL("../src/lib/auth-api.ts", import.meta.url),
  "utf8",
);

test("mandatory password change submits current and new passwords", () => {
  assert.match(changePasswordPage, /name="oldPassword"/);
  assert.match(changePasswordPage, /autoComplete="current-password"/);
  assert.match(
    changePasswordPage,
    /authApi\.changePassword\(\{\s*oldPassword,\s*newPassword\s*\}\)/s,
  );
  assert.match(
    authApi,
    /changePassword:\s*\(data:\s*\{\s*oldPassword:\s*string;\s*newPassword:\s*string\s*\}\)/s,
  );
});

test("successful password change clears client auth state and returns to login", () => {
  assert.match(changePasswordPage, /setUser\(null\)/);
  assert.match(changePasswordPage, /setMustChangePassword\(false\)/);
  assert.match(changePasswordPage, /router\.replace\(loginPath\)/);
  assert.doesNotMatch(changePasswordPage, /authApi\.(?:login|adminLogin)\s*\(/);
});

test("password change validates confirmation and rejects password reuse in the UI", () => {
  assert.match(changePasswordPage, /newPassword\s*!==\s*confirmPassword/);
  assert.match(changePasswordPage, /oldPassword\s*===\s*newPassword/);
  assert.match(changePasswordPage, /Mật khẩu mới phải khác mật khẩu hiện tại/);
});
