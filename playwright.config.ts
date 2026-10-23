import { defineConfig, devices } from '@playwright/test'

/** See https://playwright.dev/docs/test-configuration. */
export default defineConfig({
  testDir: './dev',
  testMatch: '**/e2e.spec.{ts,js}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    reuseExistingServer: true,
    url: 'http://localhost:3002/admin',
  },
})
