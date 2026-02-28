import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Prefer new canonical location `test/e2e` but fall back to legacy `test/tests/e2e`.
const baseDir = process.cwd()
const preferred = path.join(baseDir, 'test', 'e2e')
const legacy = path.join(baseDir, 'test', 'tests', 'e2e')
const testDir = fs.existsSync(preferred) ? './test/e2e' : './test/tests/e2e'

export default defineConfig({
  testDir: testDir,
  outputDir: 'reports/test-results',
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
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'reports/playwright-report' }],
  ],
  globalSetup: `${testDir}/global-setup.ts`,
  globalTeardown: `${testDir}/global-teardown.ts`,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
