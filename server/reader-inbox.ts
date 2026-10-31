import type { SupabaseClient } from '@supabase/supabase-js'
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('')
export function readerInboxHandler(client: SupabaseClient) { return async (request: Request) => {
 try {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /i,'') ?? ''
  if (!/^[0-9a-f]{64}$/.test(token)) return json({error:'Invalid pairing credential'},401)
  const tokenHash = hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))
  const {data:destination,error:lookupError} = await client.from('reader_transfer_destinations').select('*').eq('token_hash',tokenHash).eq('revoked',false).maybeSingle()
  if (lookupError) throw lookupError
  if (!destination) return json({error:'Pairing revoked or unknown'},401)
  const {data:access,error:accessError} = await client.from('reader_app_access').select('user_id').eq('user_id',destination.user_id).maybeSingle()
  if (accessError) throw accessError
  if (!access) return json({error:'Reader cloud access revoked'},403)
  const url = new URL(request.url), name = url.pathname.split('/').at(-1)!
  if (request.method === 'GET' && name === 'destination') return json({account:destination.user_id,device:destination.device,cloud:true,label:destination.label})
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(name)) return json({error:'Invalid transfer ID'},400)
  const receipt = await client.from('reader_import_inbox').select('hash,status,message').eq('destination',destination.id).eq('id',name).maybeSingle()
  if (receipt.error) throw receipt.error
  if (request.method === 'GET') return receipt.data ? json(receipt.data) : json({error:'Unknown transfer'},404)
  if (request.method !== 'POST') return json({error:'Method not allowed'},405)
  const hash = request.headers.get('X-Epub-Hash') ?? ''
  if (!/^[0-9a-f]{64}$/.test(hash)) return json({error:'Invalid EPUB hash'},400)
  if (receipt.data) return receipt.data.hash === hash ? json(receipt.data) : json({error:'Transfer ID already used for another file'},409)
  const rawMetadata = request.headers.get('X-Reader-Metadata') ?? 'e30='
  if (rawMetadata.length > 21848) return json({error:'Metadata exceeds 16 KiB'},413)
  let metadata
  try { metadata = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(rawMetadata), c=>c.charCodeAt(0)))) } catch { return json({error:'Invalid metadata'},400) }
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object' || new TextEncoder().encode(JSON.stringify(metadata)).length > 16384) return json({error:'Invalid metadata'},400)
  // Bound actual streamed bytes as well as the untrusted Content-Length.
  const chunks: Uint8Array[] = []; let size = 0
  if (!request.body) return json({error:'Missing EPUB'},400)
  const reader = request.body.getReader()
  while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>52428800){await reader.cancel();return json({error:'EPUB exceeds 50 MiB'},413)} chunks.push(value) }
  const bytes = new Uint8Array(size); let offset=0
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  if(hex(await crypto.subtle.digest('SHA-256',bytes))!==hash) return json({error:'EPUB hash mismatch'},400)
  const upload=await client.storage.from('reader-epubs').upload(`${destination.user_id}/${hash}.epub`,bytes,{contentType:'application/epub+zip',upsert:false})
  if(upload.error && String(upload.error.statusCode)!=='409') throw upload.error
  const insert=await client.from('reader_import_inbox').upsert({destination:destination.id,id:name,user_id:destination.user_id,hash,metadata},{onConflict:'destination,id',ignoreDuplicates:true})
  if(insert.error) throw insert.error
  const saved = await client.from('reader_import_inbox').select('hash,status,message').eq('destination',destination.id).eq('id',name).single()
  if(saved.error) throw saved.error
  if(saved.data.hash !== hash) return json({error:'Transfer ID already used for another file'},409)
  return json({status:'queued',message:'Delivered; waiting for a reader to import.'},202)
 } catch(error) { console.error('Reader inbox request failed', error instanceof Error ? error.message : 'Unknown failure'); return json({error:'Inbox request failed. Retry this destination.'},500) }
} }
