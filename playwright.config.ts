import { playwrightOutputDir } from './scripts/playwright-output'
import { browserTestEnv } from './scripts/playwright-env'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  outputDir: playwrightOutputDir('e2e'),
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort --mode e2e',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: { ...browserTestEnv, VITE_SAMPLE_DATA: process.env.VITE_SAMPLE_DATA ?? 'false' },
  },
})
