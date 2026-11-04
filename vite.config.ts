import { sampleData } from './scripts/sample-data'
import { offlineShell } from './scripts/offline-shell'

import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import { loadEnv } from 'vite'
import { validateBrowserEnv } from './scripts/build-env'
import { brandName, brandTagline } from './src/lib/brand'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  validateBrowserEnv(env)
  const manifest = JSON.stringify({ name: brandName, short_name: brandName, start_url: '/', display: 'standalone', background_color: '#faf8f4', theme_color: '#faf8f4' })
  return {
    plugins: [sampleData(env.VITE_SAMPLE_DATA === 'true'), react(), tailwindcss(), svgr(), offlineShell('organizer', ['/manifest.webmanifest']), {
      name: 'site-branding',
      configureServer(server) {
        server.middlewares.use('/manifest.webmanifest', (_request, response) => {
          response.setHeader('Content-Type', 'application/manifest+json')
          response.end(manifest)
        })
      },
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest }) },
      transformIndexHtml: html => html.replaceAll('__SITE_NAME__', brandName).replaceAll('__SITE_TAGLINE__', brandTagline),
    }],
    // Browser tests need stable pages while reports and other files are written.
    server: { watch: mode === 'e2e' ? null : undefined },
    build: {
      rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] } } },
    },
    test: {
      maxWorkers: 2,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/connected-login/**', 'tests/offline/**', 'reader/tests/browser/**'],
      restoreMocks: true,
    },
  }
})
