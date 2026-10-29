import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({ resolve: { dedupe: ['react', 'react-dom'] }, plugins: [react(), {
  name: 'offline-shell',
  generateBundle(_, bundle) {
    const files = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', ...Object.keys(bundle).map(path => `/${path}`)]
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: `const CACHE='reader-${Date.now()}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('reader-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{if(e.request.mode==='navigate')return (await c.match('/index.html'))||fetch(e.request);return (await c.match(e.request,{ignoreVary:true}))||fetch(e.request)}))});` })
  },
}], server: { fs: { allow: ['..'] } }, test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] } })
