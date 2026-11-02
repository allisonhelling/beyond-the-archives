import { readerCloud, readerCloudConfig, syncCloud } from './cloud'
import { digest } from './epub'
import { importedVersion, prepareImport, writeImport } from './import-books'
import type { ReaderMetadata } from './model'
import { all, bookStores, getBookDetails, putBook, loadSetting, readerOwner, setting, transaction } from './storage'

export type TransferPair = { version: 1; id: string; token: string; device: string; label: string; account: string; cloud: boolean; origin: string; cloud_url?: string; local_url: string; mode: 'Automatic' | 'Cloud Inbox' | 'Local Reader' }
export type ImportJob = { id: string; hash: string; filename: string; metadata: Record<string, unknown>; status: 'queued' | 'imported' | 'duplicate' | 'error' | 'cancelled'; message: string; hasFile?: boolean }
type InboxRow = { destination: string; id: string; hash: string; metadata: Record<string, unknown>; status: ImportJob['status']; message: string }
const jobKey = (id: string) => `calibre-job:${id}`
const fileKey = (id: string) => `calibre-file:${id}`
export const transferJobs = async () => (await all<{value: ImportJob}>('settings', 'calibre-job:')).map(row => row.value)
export async function pairCalibre(label: string): Promise<TransferPair> {
  const {data,error} = await readerCloud.auth.getSession()
  if (error) throw error
  // Saved account libraries stay cloud destinations even during offline sign-in expiry.
  if (readerOwner && data.session?.user.id !== readerOwner) throw new Error('Sign into this reader account before pairing Calibre, or open the guest library explicitly.')
  const device = await loadSetting<string>('calibre-device') ?? crypto.randomUUID()
  await setting('calibre-device',device)
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('')
  const pair: TransferPair = { version:1,id:crypto.randomUUID(),token,device,label:label.trim() || 'My Reader',account:readerOwner,cloud:Boolean(readerOwner),origin:location.origin,local_url:'http://127.0.0.1:47821',mode:'Automatic' }
  if (pair.cloud) {
    pair.cloud_url = `${readerCloudConfig.url}/functions/v1/reader-inbox`
    const {error} = await readerCloud.from('reader_transfer_destinations').insert({id:pair.id,user_id:readerOwner,device,label:pair.label,token_hash:await digest(new TextEncoder().encode(token).buffer)})
    if (error) throw error
  }
  await setting('calibre-pair',pair)
  return pair
}
export async function revokeCalibre(pair: TransferPair) {
  if (pair.cloud) {
    const {error} = await readerCloud.from('reader_transfer_destinations').update({revoked:true}).eq('id',pair.id)
    if (error) throw error
  }
  await setting('calibre-pair',null)
}
export function mappedMetadata(input: Record<string,unknown>): Partial<ReaderMetadata> {
  const result: Record<string,unknown> = {}
  for (const key of ['title','publisher','language','language_code','rating','summary']) if(typeof input[key] === 'string' && input[key].length <= 10000) result[key]=input[key]
  for (const key of ['authors','fandoms','additional_tags','series']) if(Array.isArray(input[key]) && input[key].length <= 500 && input[key].every((value:unknown)=>typeof value==='string' && value.length <= 1000)) result[key]=input[key]
  // A mapped plain summary must never inherit stale EPUB HTML.
  if ('summary' in result) result.summary_html = ''
  return result
}
function calibreIdentity(metadata: Record<string,unknown>) {
  const value = metadata._calibre_uuid
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value.toLowerCase() : undefined
}
export async function stageTransfer(job: ImportJob, file?: Blob) {
  if (!/^[0-9a-f]{64}$/.test(job.hash)) throw new Error('Transferred EPUB hash is invalid.')
  const existing = await getBookDetails(job.hash)
  if (!existing?.hasFile && (!file || file.size > 52428800 || await digest(await file.arrayBuffer()) !== job.hash)) throw new Error('Transferred EPUB size or hash is invalid.')
  const current = await loadSetting<ImportJob>(jobKey(job.id))
  if (!current) await transaction(['settings'],tx=>{
    tx.objectStore('settings').put({id:jobKey(job.id),value:{...job,hasFile:true,status:'queued',message:'Waiting to import.'}})
    if (!existing?.hasFile) tx.objectStore('settings').put({id:fileKey(job.id),value:file})
  })
}
let cancelled = false
export function cancelTransfers() { cancelled = true }
export async function retryTransfer(id: string) {
  const job = await loadSetting<ImportJob>(jobKey(id))
  if (job?.hasFile) await setting(jobKey(id),{...job,status:'queued',message:'Retry queued.'})
}
export async function processTransfers() {
  let count = 0
  for (const job of await transferJobs()) {
    if (job.status !== 'queued' || !job.hasFile) continue
    if (cancelled) { await setting(jobKey(job.id),{...job,status:'cancelled',message:'Cancelled before import. Retry to resume.'}); continue }
    try {
      const existing = await getBookDetails(job.hash)
      if (existing?.hasFile) {
        // Exact downloads need neither another fetch nor another EPUB parse; only mapped metadata changes.
        await transaction(bookStores,tx=>{
          const request=tx.objectStore('books').get(job.hash)
          request.onsuccess=()=>{
            const current=request.result as typeof existing | undefined
            if (!current?.hasFile) { tx.abort(); return }
            putBook(tx,{...current,calibreId:calibreIdentity(job.metadata) ?? current.calibreId,metadata:{...current.metadata,...mappedMetadata(job.metadata)}})
            tx.objectStore('settings').put({id:jobKey(job.id),value:{...job,hasFile:false,status:'duplicate',message:'Already imported; Calibre metadata updated.'}})
            tx.objectStore('settings').delete(fileKey(job.id))
          }
        })
        count++
        continue
      }
      const file = await loadSetting<Blob>(fileKey(job.id))
      if (!file) throw new Error('The staged original is missing. Send this book again from Calibre.')
      const {next,duplicate,previous} = await prepareImport(new File([file],job.filename,{type:'application/epub+zip'}),undefined,calibreIdentity(job.metadata))
      if (cancelled) { await setting(jobKey(job.id),{...job,status:'cancelled',message:'Cancelled before save. Retry to resume.'}); continue }
      next.metadata = {...next.metadata,...mappedMetadata(job.metadata)}
      // Calibre updates replace the prior version using the shared reading-state mapper.
      const result: ImportJob = {...job,hasFile:false,status:duplicate?.hasFile ? 'duplicate' : 'imported',message:duplicate?.hasFile ? 'Existing copy retained.' : previous && previous.id !== next.id ? 'Updated existing EPUB; reading history preserved.' : 'Imported.'}
      if (next.unavailableImages) result.message += ` ${next.unavailableImages} unavailable image${next.unavailableImages === 1 ? '' : 's'} replaced with placeholders.`
      await transaction([...bookStores,'pending'],tx=>{
        const save = (current = previous) => { writeImport(tx,importedVersion(next,current),current,'delete'); tx.objectStore('settings').put({id:jobKey(job.id),value:result}); tx.objectStore('settings').delete(fileKey(job.id)) }
        if (previous) { const request=tx.objectStore('books').get(previous.id); request.onsuccess=()=>save(request.result) } else save()
      })
      count++
    } catch(error) {
      await setting(jobKey(job.id),{...job,status:'error',message:String(error).slice(0,2000)})
      // The original staged file remains available for an explicit retry.
    }
  }
  return count
}
async function localRequest(pair: TransferPair, path: string, init?: RequestInit) {
  const response = await fetch(`${pair.local_url}${path}`,{...init,headers:{Authorization:`Bearer ${pair.token}`,'X-Reader-Destination':pair.id,...init?.headers},signal:AbortSignal.timeout(10000)})
  if (!response.ok) throw new Error(`Local reader bridge unavailable (${response.status}). Keep the paired Calibre instance open.`)
  return response
}
let receiving: Promise<number> | undefined
export function receiveTransfers(): Promise<number> {
  if (!receiving) receiving = (async () => navigator.locks ? await navigator.locks.request(`reader-import:${readerOwner}`,receive) : await receive())().finally(()=>{receiving=undefined})
  return receiving!
}
async function receive() {
  cancelled = false
  const pair = await loadSetting<TransferPair>('calibre-pair')
  if (pair && pair.account !== readerOwner) throw new Error('Calibre pairing belongs to another reader library.')
  const errors: unknown[] = []
  // Both transports deliver into the same durable queue; neither changes the library.
  const local = pair && await localRequest(pair,'/inbox').catch(()=>undefined)
  if (local && pair) {
    try {
      const rows = await local.json() as InboxRow[]
      for (const row of rows) {
        const id=`local:${pair.id}:${row.id}`
        if (!await loadSetting(jobKey(id))) {
          const existing=await getBookDetails(row.hash)
          const file=existing?.hasFile ? undefined : await (await localRequest(pair,`/books/${row.id}`)).blob()
          await stageTransfer({id,hash:row.hash,filename:typeof row.metadata._filename === 'string' ? row.metadata._filename : `${row.id}.epub`,metadata:row.metadata,status:'queued',message:''},file)
        }
      }
    } catch(error) { errors.push(error) }
  }
  let cloudRows: InboxRow[] = []
  if (readerOwner && navigator.onLine) {
    try {
      await syncCloud()
      // Any account device can consume the inbox. Exact hashes make concurrent deliveries harmless.
      const inbox = await readerCloud.from('reader_import_inbox').select('*').eq('status','queued').order('created_at').order('id').limit(50)
      if (inbox.error) throw inbox.error
      cloudRows=inbox.data as unknown as InboxRow[]
      for(const row of cloudRows) {
        const id=`cloud:${row.destination}:${row.id}`
        if(await loadSetting(jobKey(id))) continue
        const existing=await getBookDetails(row.hash)
        const {data,error}=existing?.hasFile ? {data:undefined,error:null} : await readerCloud.storage.from('reader-epubs').download(`${readerOwner}/${row.hash}.epub`)
        if(error) throw error
        await stageTransfer({id,hash:row.hash,filename:typeof row.metadata._filename === 'string' ? row.metadata._filename : `${row.id}.epub`,metadata:row.metadata,status:'queued',message:''},data)
      }
    } catch(error) { errors.push(error) }
  }
  const count = await processTransfers()
  // Publish manifests/history before acknowledging cloud delivery, so other devices can discover the book.
  if (readerOwner && count) await syncCloud(true)
  for(const job of await transferJobs()) {
    if(job.status==='queued' || await loadSetting(`calibre-ack:${job.id}`) === job.status) continue
    const [transport,destination,id]=job.id.split(':')
    try {
      if(transport==='local' && pair && destination===pair.id) await localRequest(pair,`/results/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:job.status,message:job.message})})
      else if(transport==='cloud') {
        const {error} = await readerCloud.from('reader_import_inbox').update({status:job.status,message:job.message}).eq('destination',destination).eq('id',id)
        if (error) throw error
      }
      else continue
      await setting(`calibre-ack:${job.id}`,job.status)
    } catch(error) { errors.push(error) }
  }
  // Results stay saved even if acknowledgement delivery fails.
  if(errors.length && !count) throw errors[0]
  return count
}
