import { offlineShell } from '../scripts/offline-shell'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({ resolve: { dedupe: ['react', 'react-dom'] }, plugins: [react(), offlineShell('reader', ['/manifest.webmanifest', '/icon.svg'])], server: { fs: { allow: ['..'] } }, test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] } })
