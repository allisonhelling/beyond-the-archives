import type { Database, Json } from '../../src/types/database'
import { createClient } from '@supabase/supabase-js'
import { readPublicConfig } from '../../src/lib/config'
import { hostedOrganizer } from '../../src/lib/reader-connection'
import { type CloudEdit, type CloudValue } from './cloud-model'
import { defaultPreferences, repairChapterState, type BookDetails, type Preferences } from './model'
import { acceptCloud, all, bookStores, cloudEdits, get, getBookDetails, listCatalog, loadSetting, putBook, readerOwner, saveBook, transaction } from './storage'
import { digest, importEpub } from './epub'

export const readerCloudConfig = readPublicConfig(import.meta.env) ?? hostedOrganizer
const config = readerCloudConfig
export const readerCloud = createClient<Database>(config.url, config.key, {
  auth: { storageKey: 'reader-cloud-auth', flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/')) {
      // Auth can change in another tab during sync. Never send this library's data with a different owner's token.
      const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /i, '')
      let subject: string | undefined
      try { subject = JSON.parse(atob((token?.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))).sub } catch { /* The server still verifies the JWT signature. */ }
      if (!readerOwner || subject !== readerOwner) return Promise.reject(new Error('Reader account changed. Reopen the matching account library before syncing.'))
    }
    const signal = AbortSignal.timeout(120000)
    return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal })
  } },
})
export type CloudConflict = CloudValue & { edit: CloudEdit }
export async function switchLibrary(owner: string) {
  if (owner === readerOwner) return
  localStorage.setItem('reader-cloud-owner', owner)
  location.reload()
}
async function requireOwner() {
  const { data, error } = await readerCloud.auth.getSession()
  if (error) throw error
  if (!readerOwner || data.session?.user.id !== readerOwner) throw new Error('Sign in to this library’s reader account to sync. Downloaded books remain available offline.')
  const access = await readerCloud.from('reader_app_access').select('user_id').eq('user_id', readerOwner).maybeSingle()
  if (access.error) throw access.error
  if (!access.data) throw new Error('Reader cloud access has not been granted. Ask the application owner for reader access.')
}
function path(id: string) { return `${readerOwner}/${id}.epub` }
async function upload(id: string) {
  if (await loadSetting(`cloud-file:${id}`)) return
  const content = await get<{file: Blob}>('contents', id)
  if (!content?.file) return
  const result = await readerCloud.storage.from('reader-epubs').upload(path(id), content.file, { contentType: 'application/epub+zip', upsert: false })
  if (result.error && String(result.error.statusCode) !== '409') throw result.error
  await transaction(['settings'], tx => tx.objectStore('settings').put({id:`cloud-file:${id}`,value:true}))
}
let running: Promise<CloudConflict[]> | undefined
export function syncCloud(): Promise<CloudConflict[]> {
  if (!readerOwner || !navigator.onLine) return Promise.resolve([])
  if (!running) running = (async () => navigator.locks ? await navigator.locks.request(`reader-cloud:${readerOwner}`, performSync) : await performSync())().finally(() => { running = undefined })
  return running!
}
async function performSync(): Promise<CloudConflict[]> {
  await requireOwner()
  const conflicts: CloudConflict[] = []
  // Persist the precise request before network IO: a lost response retries the same mutation ID.
  let flight = await loadSetting<CloudEdit>('cloud-flight')
  const handled = new Set<string>()
  while (true) {
    const edit = flight ?? (await cloudEdits()).find(edit => !handled.has(edit.key))
    if (!edit) break
    if (edit.key !== 'preferences') await upload(edit.key.split('/')[0])
    if (!flight) {
      await transaction(['settings'], tx => tx.objectStore('settings').put({ id:'cloud-flight', value:edit }))
      flight = edit
    }
    const {data,error} = await readerCloud.rpc('reader_cloud_apply', {p_id:edit.id,p_key:edit.key,p_value:edit.value as Json,p_base:edit.base})
    if (error) throw error
    handled.add(edit.key)
    const result=data as CloudValue & {conflict?:boolean}
    if (result.conflict) {
      conflicts.push({...result,edit})
    } else await acceptCloud(result, edit)
    await transaction(['settings'], tx => tx.objectStore('settings').delete('cloud-flight'))
    flight = undefined
  }
  // Keyset pagination avoids the API's default 1000-row truncation, including history events.
  let after = ''
  const rows: CloudValue[] = []
  while (true) {
    const {data,error} = await readerCloud.from('reader_cloud_values').select('key,value,revision').gt('key',after).order('key').limit(500)
    if (error) throw error
    rows.push(...data as unknown as CloudValue[])
    if (data.length < 500) break
    after = data.at(-1)!.key
  }
  rows.sort((a,b) => Number(b.key.endsWith('/manifest')) - Number(a.key.endsWith('/manifest')))
  for (const row of rows) await applyRemote(row)
  return conflicts
}
async function applyRemote(row: CloudValue) {
  await transaction(['books','catalog','settings'], tx => {
    const store = tx.objectStore('settings'), baseline = store.get(`cloud-base:${row.key}`), dirty = store.get(`cloud-edit:${row.key}`)
    dirty.onsuccess = () => {
      if (dirty.result || baseline.result?.value?.revision === row.revision) return
      store.put({id:`cloud-base:${row.key}`,value:row})
      if (row.key === 'preferences') {
        const prefs = store.get('preferences')
        prefs.onsuccess = () => store.put({id:'preferences',value:{...defaultPreferences,...row.value as Preferences,tagSyncAccount:prefs.result?.value?.tagSyncAccount}})
        return
      }
      const [id,field] = row.key.split('/'), request = tx.objectStore('books').get(id)
      request.onsuccess = () => {
        const current = request.result as BookDetails | undefined
        if (field === 'manifest') {
          const manifest = row.value as Omit<BookDetails,'hasFile'>
          putBook(tx, current ? {...current,...manifest,id} : {...manifest,id,hasFile:false,position:{chapter:manifest.chapters[0]?.id ?? '',fraction:0},history:[],completed:[],notes:'',status:'to_read',active:true}, true)
        } else if (current) {
          const next = field.startsWith('history:') ? {...current,history:[...current.history.filter(event => event.id !== field.slice(8)),row.value as BookDetails['history'][number]]} : {...current,[field]:row.value}
          putBook(tx,next,true)
        }
      }
    }
  })
}
export async function resolveCloud(conflict: CloudConflict, useLocal: boolean) {
  await transaction(['settings'], tx => tx.objectStore('settings').put({id:`cloud-conflict:${conflict.edit.id}:${useLocal ? 'cloud' : 'device'}`,value:useLocal ? {...conflict.edit,value:conflict.value} : conflict.edit}))
  if (useLocal) {
    await transaction(['settings'],tx => {
      const store=tx.objectStore('settings'), request=store.get(`cloud-edit:${conflict.key}`)
      request.onsuccess=()=> { if(request.result) store.put({...request.result,value:{...request.result.value,id:crypto.randomUUID(),base:conflict.revision}}) }
    })
  } else {
    // Keep the discarded local variant for recovery, including notes and positions.
    await transaction(['settings'],tx => {
      const store=tx.objectStore('settings'), request=store.get(`cloud-edit:${conflict.key}`)
      request.onsuccess=()=> {
        if(request.result?.value.id !== conflict.edit.id) return
        store.delete(`cloud-edit:${conflict.key}`)
      }
    })
    await applyRemote(conflict)
  }
}
export async function downloadCloud(id: string) {
  await requireOwner()
  const details = await getBookDetails(id)
  if (!details) throw new Error('Refresh the cloud bookshelf first.')
  const {data,error}=await readerCloud.storage.from('reader-epubs').download(path(id))
  if(error) throw error
  if(await digest(await data.arrayBuffer()) !== id) throw new Error('The downloaded EPUB hash does not match this version.')
  const imported=await importEpub(new File([data],`${id}.epub`,{type:'application/epub+zip'}))
  await transaction(bookStores,tx=>{
    const request=tx.objectStore('books').get(id)
    request.onsuccess=()=>{
      const current=request.result as BookDetails | undefined
      if(!current) return
      const repaired=current.chapterVersion !== imported.chapterVersion
      putBook(tx,{...imported,...current,...(repaired ? repairChapterState(current,imported.chapters) : {}),file:data,resources:imported.resources,chapters:imported.chapters,chapterVersion:imported.chapterVersion},!repaired)
    }
    tx.objectStore('settings').put({id:`cloud-file:${id}`,value:true})
  })
}
export async function importGuestLibrary() {
  await requireOwner()
  const guest=await new Promise<IDBDatabase|undefined>((resolve,reject)=>{const request=indexedDB.open('bta-reader');request.onupgradeneeded=()=>{request.transaction!.abort();resolve(undefined)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
  if(!guest) return
  try {
    const rows=await new Promise<BookDetails[]>((resolve,reject)=>{const request=guest.transaction('books').objectStore('books').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
    const activeWorks=new Set((await listCatalog()).filter(book=>book.active && book.workId).map(book=>book.workId))
    for(const details of rows) {
      if(await getBookDetails(details.id)) continue
      const content=guest.objectStoreNames.contains('contents') ? await new Promise<Record<string,unknown>|undefined>((resolve,reject)=>{const request=guest.transaction('contents').objectStore('contents').get(details.id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)}) : undefined
      const {account:_account,remote:_remote,...local}=details
      void _account;void _remote
      const imported={...local,active:local.active && (!local.workId || !activeWorks.has(local.workId))}
      await saveBook(content ? {...imported,...content} as Parameters<typeof saveBook>[0] : imported)
      if(imported.active && imported.workId) activeWorks.add(imported.workId)
    }
  } finally {guest.close()}
}
export async function cloudShelf() {return (await listCatalog()).filter(book=>!book.hasFile)}
export async function savedConflicts() {return (await all<{id:string;value:CloudEdit}>('settings','cloud-conflict:')).filter(row=>row.id.startsWith('cloud-conflict:')).map(row=>row.value)}
