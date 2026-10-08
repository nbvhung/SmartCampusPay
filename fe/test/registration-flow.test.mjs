import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registerPage = readFileSync(
  new URL("../src/app/(auth)/register/page.tsx", import.meta.url),
  "utf8",
);
const authApi = readFileSync(
  new URL("../src/lib/auth-api.ts", import.meta.url),
  "utf8",
);
const adminStudents = readFileSync(
  new URL("../src/app/admin/students/page.tsx", import.meta.url),
  "utf8",
);

test("registration frontend uses the Phase 1 backend contract without auto login", () => {
  assert.match(authApi, /\/auth\/register\/request-otp/);
  assert.match(authApi, /\/auth\/register\/verify/);
  assert.match(registerPage, /authApi\.requestRegistrationOtp/);
  assert.match(registerPage, /authApi\.verifyRegistration/);
  assert.doesNotMatch(registerPage, /authApi\.(?:login|adminLogin)\s*\(/);
  assert.match(registerPage, /router\.replace\(['"]\/login\/student['"]\)/);
});

test("registration UI keeps the challenge in memory and handles OTP lifecycle states", () => {
  assert.match(registerPage, /useState\(['"]['"]\).*registrationId/s);
  assert.doesNotMatch(registerPage, /localStorage|sessionStorage/);
  assert.match(registerPage, /resendAfterSeconds/);
  assert.match(registerPage, /OTP_EXPIRED/);
  assert.match(registerPage, /OTP_ATTEMPTS_EXHAUSTED/);
  assert.match(registerPage, /Đăng ký thành công/);
});

test("admin production provisioning only submits MSSV and physical Card UID", () => {
  assert.match(
    adminStudents,
    /studentApi\.create\(\{\s*studentCode:\s*formData\.studentCode,\s*cardUid:\s*formData\.cardUid,?\s*\}\)/s,
  );
  assert.match(adminStudents, /không tạo hồ sơ/i);
  assert.match(adminStudents, /mật[\s\S]*khẩu[\s\S]*tài khoản ví/i);
});
