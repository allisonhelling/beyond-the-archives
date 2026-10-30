import { playwrightOutputDir } from '../scripts/playwright-output'
import { defineConfig } from '@playwright/test'
export default defineConfig({ outputDir: playwrightOutputDir('reader'), testDir: './tests/browser', use: { baseURL: 'http://127.0.0.1:4174', headless: true }, webServer: { command: 'npm run preview', url: 'http://127.0.0.1:4174', reuseExistingServer: false }, workers: 1 })
