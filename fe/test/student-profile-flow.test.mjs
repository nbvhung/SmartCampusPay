import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profilePath = new URL(
  "../src/app/student/profile/page.tsx",
  import.meta.url,
);
const apiPath = new URL("../src/lib/student-api.ts", import.meta.url);

test("student API exposes authenticated self-profile endpoints", async () => {
  const source = await readFile(apiPath, "utf8");

  assert.match(
    source,
    /getMe:\s*\(\)\s*=>\s*api\.get<ApiResponse<Student>>\(["']\/students\/me["']\)/,
  );
  assert.match(
    source,
    /updateMe:[\s\S]*api\.patch<ApiResponse<Student>>\(["']\/students\/me["'], data\)/,
  );
});

test("profile form edits only the approved profile fields", async () => {
  const source = await readFile(profilePath, "utf8");

  assert.match(source, /studentApi\.getMe\(\)/);
  assert.match(source, /studentApi\.updateMe\(payload\)/);
  assert.match(source, /fullName:\s*student\.fullName/);
  assert.match(source, /email:\s*student\.email/);
  assert.match(source, /faculty:\s*student\.faculty/);
  assert.match(source, /dateOfBirth:\s*student\.dateOfBirth/);
  assert.doesNotMatch(source, /studentApi\.updateMe\([^)]*studentCode/);
  assert.doesNotMatch(source, /studentApi\.updateMe\([^)]*phone/);
});

test("profile UI handles incomplete state and readonly identity", async () => {
  const source = await readFile(profilePath, "utf8");

  assert.match(source, /student\.profileCompletedAt\s*\?/);
  assert.match(source, /Chưa hoàn thiện/);
  assert.match(source, /student\.fullName \|\| ["']Chưa cập nhật["']/);
  assert.match(source, /student\.email \|\| ["']Chưa cập nhật["']/);
  assert.match(source, /student\.faculty \|\| ["']Chưa cập nhật["']/);
  assert.match(source, /student\.phone \|\| ["']Chưa cập nhật["']/);
});
