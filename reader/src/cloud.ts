import { authSessionStorage } from '../../src/lib/auth-session-storage'
import { chapterContent, retainedContents, withAnthologyMetadata } from './anthology'
import { initialAuthIntent } from '../../src/lib/auth-account'
import type { Database, Json } from '../../src/types/database'
import { createClient } from '@supabase/supabase-js'
import { readPublicConfig } from '../../src/lib/config'
import { enableOrganizerSync, hostedOrganizer } from '../../src/lib/reader-connection'
import { type CloudEdit, type CloudValue } from './cloud-model'
import { isAnthology, retainWorkLinks, defaultPreferences, withReadingProgress, type Connection, repairChapterState, type BookDetails, type Preferences } from './model'
import { readerInstallationId, acceptCloud, all, bookStores, cloudEdits, eraseBook, get, getBookDetails, listCatalog, loadSetting, putBook, readerOwner, restoreDeletedVersion, transaction } from './storage'
import { digest, importEpub } from './epub'

export const readerCloudConfig = readPublicConfig(import.meta.env) ?? hostedOrganizer
const config = readerCloudConfig
export const readerCloud = createClient<Database>(config.url, config.key, {
  auth: { storage: authSessionStorage('reader'), storageKey: 'reader-cloud-auth', flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/')) {
      // Auth can change in another tab during sync. Never send this library's data with a different owner's token.
      const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /i, '')
      let subject: string | undefined
      try { subject = JSON.parse(atob((token?.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))).sub } catch { /* The server still verifies the JWT signature. */ }
      let adopting=false
      if(url.pathname==='/rest/v1/rpc/reader_organizer_connection' && typeof init?.body==='string'){
        try {adopting=JSON.parse(init.body).p_action==='enable'} catch { /* Invalid bodies still fail closed. */ }
      }
      // Adoption can run before switching out of a guest library; the RPC verifies the paired owner.
      const accountSetting = ['/rest/v1/rpc/account_has_password', '/rest/v1/rpc/manage_account_username'].includes(url.pathname)
      if (!adopting && !accountSetting && (!readerOwner || subject !== readerOwner)) return Promise.reject(new Error('Reader account changed. Reopen the matching account library before syncing.'))
    }
    const signal = AbortSignal.timeout(120000)
    return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal })
  } },
})
export let readerAuthIntent = initialAuthIntent
export function clearReaderAuthIntent() {readerAuthIntent=null}
readerCloud.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')readerAuthIntent='recovery'})
async function organizerSession(connection: Connection) {
  const { data, error } = await readerCloud.auth.getSession()
  if (error) throw error
  if (!data.session) return null
  if(connection.backend.replace(/\/$/,'') !== config.url.replace(/\/$/,''))throw new Error('Sign in to the reader account for the connected organizer project.')
  return data.session
}
export async function validateOrganizerConnection(connection: Connection) {
  if (!readerOwner) throw new Error('Sign in to your reader account to connect an organizer. Guest reading stays local.')
  const session = await organizerSession(connection)
  if (session?.user.id !== readerOwner) throw new Error('Sign in to this reader account before connecting its organizer.')
  const { error } = await readerCloud.rpc('reader_organizer_connection', { p_action: 'validate', p_secret: connection.secret })
  if (error) throw new Error(error.message)
}
export async function rememberOrganizerConnection(connection?: Connection) {
  if (!connection) return
  const session = await organizerSession(connection)
  if (!session) return
  const installation=await readerInstallationId()
  const { error } = await readerCloud.rpc('reader_organizer_connection', { p_action:'enable', p_secret:connection.secret, p_installation:installation })
  if (error) throw new Error(error.message)
  await transaction(['settings'],tx=>{tx.objectStore('settings').put({id:'organizer-account-link',value:session.user.id});tx.objectStore('settings').delete('organizer-disabled-here')})
}
export async function restoreOrganizerConnection(existing?: Connection): Promise<Connection | undefined> {
  if (!readerOwner) return undefined
  const { data } = await readerCloud.auth.getSession()
  if (data.session?.user.id !== readerOwner) return undefined
  if(await loadSetting<boolean>('organizer-disabled-here'))return undefined
  const managed=existing?.account.startsWith('organizer:') || await loadSetting<string>('organizer-account-link')===readerOwner
  if(existing && !managed){await rememberOrganizerConnection(existing);return existing}
  const status=await readerCloud.rpc('reader_organizer_connection',{p_action:'status'})
  if(status.error)throw new Error(status.error.message)
  if (!(status.data as {enabled?:boolean})?.enabled) {
    await enableOrganizerSync(readerCloud)
  }
  if(existing && (!existing.expiresAt || Date.parse(existing.expiresAt)>Date.now())) {
    const checked = await readerCloud.rpc('reader_organizer_connection', {p_action:'validate',p_secret:existing.secret})
    if (!checked.error) return existing
    if (checked.error.code !== '42501') throw new Error(checked.error.message)
  }
  const installation=await readerInstallationId()
  const result=await readerCloud.rpc('reader_organizer_connection',{p_action:'restore',p_installation:installation})
  if(result.error)throw new Error(result.error.message)
  const value=result.data as {secret?:string;userId?:string;expiresAt?:string|null}
  if(!value.secret||value.userId!==readerOwner)throw new Error('Organizer connection could not be restored.')
  const next:Connection={expiresAt:value.expiresAt,backend:config.url.replace(/\/$/,''),key:config.key,secret:value.secret,account:existing?.account ?? `organizer:${readerOwner}`,name:'My Organizer',label:new URL(config.url).hostname}
  await transaction(['settings'],tx=>tx.objectStore('settings').put({id:'connection',value:next}))
  return next
}
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
export function syncCloud(fresh = false): Promise<CloudConflict[]> {
  if (!readerOwner || !navigator.onLine) return Promise.resolve([])
  // Import acknowledgement must see writes committed after an existing sync started.
  if (fresh && running) return running.then(() => syncCloud())
  if (!running) running = (async () => navigator.locks ? await navigator.locks.request(`reader-cloud:${readerOwner}`, performSync) : await performSync())().finally(() => { running = undefined })
  return running!
}
async function performSync(): Promise<CloudConflict[]> {
  await requireOwner()
  for (const row of await readCloudValues(true)) await applyRemote(row)
  const conflicts: CloudConflict[] = []
  // Persist the precise request before network IO: a lost response retries the same mutation ID.
  let flight = await loadSetting<CloudEdit>('cloud-flight')
  const handled = new Set<string>()
  while (true) {
    const edit = flight ?? (await cloudEdits()).sort((a,b) => Number(b.key.endsWith('/deleted')) - Number(a.key.endsWith('/deleted'))).find(edit => !handled.has(edit.key))
    if (!edit) break
    if (edit.key !== 'preferences' && !edit.key.endsWith('/deleted')) await upload(edit.key.split('/')[0])
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
    } else if (result.key.endsWith('/deleted') && result.value === true) {
      // A stale device edit can receive a tombstone instead of its requested field.
      await applyRemote(result)
      await acceptCloud(result, edit)
    } else await acceptCloud(result, edit)
    await transaction(['settings'], tx => tx.objectStore('settings').delete('cloud-flight'))
    flight = undefined
  }
  const rows = await readCloudValues()
  rows.sort((a,b) => Number(b.key.endsWith('/deleted')) - Number(a.key.endsWith('/deleted')) || Number(b.key.endsWith('/manifest')) - Number(a.key.endsWith('/manifest')))
  for (const row of rows) await applyRemote(row)
  return conflicts
}
async function readCloudValues(deletionsOnly = false) {
  // Keyset pagination avoids truncating state, history, or deletion markers.
  let after = ''
  const rows: CloudValue[] = []
  while (true) {
    let query = readerCloud.from('reader_cloud_values').select('key,value,revision').gt('key',after).order('key').limit(500)
    if (deletionsOnly) query = query.like('key','%/deleted')
    const {data,error} = await query
    if (error) throw error
    rows.push(...data as unknown as CloudValue[])
    if (data.length < 500) break
    after = data.at(-1)!.key
  }
  return rows
}
async function applyRemote(row: CloudValue) {
  if (row.key.endsWith('/deleted') && row.value === true) {
    const dirty = await loadSetting<CloudEdit>(`cloud-edit:${row.key}`)
    if (dirty?.value === false) return
    const baseline = await loadSetting<CloudValue>(`cloud-base:${row.key}`)
    if (baseline?.revision === row.revision && !dirty && !await getBookDetails(row.key.split('/')[0])) return
    if (baseline?.revision !== row.revision || dirty) {
      const removed = await readerCloud.storage.from('reader-epubs').remove([path(row.key.split('/')[0])])
      if (removed.error) throw removed.error
    }
  }
  await transaction([...bookStores,'pending'], tx => {
    const store = tx.objectStore('settings'), deletion = row.key !== 'preferences' ? store.get(`cloud-base:${row.key.split('/')[0]}/deleted`) : undefined, deleting = row.key !== 'preferences' ? store.get(`cloud-edit:${row.key.split('/')[0]}/deleted`) : undefined, baseline = store.get(`cloud-base:${row.key}`), dirty = store.get(`cloud-edit:${row.key}`)
    dirty.onsuccess = () => {
      if (row.key.endsWith('/deleted') && row.value === true) {
        if (dirty.result?.value.value === false) return
        eraseBook(tx, row.key.split('/')[0], () => store.put({id:`cloud-base:${row.key}`,value:row}))
        return
      }
      if (!row.key.endsWith('/deleted') && (deletion?.result?.value.value === true || deleting?.result?.value.value === true)) return
      if (dirty.result || baseline.result?.value?.revision === row.revision) return
      store.put({id:`cloud-base:${row.key}`,value:row})
      if (row.key === 'preferences') {
        const prefs = store.get('preferences')
        prefs.onsuccess = () => store.put({id:'preferences',value:{...defaultPreferences,...row.value as Preferences,tagSyncAccount:prefs.result?.value?.tagSyncAccount}})
        return
      }
      if (row.key.endsWith('/deleted')) return
      const [id,field] = row.key.split('/'), request = tx.objectStore('books').get(id)
      request.onsuccess = () => {
        const current = request.result as BookDetails | undefined
        if (field === 'manifest') {
          const manifest = row.value as Omit<BookDetails,'hasFile'>
          putBook(tx, current ? withAnthologyMetadata({...current,...manifest,id,works:retainWorkLinks(manifest.works,current.works),workId:isAnthology(manifest) ? null : current.workId ?? manifest.workId ?? null}) : {...manifest,id,hasFile:false,position:{chapter:manifest.chapters[0]?.id ?? '',fraction:0},history:[],completed:[],notes:'',status:'to_read',active:true}, true)
        } else if (current) {
          const next = field.startsWith('history:') ? {...current,history:[...current.history.filter(event => event.id !== field.slice(8)),row.value as BookDetails['history'][number]]} : {...current,[field]:row.value}
          putBook(tx,field === 'progress' && typeof row.value === 'number' && !isAnthology(next) ? withReadingProgress(next,row.value) : next,true)
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
      const workId=current.workId ?? imported.workId, identified=workId !== current.workId
      const chapters = retainedContents(current,imported.chapters)
      putBook(tx,withAnthologyMetadata({...imported,...current,metadata:repaired && isAnthology(imported) && !current.contentsReviewed ? imported.metadata : current.metadata,works:current.contentsReviewed ? current.works : retainWorkLinks(imported.works,current.works),workId,...(repaired ? repairChapterState(current,chapters) : {}),file:data,resources:imported.resources,chapters:chapterContent(imported.chapters,chapters),chapterVersion:imported.chapterVersion}),!repaired && !identified)
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
      if ((await loadSetting<CloudEdit>(`cloud-edit:${details.id}/deleted`))?.value === true) throw new Error('Cloud deletion of this EPUB is pending. Sync the account before importing this version again.')
      await transaction(bookStores,tx => {
        restoreDeletedVersion(tx, details.id)
        putBook(tx,content ? {...imported,...content} as Parameters<typeof putBook>[1] : imported)
      })
      if(imported.active && imported.workId) activeWorks.add(imported.workId)
    }
  } finally {guest.close()}
}
export async function cloudShelf() {return (await listCatalog()).filter(book=>!book.hasFile)}
export async function savedConflicts() {return (await all<{id:string;value:CloudEdit}>('settings','cloud-conflict:')).filter(row=>row.id.startsWith('cloud-conflict:')).map(row=>row.value)}
