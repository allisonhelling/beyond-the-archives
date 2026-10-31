// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { readerInboxHandler } from './reader-inbox'
const token='ab'.repeat(32), owner='30000000-0000-0000-0000-000000000001', id='30000000-0000-0000-0000-000000000002'
function fixture() {
 let revoked=false,access=true,uploads=0
 const rows: Record<string,unknown>[]=[]
 const client=createClient('https://backend.example','service-key',{auth:{persistSession:false},global:{fetch:async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  if(url.pathname.includes('reader_transfer_destinations')) {
   expect(url.searchParams.get('token_hash')).toBe(`eq.${createHash('sha256').update(token).digest('hex')}`)
   return Response.json(revoked ? [] : [{id,user_id:owner,device:'paired-device',label:'Reader'}])
  }
  if(url.pathname.includes('reader_app_access')) return Response.json(access ? [{user_id:owner}] : [])
  if(url.pathname.includes('reader_import_inbox')) {
   if(request.method==='POST') {rows.push(await request.json());return new Response(null,{status:201})}
   return Response.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] : rows)
  }
  if(url.pathname.includes('/storage/v1/object/reader-epubs/')) {uploads++;return Response.json({Key:'stored'})}
  throw new Error(`Unexpected request ${url.pathname}`)
 }}})
 return {handler:readerInboxHandler(client),rows,get uploads(){return uploads},revoke:()=>{revoked=true},deny:()=>{access=false}}
}
function request(data='epub bytes',hash=createHash('sha256').update(data).digest('hex')) {return new Request(`https://backend.example/functions/v1/reader-inbox/books/${id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Epub-Hash':hash},body:data})}
it('requires a scoped token and reader access, including after revocation',async()=>{
 const state=fixture()
 expect((await state.handler(new Request('https://backend.example/destination'))).status).toBe(401)
 state.revoke();expect((await state.handler(request())).status).toBe(401)
 const denied=fixture();denied.deny();expect((await denied.handler(request())).status).toBe(403)
 expect(denied.uploads).toBe(0)
})
it('checks uploaded hashes and retries the same receipt without replacing files or results',async()=>{
 const state=fixture()
 expect((await state.handler(request('corrupt','a'.repeat(64)))).status).toBe(400)
 expect(state.uploads).toBe(0)
 expect((await state.handler(request())).status).toBe(202)
 expect(state.rows[0]).toMatchObject({destination:id,id,user_id:owner,hash:createHash('sha256').update('epub bytes').digest('hex')})
 state.rows[0].status='imported'
 expect(await (await state.handler(request())).json()).toMatchObject({status:'imported'})
 expect(state.uploads).toBe(1)
 expect((await state.handler(request('different EPUB'))).status).toBe(409)
 expect(state.uploads).toBe(1)
})
