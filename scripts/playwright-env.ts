// Synthetic local identity shared by browser servers and their mocked transports.
export const browserTestEnv = {
  VITE_APP_ENV: 'local', VITE_SUPABASE_PROJECT_REF: 'local',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_a_real_key',
  VITE_ORGANIZER_URL: 'http://127.0.0.1:4173',
  VITE_READER_URL: 'http://127.0.0.1:4174',
  VITE_SAMPLE_DATA: 'false',
}

// Hosted companion artifacts still require HTTPS staging identities at build time.
export const hostedBrowserTestEnv = {
  ...browserTestEnv,
  VITE_APP_ENV: 'staging', VITE_SUPABASE_PROJECT_REF: 'userscript-test',
  VITE_SUPABASE_URL: 'https://userscript-test.supabase.co',
  VITE_ORGANIZER_URL: 'https://library-test.example',
  VITE_READER_URL: 'https://reader-test.example',
}
