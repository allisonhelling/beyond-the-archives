import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/offline', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4183' },
  webServer: { command: 'npm run preview -- --port 4183 --strictPort', url: 'http://127.0.0.1:4183', reuseExistingServer: false },
})
