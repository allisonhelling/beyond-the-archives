import { createHash } from 'node:crypto'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { epubFiles } from '../../../src/test/epub-fixture'
const owner='10000000-0000-0000-0000-000000000001'
type Value={key:string;value:unknown;revision:number}
async function signedIn(context:BrowserContext) {
 await context.addInitScript(({owner})=>{
  if (localStorage.getItem('cloud-test-initialized')) return
  localStorage.setItem('cloud-test-initialized','true')
  localStorage.setItem('reader-cloud-owner',owner)
  localStorage.setItem('reader-cloud-auth',JSON.stringify({access_token:`${btoa('{}')}.${btoa(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600}))}.test-signature`,refresh_token:'mock-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:owner,email:'reader@example.com',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:'2026-01-01'}}))
 },{owner})
}
async function account(page:Page){await page.getByRole('button',{name:'Reader Account',exact:true}).click()}
test('syncs originals and state without an organizer, downloads on a fresh device, and retains offline account isolation',async({browser})=>{
 test.setTimeout(60000)
 let loseNoteResponse = false
 const values=new Map<string,Value>(),receipts=new Map<string,Value>(),files=new Map<string,Buffer>()
 async function device(){
  const context=await browser.newContext();await signedIn(context)
  await context.route(url => /^\/(auth|rest|storage)\/v1\//.test(url.pathname),async route=>{
   const request=route.request(),url=new URL(request.url())
   if(url.pathname.includes('/reader_app_access'))return route.fulfill({json:{user_id:owner}})
   if(url.pathname.includes('/rpc/reader_cloud_apply')){
    const input=request.postDataJSON(),before=values.get(input.p_key)
    if(receipts.has(input.p_id))return route.fulfill({json:receipts.get(input.p_id)})
    if((before?.revision??0)!==input.p_base && JSON.stringify(before?.value)!==JSON.stringify(input.p_value))return route.fulfill({json:{...before,conflict:true}})
    const next={key:input.p_key,value:input.p_value,revision:(before?.revision??0)+1};values.set(next.key,next);receipts.set(input.p_id,next);if(loseNoteResponse && input.p_key.endsWith('/notes')){loseNoteResponse=false;return route.abort()}return route.fulfill({json:next})
   }
   if(url.pathname.includes('/reader_cloud_values'))return route.fulfill({json:[...values.values()].filter(row=>row.key>String(url.searchParams.get('key')??'gt.').slice(3)).sort((a,b)=>a.key.localeCompare(b.key))})
   if(url.pathname.includes('/storage/v1/object/')){
    const key=url.pathname.split('reader-epubs/')[1]
    if(request.method()==='POST'){
     const form=await new Response(new Uint8Array(request.postDataBuffer()!),{headers:{'Content-Type':request.headers()['content-type']}}).formData()
     const blob=[...form.values()].find(value=>typeof value!=='string') as File
     const original=Buffer.from(await blob.arrayBuffer())
     expect(key).toBe(`${owner}/${createHash('sha256').update(original).digest('hex')}.epub`)
     files.set(key,original);return route.fulfill({json:{Key:key}})
    }
    return route.fulfill({body:files.get(key),contentType:'application/epub+zip'})
   }
   return route.fulfill({json:{}})
  })
  return context
 }
 const first=await device(),page=await first.newPage();await page.goto('/')
 const file=Buffer.from(await createZip(epubFiles()).arrayBuffer())
 await page.getByLabel('Import EPUB File').setInputFiles({name:'story.epub',mimeType:'application/epub+zip',buffer:file})
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await page.getByRole('button',{name:'← Bookshelf'}).click();await account(page)
 await page.getByRole('button',{name:'Sync Cloud Now'}).click()
 await expect.poll(()=>files.size).toBe(1)
 await expect.poll(()=>[...values.keys()].some(key=>key.endsWith('/manifest'))).toBe(true)
 expect([...values.keys()].some(key=>key.includes('organizer'))).toBe(false)
 const second=await device(),other=await second.newPage();await other.goto('/');await expect(other.getByText('Reader prepared for offline use',{exact:false})).toBeVisible();await account(other)
 other.once('dialog',dialog=>void dialog.accept())
 await other.getByRole('button',{name:'Import Guest Library',exact:true}).click()
 await expect(other.getByRole('button',{name:'Import Guest Library',exact:true})).toBeEnabled()
 await other.getByRole('button',{name:'Sync Cloud Now'}).click()
 await expect(other.getByRole('dialog').getByRole('button',{name:'Download EPUB',exact:true})).toBeVisible()
 await other.getByRole('dialog').getByRole('button',{name:'Download EPUB',exact:true}).click()
 await expect(other.getByRole('dialog').getByRole('button',{name:'Download EPUB',exact:true})).toHaveCount(0)
 await other.getByRole('dialog').getByRole('button',{name:'Close Dialog',exact:true}).click()
 await expect(other.locator('.story-card')).toHaveCount(1)
 await other.getByLabel('Work Actions',{exact:true}).click()
 other.once('dialog',dialog=>void dialog.accept())
 await other.getByRole('button',{name:'Remove Download',exact:true}).click()
 await expect(other.locator('.story-card .availability')).toHaveText('Not Downloaded')
 await other.locator('.story-card').getByRole('button',{name:'Download EPUB',exact:true}).click()
 await expect(other.getByLabel('Book Content')).toBeVisible()
 await other.getByRole('button',{name:'← Bookshelf'}).click()
 // Offline edits on two devices retain a shared baseline and produce an explicit note conflict.
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 async function notes(target:Page,text:string){
  await target.getByRole('button',{name:'Manage EPUB',exact:true}).click()
  await target.getByLabel('Personal Notes',{exact:true}).fill(text)
  await target.getByRole('button',{name:'Save Personal Notes',exact:true}).click()
  await expect(target.getByRole('button',{name:'Close Dialog',exact:true})).toBeEnabled()
  await target.getByRole('button',{name:'Close Dialog',exact:true}).click()
 }
 await notes(page,'First device note');await notes(other,'Second device note')
 loseNoteResponse=true
 await account(page);await page.getByRole('button',{name:'Sync Cloud Now'}).click()
 await expect(page.getByRole('dialog').getByRole('status').last()).not.toBeEmpty()
 await expect(page.getByRole('button',{name:'Sync Cloud Now'})).toBeEnabled()
 await page.getByRole('button',{name:'Sync Cloud Now'}).click()
 await expect(page.getByRole('button',{name:'Sync Cloud Now'})).toBeEnabled()
 expect([...values.values()].find(row=>row.key.endsWith('/notes'))).toMatchObject({value:'First device note',revision:2})
 await account(other);await other.getByRole('button',{name:'Sync Cloud Now'}).click()
 await expect(other.getByText('Conflicting Notes',{exact:true})).toBeVisible()
 await other.getByRole('button',{name:'Use Cloud Version',exact:true}).click()
 await expect(other.getByText('Conflicting Notes',{exact:true})).toHaveCount(0)
 await other.getByText('Preserved Conflict Versions',{exact:true}).click()
 await expect(other.getByRole('dialog').locator('pre')).toContainText('Second device note')
 await other.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await second.setOffline(true);await other.getByRole('button',{name:/Start Reading|Continue Reading/}).click();await expect(other.getByLabel('Book Content')).toBeVisible()
 await other.getByRole('button',{name:'← Bookshelf'}).click();await account(other)
 await other.getByRole('button',{name:'Open Guest Library',exact:true}).click()
 await expect(other.locator('.story-card')).toHaveCount(0)
 await expect(other.getByRole('heading',{name:'Make Yourself at Home'})).toBeVisible()
 await second.setOffline(false)
 const guestFiles=epubFiles()
 guestFiles[guestFiles.length-1].content=String(guestFiles.at(-1)!.content).replace('</body>','<p>Guest edition extra prose.</p></body>')
 await other.getByLabel('Import EPUB File').setInputFiles({name:'guest.epub',mimeType:'application/epub+zip',buffer:Buffer.from(await createZip(guestFiles).arrayBuffer())})
 await expect(other.getByLabel('Book Content')).toBeVisible()
 await other.getByRole('button',{name:'← Bookshelf'}).click()
 await account(other)
 await other.getByRole('button',{name:'Open This Account’s Library',exact:true}).click()
 await expect(other.locator('.story-card')).toHaveCount(1)
 await account(other)
 other.once('dialog',dialog=>void dialog.accept())
 await other.getByRole('button',{name:'Import Guest Library',exact:true}).click()
 await expect(other.locator('.story-card')).toHaveCount(2)
 await expect.poll(()=>files.size).toBe(2)
 await other.getByRole('button',{name:'Open Guest Library',exact:true}).click()
 await expect(other.locator('.story-card')).toHaveCount(1)
 await second.close();await first.close()
})

test('receives the account cloud inbox without the originating device pairing and publishes before acknowledgement',async({browser})=>{
 const context=await browser.newContext();await signedIn(context)
 const file=Buffer.from(await createZip(epubFiles()).arrayBuffer()),hash=createHash('sha256').update(file).digest('hex')
 const values=new Map<string,Value>()
 let result='queued'
 await context.route(url=>/^\/(auth|rest|storage)\/v1\//.test(url.pathname),async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.pathname.includes('/reader_app_access'))return route.fulfill({json:{user_id:owner}})
  if(url.pathname.includes('/rpc/reader_cloud_apply')){
   const input=request.postDataJSON(),row={key:input.p_key,value:input.p_value,revision:1}
   values.set(row.key,row);return route.fulfill({json:row})
  }
  if(url.pathname.includes('/reader_cloud_values'))return route.fulfill({json:[...values.values()]})
  if(url.pathname.includes('/reader_import_inbox')){
   if(request.method()==='PATCH'){
    expect(values.has(`${hash}/manifest`)).toBe(true)
    result=request.postDataJSON().status
    return route.fulfill({status:204})
   }
   return route.fulfill({json:result==='queued' ? [{destination:'40000000-0000-0000-0000-000000000001',id:'40000000-0000-0000-0000-000000000002',hash,metadata:{title:'Cloud Inbox Story'},status:'queued',message:''}] : []})
  }
  if(url.pathname.includes('/reader_transfer_destinations'))return route.fulfill({status:201,body:''})
  if(url.pathname.includes('/storage/v1/object/')){
   if(request.method()==='POST')return route.fulfill({status:409,json:{statusCode:'409',error:'Duplicate',message:'Already exists'}})
   return route.fulfill({body:file,contentType:'application/epub+zip'})
  }
  return route.fulfill({json:{}})
 })
 const page=await context.newPage();await page.goto('/')
 await expect(page.locator('.story-card')).toHaveCount(1)
 await expect(page.getByRole('heading',{name:'Cloud Inbox Story'})).toBeVisible()
 await expect.poll(()=>result).toBe('imported')
 await page.getByRole('button',{name:'Calibre Transfers',exact:true}).click()
 await expect(page.getByRole('button',{name:'Pair Calibre',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Pair Calibre',exact:true}).click()
 const pairing=JSON.parse(await page.getByLabel('Calibre Pairing Configuration').inputValue())
 expect(pairing.cloud).toBe(true);expect(pairing.account).toBe(owner)
 await context.close()
})
