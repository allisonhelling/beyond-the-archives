import { organizerAccount, owner } from './account-fixture'
import { test, expect, type Page } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { chapterNotesFiles, epubFiles } from '../../../src/test/epub-fixture'
import type { BookDetails } from '../../src/model'
import { connectOrganizer } from './library-fixture'

async function savedBooks(page: Page) {
 return page.evaluate(async dbName => {
  const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(dbName); request.onsuccess = () => resolve(request.result) })
  try { return await new Promise<BookDetails[]>(resolve => { const request = db.transaction('books').objectStore('books').getAll(); request.onsuccess = () => resolve(request.result) }) }
  finally { db.close() }
 }, `bta-reader-account:${owner}`)
}

test('automatically links saved AO3 EPUBs without replacing local edits or other account links', async ({ page, context }) => {
 await organizerAccount(context)
 const gets: number[] = [], writes: Record<string, unknown>[] = [], reports: string[][] = []
 let missingExists = false
 let remote = { id: 'organizer-8001', version: 'v1', status: 'to_read', progress: 0, notes: 'Organizer note', collections: ['collection-1'] }
 await context.route('**/rest/v1/rpc/userscript_library', async route => {
  const request = route.request().postDataJSON()
  if (request.p_action === 'reader_report') { reports.push(request.p_input.works); await route.fulfill({ json: {} }); return }
  if (request.p_action === 'get') gets.push(request.p_work)
  else { writes.push(request.p_input); remote = { ...remote, ...request.p_input, version: 'v2' } }
  const entry = request.p_work === 8001 ? remote : request.p_work === 8002 && missingExists ? { ...remote, id: 'organizer-8002' } : null
  await route.fulfill({ json: { entry, collections: [{ id: 'collection-1', name: 'Organizer Collection' }] } })
 })
 await page.goto('/')
 for (const [title, source] of [['Read Before Pairing', 'https://archiveofourown.org/works/8001'], ['Missing Organizer Work', 'https://archiveofourown.org/works/8002'], ['8001 Is Only a Title', 'urn:isbn:standalone']]) {
  const files = epubFiles({ source }).map(file => ({ ...file, content: file.content.replaceAll('Recovered &amp; Remembered', title) }))

  await page.getByLabel('Import EPUB File').setInputFiles({ name: `${title}.epub`, mimeType: 'application/epub+zip', buffer: Buffer.from(await createZip(files).arrayBuffer()) })
  await expect(page.getByLabel('Book Content')).toBeVisible()
  await expect(page.locator('.reading-work-name')).toHaveText(title)
  if (title === 'Read Before Pairing') {
   await page.getByRole('button', { name: 'Contents', exact: true }).click()
   await page.getByRole('complementary').getByRole('navigation', { name: 'Contents', exact: true }).getByRole('button').last().click()
   await page.getByRole('button', { name: 'Mark As Read', exact: true }).click()
   // Unmapped chapter completion opens the existing Manage EPUB dialog.
   await expect(page.getByRole('dialog', { name: 'Manage EPUB', exact: true })).toBeVisible()
   await page.getByRole('textbox', { name: 'Personal Notes', exact: true }).fill('Keep my local note')
   await page.getByRole('button', { name: 'Save Personal Notes', exact: true }).click()
   await page.getByRole('button', { name: 'Close Dialog', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Bookshelf', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'The Bookshelf', exact: true })).toBeVisible()
 }
 const card = page.locator('.story-card').filter({ has: page.getByRole('button', { name: 'Read Before Pairing', exact: true }) })
 const original = (await savedBooks(page)).find(book => book.workId === '8001')!
 expect(original.history).toHaveLength(1)
 expect((await savedBooks(page)).find(book => book.metadata.title === '8001 Is Only a Title')?.workId).toBeNull()
 // Existing foreign associations and queued edits must never be adopted implicitly.
 await page.evaluate(async dbName => {
  const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(dbName); request.onsuccess = () => resolve(request.result) })
  try {
   await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['books', 'catalog', 'pending'], 'readwrite'), request = tx.objectStore('books').getAll()
    request.onsuccess = () => {
     const linked = (request.result as BookDetails[]).find(book => book.workId === '8001')!
     // Recover the same Calibre identity for older cloud manifests on organizer sync.
     tx.objectStore('books').put({...linked,workId:null,metadata:{...linked.metadata,manual_url:undefined,calibre_work_link:'https://archiveofourown.org/works/8001/chapters/12'}})
     const source = (request.result as BookDetails[]).find(book => book.workId === '8002')!
     for (const [id, workId, account] of [['foreign', '8003', 'another-account'], ['waiting', '8004', undefined]]) {
      const book = { ...source, id, workId, account, hasFile: false }
      tx.objectStore('books').put(book)
      tx.objectStore('catalog').put({ ...book, completedCount: 0, chapterCount: source.chapters.length, wordCount: 0 })
     }
     tx.objectStore('pending').put({ id: 'foreign-edit', book: 'waiting', work: '8004', account: 'another-account', base: { id: 'old-entry', version: 'old' }, input: { notes: 'Queued note' } })
    }
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
   })
  } finally { db.close() }
 }, `bta-reader-account:${owner}`)
 await connectOrganizer(page)
 await expect.poll(async () => (await savedBooks(page)).find(book => book.workId === '8001')?.remote?.id).toBe('organizer-8001')
 await expect.poll(() => reports.at(-1)).toEqual(['8001'])
 let linked = (await savedBooks(page)).find(book => book.workId === '8001')!
 expect(linked).toMatchObject({ notes: 'Keep my local note', status: original.status, completed: original.completed, history: original.history, position: original.position, collections: ['Organizer Collection'] })
 expect(linked.account).toBeTruthy()
 expect((await savedBooks(page)).find(book => book.workId === '8002')?.account).toBeUndefined()
 expect(writes).toHaveLength(0)
 expect(gets).not.toContain(8003); expect(gets).not.toContain(8004)
 // A later organizer import is discovered on the normal next sync.
 missingExists = true
 await page.getByRole('button', { name: 'Profile Menu', exact: true }).click()
 await page.getByRole('button', { name: 'Organizer & Sync', exact: true }).click()
 await page.getByRole('button', { name: 'Sync Now', exact: true }).click()
 await expect.poll(async () => (await savedBooks(page)).find(book => book.workId === '8002')?.remote?.id).toBe('organizer-8002')
 await expect.poll(() => reports.at(-1)?.slice().sort()).toEqual(['8001', '8002'])
 linked = (await savedBooks(page)).find(book => book.workId === '8001')!
 expect(linked.notes).toBe('Keep my local note')
 expect(linked.history).toEqual(original.history)
 expect((await savedBooks(page)).find(book => book.id === 'foreign')?.account).toBe('another-account')
 expect((await savedBooks(page)).find(book => book.id === 'waiting')?.account).toBeUndefined()
 await page.getByRole('button', { name: 'Close Dialog', exact: true }).click()
 await card.getByRole('button', { name: 'Manage EPUB', exact: true }).click()
 await page.getByRole('textbox', { name: 'Personal Notes', exact: true }).fill('A linked edit')
 await page.getByRole('button', { name: 'Save Personal Notes', exact: true }).click()
 await expect.poll(() => writes.length).toBe(1)
 expect(writes[0]).toMatchObject({ notes: 'A linked edit', version: 'v1', base: { notes: 'Organizer note' } })
})

