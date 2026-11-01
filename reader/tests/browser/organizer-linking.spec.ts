import { test, expect, type Page } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { epubFiles } from '../../../src/test/epub-fixture'
import type { BookDetails } from '../../src/model'
import { connectOrganizer } from './library-fixture'

async function savedBooks(page: Page) {
 return page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('bta-reader'); request.onsuccess = () => resolve(request.result) })
  try { return await new Promise<BookDetails[]>(resolve => { const request = db.transaction('books').objectStore('books').getAll(); request.onsuccess = () => resolve(request.result) }) }
  finally { db.close() }
 })
}

test('automatically links saved AO3 EPUBs without replacing local edits or other account links', async ({ page, context }) => {
 const gets: number[] = [], writes: Record<string, unknown>[] = [], reports: string[][] = []
 let missingExists = false
 let remote = { id: 'organizer-8001', version: 'v1', status: 'to_read', progress: 0, notes: 'Organizer note', collections: ['collection-1'] }
 await context.route('https://pnrdztfydurupcqwumvr.supabase.co/rest/v1/rpc/userscript_library', async route => {
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
   await page.getByRole('button', { name: 'Mark Chapter Read', exact: true }).click()
   // Unmapped chapter completion opens the existing Manage EPUB dialog.
   await expect(page.getByRole('dialog', { name: 'Manage EPUB', exact: true })).toBeVisible()
   await page.getByRole('textbox', { name: 'Personal Notes', exact: true }).fill('Keep my local note')
   await page.getByRole('button', { name: 'Save Personal Notes', exact: true }).click()
   await page.getByRole('button', { name: 'Close Dialog', exact: true }).click()
  }
  await page.getByRole('button', { name: '← Bookshelf', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'The Bookshelf', exact: true })).toBeVisible()
 }
 const card = page.locator('.story-card').filter({ has: page.getByRole('button', { name: 'Read Before Pairing', exact: true }) })
 const original = (await savedBooks(page)).find(book => book.workId === '8001')!
 expect(original.history).toHaveLength(1)
 expect((await savedBooks(page)).find(book => book.metadata.title === '8001 Is Only a Title')?.workId).toBeNull()
 // Existing foreign associations and queued edits must never be adopted implicitly.
 await page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('bta-reader'); request.onsuccess = () => resolve(request.result) })
  try {
   await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['books', 'catalog', 'pending'], 'readwrite'), request = tx.objectStore('books').getAll()
    request.onsuccess = () => {
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
 })
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
