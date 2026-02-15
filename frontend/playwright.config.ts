import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'reports/playwright-report' }],
  ],
  globalSetup: './test/tests/e2e/global-setup.ts',
  globalTeardown: './test/tests/e2e/global-teardown.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
