import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { chapterNotesFiles } from '../../../src/test/epub-fixture'
test('local Calibre deliveries share duplicates, versions, mapping, and durable per-book results',async({page,context})=>{
 const files=chapterNotesFiles(),original=Buffer.from(await createZip(files).arrayBuffer())
 files[2].content=files[2].content.replace('</metadata>','<meta name="revision" content="2"/></metadata>')
 const newer=Buffer.from(await createZip(files).arrayBuffer())
 const payloads=[original,newer,Buffer.from('invalid EPUB')]
 const receipts=new Map<string,{status:string;message:string}>()
 let credential='',firstRequested=false
 let releaseFirst:()=>void=()=>{}
 const firstFile=new Promise<void>(resolve=>{releaseFirst=resolve})
 await context.route('http://127.0.0.1:47821/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:4174','Access-Control-Allow-Headers':'authorization,x-reader-destination,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}})
  expect(req.headers().authorization).toBe('Bearer '+credential)
  if(path==='/inbox')return route.fulfill({json:payloads.map((file,index)=>({id:String(index),hash:createHash('sha256').update(file).digest('hex'),metadata:{title:'Calibre Title',fandoms:['Mapped Fandom'],_filename:`story-${index}.epub`},status:'queued',message:''})).filter(row=>!receipts.has(row.id))})
  if(path.startsWith('/books/')) {
   if(path==='/books/0'){firstRequested=true;await firstFile}
   return route.fulfill({body:payloads[Number(path.split('/').at(-1))],contentType:'application/epub+zip'})
  }
  receipts.set(path.split('/').at(-1)!,req.postDataJSON())
  return route.fulfill({json:{ok:true}})
 })
 await page.goto('/')
 await page.getByLabel('Import EPUB File').setInputFiles({name:'manual.epub',mimeType:'application/epub+zip',buffer:original})
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await page.getByRole('button',{name:'Contents',exact:true}).click()
 await page.getByRole('complementary',{name:'Contents',exact:true}).getByRole('button',{name:'Chapter 1',exact:true}).click()
 await page.getByRole('button',{name:'Mark Chapter Read',exact:true}).click()
 await page.getByRole('button',{name:'← Bookshelf'}).click()
 await page.getByRole('button',{name:'Manage EPUB',exact:true}).click()
 await page.getByRole('textbox',{name:'Personal Notes',exact:true}).fill('Keep this reading history')
 await page.getByRole('button',{name:'Save Personal Notes',exact:true}).click()
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await page.getByRole('button',{name:'Calibre Transfers',exact:true}).click()
 await expect(page.getByRole('button',{name:'Check for Incoming Books',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Cancel Pending Imports',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Pair Calibre',exact:true}).click()
 await expect(page.getByRole('button',{name:'Check for Incoming Books',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Cancel Pending Imports',exact:true})).toBeVisible()
 const config=JSON.parse(await page.getByLabel('Calibre Pairing Configuration').inputValue())
 expect(config.account).toBe('');expect(config.cloud).toBe(false)
 credential=config.token
 await page.getByRole('button',{name:'Check for Incoming Books',exact:true}).click()
 await expect.poll(()=>firstRequested).toBe(true)
 await page.getByRole('button',{name:'Cancel Pending Imports',exact:true}).click()
 releaseFirst()
 await expect.poll(()=>receipts.size).toBe(3)
 expect([...receipts.values()].map(result=>result.status)).toEqual(['cancelled','cancelled','cancelled'])
 for(const index of [0,1,2]) {
  await page.locator('.pending-item').filter({hasText:`story-${index}.epub`}).getByRole('button',{name:'Retry Import',exact:true}).click()
  await expect.poll(()=>receipts.get(String(index))?.status).not.toBe('cancelled')
 }
 expect(receipts.get('0')?.status).toBe('duplicate')
 expect(receipts.get('1')?.status).toBe('imported')
 expect(receipts.get('2')?.status).toBe('error')
 await page.getByRole('button',{name:'Check for Incoming Books',exact:true}).click()
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await expect(page.locator('.story-card')).toHaveCount(2)
 await expect(page.getByText('Retained version · Organizer links open the active version')).toBeVisible()
 await page.locator('.story-card').filter({hasText:'Calibre Title'}).last().getByRole('button',{name:'Manage EPUB',exact:true}).click()
 await expect(page.getByRole('textbox',{name:'Personal Notes',exact:true})).toHaveValue('Keep this reading history')
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await expect(page.getByText('1 chapters read', {exact:true})).toHaveCount(2)
 await page.reload()
 await page.getByRole('button',{name:'Calibre Transfers',exact:true}).click()
 await expect(page.getByText('story-2.epub · error',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Retry Import',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Revoke Pairing',exact:true}).click()
 await expect(page.getByRole('button',{name:'Pair Calibre',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Check for Incoming Books',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Cancel Pending Imports',exact:true})).toHaveCount(0)
})
