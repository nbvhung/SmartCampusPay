import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3105', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3105',
    url: 'http://127.0.0.1:3105/login/student', reuseExistingServer: true, timeout: 120000,
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3105',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
