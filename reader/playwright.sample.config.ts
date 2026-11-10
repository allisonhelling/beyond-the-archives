import { defineConfig, devices } from '@playwright/test'
import { playwrightOutputDir } from '../scripts/playwright-output'
export default defineConfig({
  outputDir: playwrightOutputDir('reader-sample'),
  testDir: './tests/sample', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4194' },
  projects: [{ name: 'desktop', use: devices['Desktop Chrome'] }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  webServer: { command: 'npm run dev:sample -- --port 4194 --strictPort', url: 'http://127.0.0.1:4194', reuseExistingServer: false },
})
