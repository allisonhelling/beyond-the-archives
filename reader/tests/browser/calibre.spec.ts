import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { chapterNotesFiles } from '../../../src/test/epub-fixture'
import { owner, signedIn } from './account-fixture'
test('counts the complete cloud inbox before staging files and retains known counts during queue failures',async({page,context})=>{
 await signedIn(context)
 const destinations=['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002']
 let incoming=Array.from({length:503},(_,index)=>({destination:destinations[index<501?0:1],id:`50000000-0000-0000-0000-${String(index<501?index+1:index-500).padStart(12,'0')}`,hash:(index+1).toString(16).padStart(64,'0'),metadata:{_filename:`Queued ${index+1}.epub`},status:'queued',message:''}))
 const first=incoming[0],jobId=`cloud:${first.destination}:${first.id}`
 let failQueue=false,metadataPages=0
 await context.route(url=>/^\/(auth|rest|storage)\/v1\//.test(url.pathname),route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(path.includes('/reader_app_access'))return route.fulfill({json:{user_id:owner}})
  if(path.includes('/reader_import_inbox')){
   const metadataOnly=url.searchParams.get('select')!=='*'
   if(!metadataOnly)return route.fulfill({json:incoming.slice(0,50)})
   metadataPages++
   if(failQueue)return route.fulfill({status:500,json:{code:'57014',message:'Queue request timed out'}})
   const cursor=url.searchParams.get('or')??'',destination=cursor.match(/destination\.gt\.([0-9a-f-]+)/)?.[1],id=cursor.match(/id\.gt\.([0-9a-f-]+)/)?.[1]
   const rows=incoming.filter(row=>!destination||row.destination>destination||row.destination===destination&&row.id>id!)
   return route.fulfill({json:rows.slice(0,Number(url.searchParams.get('limit'))).map(row=>({destination:row.destination,id:row.id,hash:row.hash,filename:row.metadata._filename}))})
  }
  if(path.includes('/storage/v1/object/'))return route.abort()
  if(path.includes('/reader_cloud_values'))return route.fulfill({json:[]})
  if(path.includes('/reader_organizer_connection'))return route.fulfill({json:{enabled:false,userId:owner}})
  return route.fulfill({json:[]})
 })
 await page.goto('/')
 await page.getByRole('button',{name:'Calibre',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Calibre Transfers',exact:true})
 await dialog.getByRole('tab',{name:'Pending (503)',exact:true}).click()
 expect(metadataPages).toBe(2)
 await expect(dialog.getByText('Queued 1.epub · queued',{exact:true})).toBeVisible()
 await expect(page.locator('.story-card')).toHaveCount(0)
 // A local job replaces its inbox placeholder and stays pending until publication/acknowledgement.
 await page.evaluate(async({owner,jobId,first})=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open(`bta-reader-account:${owner}`);request.onsuccess=()=>resolve(request.result)})
  await new Promise<void>(resolve=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:`calibre-job:${jobId}`,value:{id:jobId,hash:first.hash,filename:first.metadata._filename,metadata:{},status:'imported',releaseDownload:true,message:'Saved locally'}});tx.oncomplete=()=>resolve()})
  db.close()
 },{owner,jobId,first})
 await expect(dialog.getByText('Import saved; waiting for transfer confirmation.',{exact:true})).toBeVisible()
 await expect(dialog.getByRole('tab',{name:'Pending (503)',exact:true})).toBeVisible()
 incoming=incoming.slice(1)
 await page.evaluate(async({owner,jobId})=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open(`bta-reader-account:${owner}`);request.onsuccess=()=>resolve(request.result)})
  await new Promise<void>(resolve=>{const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),request=store.get(`calibre-job:${jobId}`);request.onsuccess=()=>store.put({...request.result,value:{...request.result.value,releaseDownload:false}});store.put({id:`calibre-ack:${jobId}`,value:'imported'});tx.oncomplete=()=>resolve()})
  db.close()
 },{owner,jobId})
 await expect(dialog.getByRole('tab',{name:'Successful (1)',exact:true})).toBeVisible()
 await expect(dialog.getByRole('tab',{name:'Pending (502)',exact:true})).toBeVisible()
 failQueue=true
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))
 await expect(dialog.getByRole('alert')).toContainText('Queue request timed out (57014)')
 await expect(dialog.getByRole('tab',{name:'Pending (502 Known)',exact:true})).toBeVisible()
 failQueue=false
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))
 await expect(dialog.getByRole('alert')).toHaveCount(0)
 await expect(dialog.getByRole('tab',{name:'Pending (502)',exact:true})).toBeVisible()
})
test('local Calibre deliveries share duplicates, versions, mapping, and durable per-book results',async({page,context})=>{
 const files=chapterNotesFiles(),original=Buffer.from(await createZip(files).arrayBuffer())
 files[2].content=files[2].content.replace('</metadata>','<meta name="revision" content="2"/></metadata>')
 const chapter=files.find(file=>file.name.endsWith('/chapter.xhtml'))!
 chapter.content=chapter.content.replace('</body>','<img src="failedtoload https://images.invalid/art.png" alt="Unavailable art"/></body>')
 // The replacement has no usable embedded AO3 identity; the Calibre column supplies it.
 for(const file of files) file.content=file.content.replaceAll('https://archiveofourown.org/works/8001','https://fiction.invalid/story')
 const newer=Buffer.from(await createZip(files).arrayBuffer())
 const payloads=[original,newer,Buffer.from('invalid EPUB')]
 const receipts=new Map<string,{status:string;message:string}>()
 let credential='',firstRequested=false,repeatDelivery=false
 const requested:string[]=[]
 let releaseFirst:()=>void=()=>{}
 const firstFile=new Promise<void>(resolve=>{releaseFirst=resolve})
 await context.route('http://127.0.0.1:47821/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:4174','Access-Control-Allow-Headers':'authorization,x-reader-destination,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}})
  expect(req.headers().authorization).toBe('Bearer '+credential)
  if(path==='/inbox')return route.fulfill({json:[...payloads,...(repeatDelivery?[newer]:[])].map((file,index)=>({id:String(index),hash:createHash('sha256').update(file).digest('hex'),metadata:{_calibre_uuid:index===0?'20000000-0000-0000-0000-000000000001':'20000000-0000-0000-0000-000000000002',calibre_work_link:'https://archiveofourown.org/works/8001/chapters/12',title:index===3?'Updated Calibre Metadata':'Calibre Title',fandoms:['Mapped Fandom'],_filename:`story-${index}.epub`},status:'queued',message:''})).filter(row=>!receipts.has(row.id))})
  if(path.startsWith('/books/')) {
   requested.push(path)
   if(path==='/books/1'){firstRequested=true;await firstFile}
   return route.fulfill({body:payloads[Number(path.split('/').at(-1))],contentType:'application/epub+zip'})
  }
  receipts.set(path.split('/').at(-1)!,req.postDataJSON())
  return route.fulfill({json:{ok:true}})
 })
 await page.goto('/')
 await page.getByLabel('Import EPUB File').setInputFiles({name:'manual.epub',mimeType:'application/epub+zip',buffer:original})
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await page.getByRole('button',{name:'Contents',exact:true}).click()
 await page.getByRole('complementary',{name:'Contents',exact:true}).getByRole('button',{name:'1. Chapter 1',exact:true}).click()
 await page.getByRole('button',{name:'Mark As Read',exact:true}).click()
 await page.getByRole('button',{name:'Bookshelf'}).click()
 await page.getByRole('button',{name:'Manage EPUB',exact:true}).click()
 await page.getByRole('textbox',{name:'Personal Notes',exact:true}).fill('Keep this reading history')
 await page.getByRole('button',{name:'Save Personal Notes',exact:true}).click()
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 // An unsent organizer edit must move to the replacement rather than disappear.
 await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('bta-reader');request.onsuccess=()=>resolve(request.result)})
  try{await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(['books','pending'],'readwrite'),books=tx.objectStore('books').getAll()
   books.onsuccess=()=>tx.objectStore('pending').put({id:'pending-note',book:books.result[0].id,work:'8001',account:'organizer-test',base:{id:'entry',version:'v1',status:'reading',progress:1,notes:''},input:{notes:'Keep this reading history'}})
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)
  })}finally{db.close()}
 })
 await page.getByRole('button',{name:'Calibre',exact:true}).click()
 await expect(page.getByRole('button',{name:'Check for Incoming Books',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Cancel Pending Imports',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Pair Calibre',exact:true}).click()
 await expect(page.getByRole('button',{name:'Check for Incoming Books',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Cancel Pending Imports',exact:true})).toBeVisible()
 await expect(page.getByLabel('Calibre Pairing Configuration')).toBeHidden()
 await expect(page.getByRole('button',{name:'Copy Pairing Configuration',exact:true})).toBeHidden()
 await page.locator('summary').filter({hasText:/^Pairing Configuration$/}).click()
 await expect(page.getByLabel('Calibre Pairing Configuration')).toBeVisible()
 const config=JSON.parse(await page.getByLabel('Calibre Pairing Configuration').inputValue())
 await page.locator('summary').filter({hasText:/^Pairing Configuration$/}).press('Enter')
 await expect(page.getByLabel('Calibre Pairing Configuration')).toBeHidden()
 expect(config.account).toBe('');expect(config.cloud).toBe(false)
 credential=config.token
 await page.getByRole('button',{name:'Check for Incoming Books',exact:true}).click()
 await expect.poll(()=>firstRequested).toBe(true)
 await page.getByRole('button',{name:'Cancel Pending Imports',exact:true}).click()
 releaseFirst()
 await expect.poll(()=>receipts.size).toBe(3)
 expect([...receipts.values()].map(result=>result.status)).toEqual(['cancelled','cancelled','cancelled'])
 await page.getByRole('tab',{name:/Failed/}).click()
 for(const index of [0,1,2]) {
  await page.locator('.pending-item').filter({hasText:`story-${index}.epub`}).getByRole('button',{name:'Retry Import',exact:true}).click()
  await expect.poll(()=>receipts.get(String(index))?.status).not.toBe('cancelled')
 }
 expect(receipts.get('0')?.status).toBe('duplicate')
 expect(receipts.get('1')?.status).toBe('imported')
 expect(receipts.get('1')?.message).toContain('1 unavailable image replaced with placeholders')
 expect(receipts.get('2')?.status).toBe('error')
 const queued=await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('bta-reader');request.onsuccess=()=>resolve(request.result)})
  try{return await new Promise<{book:string;input:{notes:string}}>(resolve=>{const request=db.transaction('pending').objectStore('pending').get('pending-note');request.onsuccess=()=>resolve(request.result)})}finally{db.close()}
 })
 expect(queued).toMatchObject({book:createHash('sha256').update(newer).digest('hex'),input:{notes:'Keep this reading history'}})
 await page.getByRole('button',{name:'Check for Incoming Books',exact:true}).click()
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await expect(page.locator('.story-card')).toHaveCount(1)
 await expect(page.getByText('Retained version · Organizer links open the active version')).toHaveCount(0)
 await page.locator('.story-card').filter({hasText:'Calibre Title'}).last().getByRole('button',{name:'Manage EPUB',exact:true}).click()
 await expect(page.getByRole('textbox',{name:'Personal Notes',exact:true})).toHaveValue('Keep this reading history')
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await expect(page.getByRole('button',{name:/^Chapter 1 of \d+ — Edit Progress$/})).toHaveCount(1)
 expect(requested).not.toContain('/books/0')
 repeatDelivery=true
 await page.getByRole('button',{name:'Calibre',exact:true}).click()
 await page.getByRole('button',{name:'Check for Incoming Books',exact:true}).click()
 await expect.poll(()=>receipts.get('3')?.status).toBe('duplicate')
 expect(requested).not.toContain('/books/3')
 await page.getByRole('tab',{name:/Successful/}).click()
 await expect(page.getByRole('tabpanel')).toContainText('story-3.epub · duplicate')
 await expect(page.getByRole('tabpanel')).not.toContainText('story-2.epub')
 const tabs=page.getByRole('tablist',{name:'Transfer Results'}),panel=page.getByRole('tabpanel')
 for(const width of [1280,390]) {
  await page.setViewportSize({width,height:900})
  const buttons=await tabs.getByRole('tab').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().bottom))
  const bounds=(await panel.boundingBox())!
  expect(bounds.y-Math.max(...buttons)).toBeGreaterThanOrEqual(16)
 }
 await page.getByRole('tab',{name:/Successful/}).press('ArrowRight')
 await expect(page.getByRole('tab',{name:/Failed/})).toBeFocused()
 await expect(page.getByRole('tabpanel')).toContainText('story-2.epub · error')
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await expect(page.locator('.story-card')).toHaveCount(1)
 await expect(page.getByRole('button',{name:'Updated Calibre Metadata',exact:true})).toBeVisible()
 await page.getByLabel('Work Actions',{exact:true}).click()
 await page.getByRole('button',{name:'View Details',exact:true}).click()
 const details=page.getByRole('dialog',{name:'View Details',exact:true})
 await expect(details.locator('dt').filter({hasText:/^Calibre Work Link$/}).locator('..').locator('dd')).toHaveText('https://archiveofourown.org/works/8001')
 await details.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await page.setViewportSize({width:1280,height:900})
 await page.reload()
 await page.getByRole('button',{name:'Calibre',exact:true}).click()
 await page.getByRole('tab',{name:/Failed/}).click()
 await expect(page.getByText('story-2.epub · error',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Retry Import',exact:true})).toBeVisible()
 await expect(page.getByLabel('Calibre Pairing Configuration')).toBeHidden()
 await page.locator('summary').filter({hasText:/^Pairing Configuration$/}).click()
 await page.getByRole('button',{name:'Revoke Pairing',exact:true}).click()
 await expect(page.getByRole('button',{name:'Pair Calibre',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Check for Incoming Books',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Cancel Pending Imports',exact:true})).toHaveCount(0)
})
