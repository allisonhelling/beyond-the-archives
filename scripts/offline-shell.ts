import type { Plugin } from 'rollup'

/** Both applications cache only their own interface assets, never backend requests. */
export function offlineShell(prefix: string, extraFiles: string[] = []): Pick<Plugin, 'name' | 'generateBundle'> {
  return {
    name: `${prefix}-offline-shell`,
    generateBundle(_, bundle) {
      const files = ['/index.html', ...extraFiles, ...Object.keys(bundle).map(path => `/${path}`)]
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `const CACHE='${prefix}-${Date.now()}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('${prefix}-')).sort().reverse().slice(2).filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store',signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)throw new Error('Navigation unavailable');return r}).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html')).then(r=>{if(!r)throw new Error('Offline shell unavailable');return r})));return}if(FILES.includes(new URL(e.request.url).pathname)||new URL(e.request.url).pathname.startsWith('/assets/'))e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request,{ignoreVary:true}))||(await caches.match(e.request,{ignoreVary:true}))||fetch(e.request)))});` })
    },
  }
}
