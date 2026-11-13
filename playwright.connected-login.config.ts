import { defineConfig } from '@playwright/test'
import base from './playwright.config'

const organizer = 'http://127.0.0.1:4173', reader = 'http://127.0.0.1:4174'
const env = {
 VITE_APP_ENV: 'local', VITE_SUPABASE_PROJECT_REF: 'local',
 VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
 VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_a_real_key',
 VITE_ORGANIZER_URL: organizer, VITE_READER_URL: reader,
}
export default defineConfig({
 ...base,
 testDir: './tests/connected-login',
 webServer: [
  { command: 'npm run dev -- --port 4173 --strictPort --mode e2e', url: organizer, reuseExistingServer: false, env },
  { command: 'npm run dev --prefix reader -- --port 4174 --strictPort', url: reader, reuseExistingServer: false, env },
 ],
})
