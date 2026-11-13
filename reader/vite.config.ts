import { loadEnv } from 'vite'
import { validateBrowserEnv } from '../scripts/build-env'
import { sampleData } from '../scripts/sample-data'
import { isReaderSampleSnapshot } from './src/sample/snapshot'
import { offlineShell } from '../scripts/offline-shell'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { fileURLToPath } from 'node:url'
export default defineConfig(({ mode, command }) => {
 const env = loadEnv(mode, process.cwd(), 'VITE_')
 validateBrowserEnv(env, mode !== 'test' && !(command === 'serve' && env.VITE_SAMPLE_DATA === 'true'), process.env.VERCEL_ENV, command === 'build')
 return ({ resolve: { alias: [{ find: /^.*\/lib\/supabase$/, replacement: fileURLToPath(new URL('./src/organizer-backend.ts', import.meta.url)) }], dedupe: ['react', 'react-dom'] }, plugins: [sampleData(loadEnv(mode, process.cwd(), 'VITE_').VITE_SAMPLE_DATA === 'true', { path: 'src/sample/default-state.json', validate: isReaderSampleSnapshot }), react(), svgr(), offlineShell('reader', ['/manifest.webmanifest', '/icon.svg'])], server: { fs: { allow: ['..'] } }, test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] } })
})
