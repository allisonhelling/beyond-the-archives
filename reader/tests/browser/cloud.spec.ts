import { createHash } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { epubFiles } from '../../../src/test/epub-fixture'
import { account, accountSession, owner, signedIn } from './account-fixture'
type Value={key:string;value:unknown;revision:number}
test('syncs originals and state while organizer setup is unavailable, downloads on a fresh device, and retains offline account isolation',async({browser})=>{
 test.setTimeout(60000)
 let loseNoteResponse = false, failDelete = false
 const values=new Map<string,Value>(),receipts=new Map<string,Value>(),files=new Map<string,Buffer>()
 async function device(){
  const context=await browser.newContext();await signedIn(context)
  await context.route(url => /^\/(auth|rest|storage)\/v1\//.test(url.pathname),async route=>{
   const request=route.request(),url=new URL(request.url())
   if(url.pathname==='/auth/v1/user')return route.fulfill({json:accountSession().user})
   if(url.pathname==='/rest/v1/rpc/reader_organizer_connection')return route.fulfill({status:503,json:{message:'Organizer setup temporarily unavailable'}})
   if(url.pathname.includes('/reader_app_access'))return route.fulfill({json:{user_id:owner}})
   if(url.pathname.includes('/rpc/reader_cloud_apply')){
    const input=request.postDataJSON(),before=values.get(input.p_key)
    if(receipts.has(input.p_id))return route.fulfill({json:receipts.get(input.p_id)})
    const id=input.p_key.split('/')[0],deleted=values.get(`${id}/deleted`)
    if(deleted?.value===true && !(input.p_key===deleted.key && input.p_value===false && input.p_base===deleted.revision))return route.fulfill({json:deleted})
    if(input.p_key===`${id}/deleted` && input.p_value===true){
     for(const [key,row] of values)if(row.key.startsWith(`${id}/`))values.delete(key)
     for(const [key,row] of receipts)if(row.key.startsWith(`${id}/`))receipts.delete(key)
    }
    if((before?.revision??0)!==input.p_base && JSON.stringify(before?.value)!==JSON.stringify(input.p_value))return route.fulfill({json:{...before,conflict:true}})
    const next={key:input.p_key,value:input.p_value,revision:(before?.revision??0)+1};values.set(next.key,next);receipts.set(input.p_id,next);if(loseNoteResponse && input.p_key.endsWith('/notes')){loseNoteResponse=false;return route.abort()}return route.fulfill({json:next})
   }
   if(url.pathname.includes('/reader_cloud_values'))return route.fulfill({json:[...values.values()].filter(row=>row.key>String(url.searchParams.getAll('key').find(value=>value.startsWith('gt.'))??'gt.').slice(3) && (!url.searchParams.getAll('key').some(value=>value.startsWith('like.')) || row.key.endsWith('/deleted'))).sort((a,b)=>a.key.localeCompare(b.key))})
   if(url.pathname.includes('/storage/v1/object/')){
    if(request.method()==='DELETE'){
     if(failDelete){return route.fulfill({status:503,json:{message:'Storage temporarily unavailable'}})}
     for(const key of request.postDataJSON().prefixes)files.delete(key)
     return route.fulfill({json:[]})
    }
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
 await page.getByRole('button',{name:'Bookshelf'}).click();await account(page)
 await page.getByRole('button',{name:'Sync Now'}).click()
 await expect.poll(()=>files.size).toBe(1)
 await expect.poll(()=>[...values.keys()].some(key=>key.endsWith('/manifest'))).toBe(true)
 expect([...values.keys()].some(key=>key.includes('organizer'))).toBe(false)
 const manifest=[...values.values()].find(row=>row.key.endsWith('/manifest'))!
 manifest.value={...manifest.value as object,workId:null};manifest.revision++
 const second=await device(),other=await second.newPage();await other.goto('/');await expect(other.getByText('Reader prepared for offline use',{exact:false})).toBeVisible();await account(other)
 other.once('dialog',dialog=>void dialog.accept())
 await other.getByRole('button',{name:'Import Guest Library',exact:true}).click()
 await expect(other.getByRole('button',{name:'Import Guest Library',exact:true})).toBeEnabled()
 await other.getByRole('button',{name:'Sync Now'}).click()
 await expect(other.getByRole('dialog').getByRole('button',{name:'Download EPUB',exact:true})).toHaveCount(0)
 await other.getByRole('dialog').getByRole('button',{name:'Close Dialog',exact:true}).click()
 await other.locator('.story-card').getByRole('button',{name:'Download EPUB',exact:true}).click()
 await expect(other.getByLabel('Book Content')).toBeVisible()
 const recovered=await other.evaluate(async()=>{const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open(`bta-reader-account:${localStorage.getItem('reader-cloud-owner')}`);request.onsuccess=()=>resolve(request.result)});try{return await new Promise<string|null>(resolve=>{const request=db.transaction('books').objectStore('books').getAll();request.onsuccess=()=>resolve(request.result[0]?.workId??null)})}finally{db.close()}})
 expect(recovered).toBe('8001')
 await other.getByRole('button',{name:'Bookshelf',exact:true}).click()
 await expect(other.locator('.story-card')).toHaveCount(1)
 await other.getByLabel('Work Actions',{exact:true}).click()
 other.once('dialog',dialog=>void dialog.accept())
 await other.getByRole('button',{name:'Remove Download',exact:true}).click()
 await expect(other.locator('.story-card .availability')).toHaveText('Available In Cloud')
 await other.goto(`/?book=${manifest.key.split('/')[0]}`)
 await expect(other.getByRole('button',{name:'Download and Read',exact:true})).toBeVisible()
 await other.getByRole('button',{name:'Download and Read',exact:true}).click()
 await expect(other.getByLabel('Book Content')).toBeVisible()
 await other.getByRole('button',{name:'Bookshelf',exact:true}).click()
 await other.goto('/')
 await other.getByLabel('Work Actions',{exact:true}).click()
 other.once('dialog',dialog=>void dialog.accept())
 await other.getByRole('button',{name:'Remove Download',exact:true}).click()
 await expect(other.locator('.story-card .availability')).toHaveText('Available In Cloud')
 await other.getByRole('button',{name:'Storage',exact:true}).click()
 const storage=other.getByRole('dialog',{name:'Manage Local Storage',exact:true})
 await expect(storage.locator('td[data-column=library]')).toHaveText('In Cloud')
 await storage.getByLabel('Select Visible Works',{exact:true}).check()
 await storage.getByRole('button',{name:'Download',exact:true}).click()
 await expect(storage.locator('td[data-column=library]')).toHaveText('Downloaded')
 await storage.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await other.locator('.story-card').getByRole('button',{name:/Start Reading|Continue Reading/}).click()
 await expect(other.getByLabel('Book Content')).toBeVisible()
 await other.getByRole('button',{name:'Bookshelf'}).click()
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
 await account(page);await page.getByRole('button',{name:'Sync Now'}).click()
 await expect(page.locator('.toast[role="status"]')).not.toBeEmpty()
 await expect(page.getByRole('button',{name:'Sync Now'})).toBeEnabled()
 await page.getByRole('button',{name:'Sync Now'}).click()
 await expect(page.getByRole('button',{name:'Sync Now'})).toBeEnabled()
 expect([...values.values()].find(row=>row.key.endsWith('/notes'))).toMatchObject({value:'First device note',revision:2})
 await account(other);await other.getByRole('button',{name:'Sync Now'}).click()
 await expect(other.getByText('Conflicting Personal Notes',{exact:true})).toBeVisible()
 await other.getByRole('button',{name:'Use Cloud Version',exact:true}).click()
 await expect(other.getByText('Conflicting Personal Notes',{exact:true})).toHaveCount(0)
 await other.getByText('Preserved Conflict Versions',{exact:true}).click()
 await expect(other.getByRole('dialog')).toContainText('Second device note')
 await other.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await second.setOffline(true);await other.getByRole('button',{name:/Start Reading|Continue Reading/}).click();await expect(other.getByLabel('Book Content')).toBeVisible()
 await other.getByRole('button',{name:'Bookshelf'}).click();await account(other)
 await other.getByRole('button',{name:'Open Guest Library',exact:true}).click()
 await expect(other.locator('.story-card')).toHaveCount(0)
 await expect(other.getByRole('heading',{name:'Make Yourself at Home'})).toBeVisible()
 await second.setOffline(false)
 const guestFiles=epubFiles({source:'https://archiveofourown.org/works/8002'})
 for(const item of guestFiles)item.content=item.content.replaceAll('Recovered &amp; Remembered','Guest Edition')
 guestFiles[guestFiles.length-1].content=String(guestFiles.at(-1)!.content).replace('</body>','<p>Guest edition extra prose.</p></body>')
 await other.getByLabel('Import EPUB File').setInputFiles({name:'guest.epub',mimeType:'application/epub+zip',buffer:Buffer.from(await createZip(guestFiles).arrayBuffer())})
 await expect(other.getByLabel('Book Content')).toBeVisible()
 await other.getByRole('button',{name:'Bookshelf'}).click()
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
 // Account buttons reuse the shared wrapping action row with visible spacing.
 await account(other)
 const open=other.getByRole('button',{name:'Open This Account’s Library',exact:true}),signOut=other.getByRole('button',{name:'Sign Out & Open Guest Library',exact:true})
 for(const width of [390,1000]){
  await other.setViewportSize({width,height:844})
  const a=(await open.boundingBox())!,b=(await signOut.boundingBox())!
  expect(b.y>=a.y+a.height+9 || b.x>=a.x+a.width+9).toBe(true)
 }
 await open.click()
 // Delete offline, retry failed cloud file removal, and purge a stale second device.
 await second.setOffline(true)
 const original=other.locator('.story-card').filter({has:other.getByRole('button',{name:'Recovered & Remembered',exact:true})}).first()
 await original.getByLabel('Work Actions',{exact:true}).click()
 other.once('dialog',dialog=>void dialog.accept())
 await other.getByRole('button',{name:'Delete EPUB',exact:true}).click()
 await expect(other.locator('.story-card')).toHaveCount(1)
 await other.reload()
 await expect(other.locator('.story-card')).toHaveCount(1)
 failDelete=true
 await second.setOffline(false)
 await account(other);await other.getByRole('button',{name:'Sync Now',exact:true}).click()
 await expect(other.locator('.toast[role="status"]')).toContainText('Storage temporarily unavailable')
 failDelete=false
 await other.getByRole('button',{name:'Sync Now',exact:true}).click()
 await expect.poll(()=>files.size).toBe(1)
 await expect.poll(()=>[...values.values()].filter(row=>row.value===true && row.key.endsWith('/deleted')).length).toBe(1)
 await page.getByRole('button',{name:'Sync Now',exact:true}).click()
 await expect(page.getByRole('button',{name:'Sync Now',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await expect(page.locator('.story-card')).toHaveCount(1)
 // An explicit reimport starts fresh, rather than restoring deleted notes/history.
 await other.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await other.getByLabel('Import EPUB File').setInputFiles({name:'story.epub',mimeType:'application/epub+zip',buffer:file})
 await expect(other.getByLabel('Book Content')).toBeVisible()
 await other.getByRole('button',{name:'Bookshelf'}).click()
 await account(other);await other.getByRole('button',{name:'Sync Now',exact:true}).click()
 await expect.poll(()=>files.size).toBe(2)
 await expect.poll(()=>[...values.values()].find(row=>row.key===`${createHash('sha256').update(file).digest('hex')}/notes`)?.value).toBe('')
 await second.close();await first.close()
})

for (const cloudOnly of [false,true]) test(`receives the account cloud inbox and publishes before acknowledgement (${cloudOnly ? 'cloud only' : 'downloaded'})`,async({browser})=>{
 const context=await browser.newContext();await signedIn(context)
 let file=Buffer.from(await createZip(epubFiles()).arrayBuffer()),hash=createHash('sha256').update(file).digest('hex')
 const originalHash=hash
 let delivery=0,downloads=0
 const values=new Map<string,Value>()
 let result='queued',failPublication=cloudOnly,publicationFailed=false
 await context.route(url=>/^\/(auth|rest|storage)\/v1\//.test(url.pathname),async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.pathname.includes('/reader_app_access'))return route.fulfill({json:{user_id:owner}})
  if(url.pathname.includes('/rpc/reader_cloud_apply')){
   const input=request.postDataJSON(),row={key:input.p_key,value:input.p_value,revision:1}
   if(failPublication && input.p_key.endsWith('/manifest')) {
    failPublication=false;publicationFailed=true
    return route.fulfill({status:503,json:{message:'Temporary sync failure'}})
   }
   if(input.p_key.endsWith('/deleted') && input.p_value===true)for(const key of values.keys())if(key.startsWith(input.p_key.split('/')[0]+'/'))values.delete(key)
   values.set(row.key,row);return route.fulfill({json:row})
  }
  if(url.pathname.includes('/reader_cloud_values'))return route.fulfill({json:[...values.values()].filter(row=>!url.searchParams.getAll('key').some(value=>value.startsWith('like.')) || row.key.endsWith('/deleted'))})
  if(url.pathname.includes('/reader_import_inbox')){
   if(request.method()==='PATCH'){
    expect(values.has(`${hash}/manifest`),JSON.stringify(request.postDataJSON())).toBe(true)
    result=request.postDataJSON().status
    return route.fulfill({status:204})
   }
   return route.fulfill({json:result==='queued' ? [{destination:'40000000-0000-0000-0000-000000000001',id:`40000000-0000-0000-0000-${String(delivery+2).padStart(12,'0')}`,hash,metadata:{title:delivery===2?'Updated Cloud Story':'Cloud Inbox Story',_calibre_uuid:'20000000-0000-0000-0000-000000000001',_reader_download:delivery===1?false:!cloudOnly,calibre_work_link:'https://archiveofourown.org/works/8001'},status:'queued',message:''}] : []})
  }
  if(url.pathname.includes('/reader_transfer_destinations'))return route.fulfill({status:201,body:''})
  if(url.pathname.includes('/storage/v1/object/')){
   if(request.method()==='DELETE')return route.fulfill({json:[]})
   if(request.method()==='POST')return route.fulfill({status:409,json:{statusCode:'409',error:'Duplicate',message:'Already exists'}})
   downloads++
   return route.fulfill({body:file,contentType:'application/epub+zip'})
  }
  return route.fulfill({json:{}})
 })
 const page=await context.newPage();await page.goto('/')
 if(cloudOnly) {
  await expect.poll(()=>publicationFailed).toBe(true)
  expect(result).toBe('queued')
  const retained=await page.evaluate(async owner=>{
   const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open(`bta-reader-account:${owner}`);request.onsuccess=()=>resolve(request.result)})
   try{return await new Promise<boolean>(resolve=>{const request=db.transaction('books').objectStore('books').getAll();request.onsuccess=()=>resolve(request.result[0]?.hasFile)})}finally{db.close()}
  },owner)
  expect(retained).toBe(true)
  await page.reload()
 }
 await expect(page.locator('.story-card')).toHaveCount(1)
 await expect(page.getByRole('heading',{name:'Cloud Inbox Story'})).toBeVisible()
 await expect.poll(()=>result).toBe('imported')
 await page.getByRole('button',{name:'Manage EPUB',exact:true}).click()
 await page.getByLabel('Personal Notes',{exact:true}).fill('Keep cloud reading data')
 await page.getByRole('button',{name:'Save Personal Notes',exact:true}).click()
 await expect(page.getByRole('button',{name:'Close Dialog',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await page.getByRole('button',{name:'Calibre',exact:true}).click()
 await expect(page.getByRole('button',{name:'Pair Calibre',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Pair Calibre',exact:true}).click()
 const pairing=JSON.parse(await page.getByLabel('Calibre Pairing Configuration').inputValue())
 expect(pairing.cloud).toBe(true);expect(pairing.account).toBe(owner)
 delivery=1;result='queued'
 await page.getByRole('button',{name:'Check for Incoming Books',exact:true}).click()
 await expect.poll(()=>result).toBe(cloudOnly?'imported':'duplicate')
 expect(downloads).toBe(cloudOnly?2:1)
 const changed=epubFiles();changed[2].content=changed[2].content.replace('</metadata>','<meta name="revision" content="2"/></metadata>')
 file=Buffer.from(await createZip(changed).arrayBuffer());hash=createHash('sha256').update(file).digest('hex');delivery=2;result='queued'
 await page.getByRole('button',{name:'Check for Incoming Books',exact:true}).click()
 await expect.poll(()=>result).toBe('imported')
 await expect.poll(()=>values.get(`${originalHash}/deleted`)?.value).toBe(true)
 expect(values.has(`${originalHash}/manifest`)).toBe(false)
 expect(downloads).toBe(cloudOnly?3:2)
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await expect(page.locator('.story-card')).toHaveCount(1)
 await expect(page.getByRole('button',{name:'Updated Cloud Story',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Manage EPUB',exact:true}).click()
 await expect(page.getByRole('textbox',{name:'Personal Notes',exact:true})).toHaveValue('Keep cloud reading data')
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await page.getByRole('button',{name:'Storage',exact:true}).click()
 const storage=page.getByRole('dialog',{name:'Manage Local Storage',exact:true})
 await expect(storage.locator('td[data-column=library]')).toHaveText(cloudOnly?'In Cloud':'Downloaded')
 await storage.getByLabel('Select Visible Works',{exact:true}).check()
 const deletion=storage.getByRole('button',{name:'Delete from Cloud',exact:true})
 await expect(deletion).toBeEnabled()
 page.once('dialog',dialog=>dialog.dismiss())
 await deletion.click()
 await expect(storage.locator('tbody tr')).toHaveCount(1)
 page.once('dialog',dialog=>dialog.accept())
 await deletion.click()
 await expect(storage.locator('tbody tr')).toHaveCount(0)
 await expect.poll(()=>values.get(`${hash}/deleted`)?.value).toBe(true)
 await context.close()
})

test('offers password sign-in without email sign-in links or a cloud download list',async({page})=>{
 await page.goto('/')
 await account(page)
 await expect(page.getByRole('button',{name:'Email Sign-In Link',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Download EPUB',exact:true})).toHaveCount(0)
 await expect(page.getByRole('textbox',{name:'Username or Email',exact:true})).toHaveAttribute('placeholder','Username or Email')
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('placeholder','Password')
 await page.getByRole('textbox',{name:'Username or Email',exact:true}).focus()
 await expect(page.getByRole('textbox',{name:'Username or Email',exact:true})).toHaveCSS('outline-style','none')
 await expect(page.getByRole('checkbox',{name:'Remember Me',exact:true})).toBeChecked()
 await expect(page.getByRole('button',{name:'Forgot Your Password?',exact:true})).toBeVisible()
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:test.info().outputPath(`reader-login-${width}.png`),fullPage:true})
 }
})
