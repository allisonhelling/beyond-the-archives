import { loadEnv } from 'vite'
import { validateBrowserEnv } from '../scripts/build-env'
import { sampleData } from '../scripts/sample-data'
import { isReaderSampleSnapshot } from './src/sample/snapshot'
import { offlineShell } from '../scripts/offline-shell'
import { siteBranding } from '../scripts/site-branding'
import { readerBrandName, readerBrandTagline, readerShortName } from '../src/lib/brand'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { fileURLToPath } from 'node:url'
export default defineConfig(({ mode, command }) => {
 const env = loadEnv(mode, process.cwd(), 'VITE_')
 validateBrowserEnv(env, mode !== 'test' && !(command === 'serve' && env.VITE_SAMPLE_DATA === 'true'), process.env, command === 'build')
 return {
  resolve: { alias: [{ find: /^.*\/lib\/supabase$/, replacement: fileURLToPath(new URL('./src/organizer-backend.ts', import.meta.url)) }], dedupe: ['react', 'react-dom'] },
  plugins: [sampleData(env.VITE_SAMPLE_DATA === 'true', { path: 'src/sample/default-state.json', validate: isReaderSampleSnapshot }), react(), svgr(),
   offlineShell('reader', ['/manifest.webmanifest', '/icon.svg']),
   siteBranding(readerBrandName, readerBrandTagline, {
    installedName: readerShortName, scope: '/', background_color: '#fcf7f5', theme_color: '#970000',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
   }),
  ],
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
 }
})
