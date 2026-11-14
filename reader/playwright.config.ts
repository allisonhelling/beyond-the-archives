import { playwrightOutputDir } from '../scripts/playwright-output'
import { defineConfig } from '@playwright/test'
import { browserTestEnv } from '../scripts/playwright-env'
export default defineConfig({ outputDir: playwrightOutputDir('reader'), testDir: './tests/browser', use: { baseURL: browserTestEnv.VITE_READER_URL, headless: true }, webServer: { command: 'npm run build && npm run preview -- --strictPort', url: browserTestEnv.VITE_READER_URL, reuseExistingServer: false, env: browserTestEnv }, workers: 1 })
