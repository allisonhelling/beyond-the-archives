import { defineConfig } from '@playwright/test'
import base from './playwright.config'
import { browserTestEnv } from './scripts/playwright-env'

const organizer = 'http://127.0.0.1:4173', reader = 'http://127.0.0.1:4174'
const env = browserTestEnv
export default defineConfig({
 ...base,
 testDir: './tests/connected-login',
 webServer: [
  { command: 'npm run dev -- --port 4173 --strictPort --mode e2e', url: organizer, reuseExistingServer: false, env },
  { command: 'npm run dev --prefix reader -- --port 4174 --strictPort', url: reader, reuseExistingServer: false, env },
 ],
})
