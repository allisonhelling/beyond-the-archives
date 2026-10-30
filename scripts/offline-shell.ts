import type { Plugin } from 'rollup'

/** Both applications cache only their own interface assets, never backend requests. */
export function offlineShell(prefix: string, extraFiles: string[] = []): Pick<Plugin, 'name' | 'generateBundle'> {
  return {
    name: `${prefix}-offline-shell`,
    generateBundle(_, bundle) {
      const files = ['/index.html', ...extraFiles, ...Object.keys(bundle).map(path => `/${path}`)]
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `const CACHE='${prefix}-${Date.now()}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('${prefix}-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(caches.open(CACHE).then(c=>c.match('/index.html')).then(r=>r||fetch(e.request)));return}if(FILES.includes(new URL(e.request.url).pathname))e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request,{ignoreVary:true}))||fetch(e.request)))});` })
    },
  }
}
