import { playwrightOutputDir } from './scripts/playwright-output'
import { defineConfig } from '@playwright/test'
import { browserTestEnv } from './scripts/playwright-env'
export default defineConfig({
  outputDir: playwrightOutputDir('offline'),
  testDir: './tests/offline', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4183' },
  webServer: { command: 'npm run build && npm run preview -- --port 4183 --strictPort', url: 'http://127.0.0.1:4183', reuseExistingServer: false, env: { ...browserTestEnv, VITE_ORGANIZER_URL: 'http://127.0.0.1:4183' } },
})
