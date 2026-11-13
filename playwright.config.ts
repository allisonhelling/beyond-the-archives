import { playwrightOutputDir } from './scripts/playwright-output'
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
    env: { VITE_APP_ENV: 'staging', VITE_SUPABASE_PROJECT_REF: 'ao3-phase1-test', VITE_ORGANIZER_URL: 'https://organizer-test.example/', VITE_READER_URL: 'https://reader-test.example/', VITE_SUPABASE_URL: 'https://ao3-phase1-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_a_real_key' },
  },
})
