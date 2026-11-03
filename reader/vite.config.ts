import { offlineShell } from '../scripts/offline-shell'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { fileURLToPath } from 'node:url'
export default defineConfig({ resolve: { alias: [{ find: /^.*\/lib\/supabase$/, replacement: fileURLToPath(new URL('./src/organizer-backend.ts', import.meta.url)) }], dedupe: ['react', 'react-dom'] }, plugins: [react(), svgr(), offlineShell('reader', ['/manifest.webmanifest', '/icon.svg'])], server: { fs: { allow: ['..'] } }, test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] } })