test('pulls AO3 chapter progress into the downloaded EPUB and opens the requested EPUB chapter',async({page,context})=>{
 await organizerAccount(context)
 let remote={id:'organizer-8001',version:'v1',status:'to_read',progress:0,notes:''}
 const writes:Record<string,unknown>[]=[],cloudFields=new Map<string,unknown>()
 await context.route('**/rest/v1/rpc/reader_cloud_apply',async route=>{
  const input=route.request().postDataJSON()
  cloudFields.set(input.p_key,input.p_value)
  return route.fulfill({json:{key:input.p_key,value:input.p_value,revision:input.p_base+1}})
 })
 await context.route('**/rest/v1/rpc/userscript_library',async route=>{
  const request=route.request().postDataJSON()
  if(request.p_action==='reader_report')return route.fulfill({json:{}})
  if(request.p_action!=='get'){writes.push(request.p_input);remote={...remote,...request.p_input,version:'reader-save'}}
  return route.fulfill({json:{entry:request.p_work===8001?remote:null}})
 })
 const files=chapterNotesFiles().map(file=>({...file,content:file.content.replace(/<h2 class="title">Chapter ([123])<\/h2>/g,(_match,n)=>`<h2 class="title"><a href="https://archiveofourown.org/works/8001/chapters/${100+Number(n)}">Chapter ${n}: Connected</a></h2>`)}))
 await page.goto('/')
 await page.getByLabel('Import EPUB File').setInputFiles({name:'mapped.epub',mimeType:'application/epub+zip',buffer:Buffer.from(await createZip(files).arrayBuffer())})
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await page.getByRole('button',{name:'Bookshelf',exact:true}).click()
 await connectOrganizer(page)
 await expect.poll(async()=>(await savedBooks(page))[0]?.remote?.id).toBe(remote.id)
 const initial=(await savedBooks(page))[0]
 expect(initial.chapters.filter(chapter=>chapter.ao3Id).map(chapter=>chapter.number)).toEqual([1,2,3])
 // The AO3 companion updates the same organizer entry; a foreground refresh bypasses the catalog cooldown.
 remote={...remote,version:'ao3-chapter-read',status:'reading',progress:2}
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect.poll(async()=>(await savedBooks(page))[0]?.completed.length).toBe(2)
 let synced=(await savedBooks(page))[0]
 expect(synced.status).toBe('reading')
 expect(synced.history).toEqual(initial.history)
 await expect.poll(()=>cloudFields.get(`${initial.id}/completed`)).toHaveLength(2)
 expect(writes).toHaveLength(0)
 await page.goto('/?work=8001&chapter=3')
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await expect(page.locator('.reader-toolbar .chapter-progress-button')).toHaveText('Chapter 2 / 3')
 await expect(page.getByRole('button',{name:'Mark As Read',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'Mark As Read',exact:true}).click()
 await expect.poll(()=>writes.length).toBe(1)
 expect(writes[0]).toMatchObject({progress:3,status:'finished'})
 remote={...remote,version:'ao3-reread',status:'re_reading',progress:0}
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect.poll(async()=>(await savedBooks(page))[0]?.completed.length).toBe(0)
 synced=(await savedBooks(page))[0]
 expect(synced.status).toBe('re_reading')
 expect(synced.history).toHaveLength(1)
 await expect.poll(()=>cloudFields.get(`${initial.id}/completed`)).toEqual([])
})
