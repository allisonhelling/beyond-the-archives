
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import { loadEnv } from 'vite'
import { validateBrowserEnv } from './scripts/build-env'

export default defineConfig(({ mode }) => {
  validateBrowserEnv(loadEnv(mode, process.cwd(), 'VITE_'))
  return {
    plugins: [react(), tailwindcss(), svgr()],
    // Browser tests need stable pages while reports and other files are written.
    server: { watch: mode === 'e2e' ? null : undefined },
    build: {
      rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] } } },
    },
    test: {
      maxWorkers: 2,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['tests/e2e/**', 'node_modules/**'],
      restoreMocks: true,
    },
  }
})
