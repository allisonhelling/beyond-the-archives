import { organizerAccount, owner, testOrganizer } from './account-fixture'
import { test, expect, type Page } from '@playwright/test'
import { blankMetadata } from '../../../src/features/library/model'
import { chapterVersion } from '../../src/epub'
import { metadataVersion } from '../../src/metadata'

// Seed the original schema so every scenario exercises the real browser's upgrade.
async function seedLegacy(page: Page, count: number, connected = false) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The Bookshelf' })).toBeVisible()
  await page.evaluate(async ({ metadata, version, chapterVersion, count, connected, dbName, organizer }) => {
    await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(dbName); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)
      request.onupgradeneeded = () => { for (const name of ['books', 'pending', 'settings']) request.result.createObjectStore(name, { keyPath: 'id' }) }
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['books', 'pending', 'settings'], 'readwrite')
      for (let index = 0; index < count; index++) {
        const id = String(index).padStart(6, '0'), chapter = `chapter:${id}`
        // Cloud originals are already present; measure organizer pulls alone.
        if(connected)tx.objectStore('settings').put({id:`cloud-file:${id}`,value:true})
        tx.objectStore('books').put({ id, workId: String(index + 1), active: true,
          metadata: { ...metadata, title: `Story ${id}`, authors: ['Test Author'], fandoms: ['Test Fandom'] }, metadataVersion: version, chapterVersion,
          chapters: [{ id: chapter, ao3Id: String(index + 100), number: 1, title: 'Chapter One', html: `<p>Story ${id} prose.</p>`, words: 3, path: 'chapter.xhtml' }],
          resources: { 'art.png': new Blob(['image']) }, file: new Blob([`original-${id}`]),
          importedAt: '2026-01-01T00:00:00Z', metadataAt: '2026-01-01T00:00:00Z', position: { chapter, fraction: 0 },
          completed: [], history: [{ id: `history:${id}`, chapter, at: '2026-01-01T00:00:00Z', words: 3, reread: false }],
          status: 'to_read', notes: `Private note ${id}`, collections: [],
          ...(connected && { account: 'test-account', remote: { id: `entry:${id}`, version: 'v1', status: 'to_read', progress: 0, notes: '' } }),
        })
      }
      if (!connected) tx.objectStore('pending').put({ id: 'legacy-pending', book: '000000', work: '1', account: 'legacy-account', base: { id: 'legacy-entry', version: 'v1', status: 'to_read', progress: 0, notes: '' }, input: { notes: 'Queued note' } })
      tx.objectStore('settings').put({ id: 'preferences', value: { content: 'chapter', layout: 'scroll', size: 20, width: 760, dark: false } })
      if (connected) tx.objectStore('settings').put({ id: 'connection', value: { backend: organizer.url, key: organizer.key, secret: 'paired-secret', account: 'test-account', name: 'Test Reader', label: 'Test Account' } })
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, { organizer: testOrganizer, metadata: blankMetadata, version: metadataVersion, chapterVersion, count, connected, dbName: connected ? `bta-reader-account:${owner}` : 'bta-reader' })
  await page.addInitScript(() => {
    const counts: Record<string, number> = {}
    Object.assign(window, { readerStorageCalls: counts })
    const get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll, put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.get = function (...args) { const key = `${this.name}.get`; counts[key] = (counts[key] ?? 0) + 1; return get.apply(this, args) }
    IDBObjectStore.prototype.getAll = function (...args) { const key = `${this.name}.getAll`; counts[key] = (counts[key] ?? 0) + 1; return getAll.apply(this, args) }
    IDBObjectStore.prototype.put = function (...args) { const key = `${this.name}.put`; counts[key] = (counts[key] ?? 0) + 1; return put.apply(this, args) }
  })
  await page.reload()
}
async function calls(page: Page) {
  return page.evaluate(() => (window as unknown as { readerStorageCalls: Record<string, number> }).readerStorageCalls)
}

test('migrates 10,000 books, pages/searches the catalog, and loads only the opened book', async ({ page }) => {
  test.setTimeout(90_000)
  await seedLegacy(page, 10_000)
  await expect(page.getByText('10000 works downloaded')).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('.story-card')).toHaveCount(24)
  await expect(page.getByRole('navigation', { name: 'Result Pages' })).toContainText('1–24 of 10000')
  expect((await calls(page))['contents.get'] ?? 0).toBe(0)
  expect((await calls(page))['books.getAll'] ?? 0).toBe(0)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Result Pages' })).toContainText('25–48 of 10000')
  await expect(page.getByRole('navigation', { name: 'Result Pages' }).locator('.pagination-controls .pagination-page')).toContainText('Page')
  await expect(page.getByRole('navigation', { name: 'Result Pages' }).locator('.pagination-controls .pagination-page')).toContainText('of 417')
  await page.getByLabel('Go to Page').fill('417')
  await page.getByLabel('Go to Page').press('Enter')
  await expect(page.locator('.story-card')).toHaveCount(16)
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Story 009999')
  await expect(page.locator('.story-card')).toHaveCount(16)
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.locator('.story-card')).toHaveCount(1)
  await expect(page.getByLabel('Go to Page')).toHaveValue('1')
  await page.getByRole('button', { name: 'Manage EPUB', exact: true }).click()
  await expect(page.getByLabel('Personal Notes')).toHaveValue('Private note 009999')
  expect((await calls(page))['contents.get'] ?? 0).toBe(0)
  await page.getByRole('button', { name: 'Close Dialog' }).click()
  await page.getByRole('button', { name: 'Start Reading', exact: false }).click()
  await expect(page.getByLabel('Book Content')).toContainText('Story 009999 prose.')
  expect((await calls(page))['contents.get']).toBe(1)
  const writes = (await calls(page))['contents.put']
  await page.getByRole('button', { name: 'Mark As Read', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mark As Read', exact: true })).toBeDisabled()
  // Unknown publication metadata opens the existing explicit status-choice dialog.
  await page.getByRole('button', { name: 'Close Dialog' }).click()
  await page.getByRole('button', { name: 'Bookshelf' }).click()
  await expect(page.getByRole('button',{name:'Chapter 1 of 1 — Edit Progress',exact:true})).toBeVisible()
  expect((await calls(page))['contents.get']).toBe(1)
  expect((await calls(page))['contents.put']).toBe(writes)
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('bta-reader'); request.onsuccess = () => resolve(request.result) })
    const tx = db.transaction(['books', 'catalog', 'contents']), id = '009999'
    const read = (store: string) => new Promise<Record<string, unknown>>(resolve => { const request = tx.objectStore(store).get(id); request.onsuccess = () => resolve(request.result) })
    const records = await Promise.all([read('books'), read('catalog'), read('contents')]); db.close(); return records
  })
  expect(stored[0]).toMatchObject({ notes: 'Private note 009999', hasFile: true, history: [expect.anything(), expect.anything()], chapters: [{ id: 'chapter:009999', words: 3 }] })
  expect(stored[0]).not.toHaveProperty('file')
  expect((stored[0].chapters as object[])[0]).not.toHaveProperty('html')
  for (const key of ['file', 'resources', 'chapters', 'history', 'completed', 'notes', 'remote']) expect(stored[1]).not.toHaveProperty(key)
  expect(stored[1]).toMatchObject({ completedCount: 1, chapterCount: 1, wordCount: 3 })
  expect(stored[2]).toHaveProperty('file')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.getByRole('button', { name: 'Storage', exact: true }).click()
  const storage = page.getByRole('dialog', { name: 'Manage Local Storage' })
  await expect(storage.locator('tbody tr')).toHaveCount(24)
  await storage.getByLabel('Search Library', { exact: true }).fill('009999')
  await expect(storage.locator('tbody tr')).toHaveCount(1)
  await storage.getByRole('button', { name: 'Select All', exact: true }).click()
  await expect(storage.getByRole('status').filter({hasText:'selected'})).toContainText('10000 selected')
  await storage.getByLabel('Search Library', { exact: true }).fill('')
  await expect(storage.locator('tbody tr[aria-selected=true]')).toHaveCount(24)
  await storage.getByRole('button', { name: 'Clear Selection', exact: true }).click()
  await expect(storage.getByRole('status').filter({hasText:'selected'})).toContainText('0 selected')
  const sheet=storage.locator('.storage-table-scroll')
  expect(await sheet.evaluate(node=>node.scrollHeight<=node.clientHeight+1)).toBe(true)
  await storage.evaluate(node=>{const table=node.querySelector('.storage-table-scroll')!;node.scrollTop+=table.getBoundingClientRect().top-node.getBoundingClientRect().top})
  expect(Math.abs((await sheet.boundingBox())!.y)).toBeLessThan(2)
  await storage.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(storage.getByLabel('Go to Page')).toHaveValue('2')
  await expect(storage.locator('tbody tr')).toHaveCount(24)
})

test('shows browser storage usage and persistence status, including unavailable estimates', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'estimate', { configurable: true, value: async () => ({ usage: 1024 ** 3, quota: 10 * 1024 ** 3 }) })
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
  })
  await page.goto('/')
  await expect(page.getByLabel('Storage Usage')).toContainText('1 GB used of 10 GB browser allowance')
  await expect(page.getByLabel('Storage Usage')).toContainText('Storage may be cleared automatically')
  await page.addInitScript(() => { Object.defineProperty(navigator.storage, 'estimate', { configurable: true, value: async () => { throw new Error('Unavailable') } }) })
  await page.reload()
  await expect(page.getByLabel('Storage Usage')).toContainText('Storage estimate unavailable')
})

test('bounds background sync, limits concurrency, and checks the full catalog on manual sync', async ({ page, context }) => {
  await organizerAccount(context)
  const requested: string[] = []
  let inFlight = 0, maximum = 0, reports = 0
  await context.route('**/rest/v1/rpc/userscript_library', async route => {
    const request = route.request().postDataJSON()
    if (request.p_action === 'reader_report') { reports++; await route.fulfill({ json: {} }); return }
    requested.push(String(request.p_work)); inFlight++; maximum = Math.max(maximum, inFlight)
    await new Promise(resolve => setTimeout(resolve, 15))
    await route.fulfill({ json: { entry: { id: `entry:${request.p_work}`, version: 'v2', status: 'reading', progress: 0, notes: 'Organizer note' }, collections: [] } })
    inFlight--
  })
  async function checkpointAfter() {
    return page.evaluate(async dbName => {
      const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(dbName); request.onsuccess = () => resolve(request.result) })
      const value = await new Promise<{value: {after: string}} | undefined>(resolve => { const request = db.transaction('settings').objectStore('settings').get('sync-checkpoint:test-account'); request.onsuccess = () => resolve(request.result) }); db.close(); return value?.value.after
    }, `bta-reader-account:${owner}`)
  }
  await seedLegacy(page, 125, true)
  await expect.poll(checkpointAfter).toBe('000049')
  await expect(page.getByRole('status').filter({ hasText: 'Checked 50 of 125' })).toHaveCount(0)
  expect(requested).toHaveLength(50)
  expect(maximum).toBeLessThanOrEqual(4)
  expect((await calls(page))['contents.get'] ?? 0).toBe(reports * 125)
  const reportsBeforeReload = reports
  await page.reload()
  await expect.poll(() => reports).toBeGreaterThan(reportsBeforeReload)
  expect((await calls(page))['contents.get'] ?? 0).toBe((reports - reportsBeforeReload) * 125)
  await expect(page.getByRole('status').filter({ hasText: 'Organizer refresh will continue on a later sync' })).toHaveCount(0)
  expect(requested).toHaveLength(50)
  await page.getByRole('button', { name: 'Profile Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Organizer & Sync' }).click()
  await page.getByRole('button', { name: 'Sync Now', exact: true }).click()
  await expect.poll(() => requested.length).toBe(175)
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'false')
  await expect.poll(checkpointAfter).toBe('000124')
  expect(new Set(requested).size).toBe(125)
  await page.getByRole('button', { name: 'Sync Now', exact: true }).click()
  await expect.poll(() => new Set(requested).size).toBe(125)
  // Availability verifies all 125 local files on each sync; organizer pulls remain catalog-only.
  expect((await calls(page))['contents.get'] ?? 0).toBe((reports - reportsBeforeReload) * 125)
  expect((await calls(page))['books.getAll'] ?? 0).toBe(0)
})


test('rolls back a failed storage upgrade and preserves the original files for retry', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'contents' && sessionStorage.getItem('allow-upgrade') !== 'yes') throw new DOMException('Simulated storage exhaustion', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await seedLegacy(page, 2)
  await expect(page.getByRole('status').filter({ hasText: 'abort' })).toBeVisible()
  const original = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('bta-reader'); request.onsuccess = () => resolve(request.result) })
    const version = db.version, stores = Array.from(db.objectStoreNames)
    const book = await new Promise<{file: Blob; chapters: {html: string}[]}>(resolve => { const request = db.transaction('books').objectStore('books').get('000000'); request.onsuccess = () => resolve(request.result) })
    db.close(); sessionStorage.setItem('allow-upgrade', 'yes')
    return { version, stores, file: await book.file.text(), html: book.chapters[0].html }
  })
  expect(original).toEqual({ version: 1, stores: ['books', 'pending', 'settings'], file: 'original-000000', html: '<p>Story 000000 prose.</p>' })
  await page.reload()
  await expect(page.locator('.story-card')).toHaveCount(2)
  const preserved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('bta-reader'); request.onsuccess = () => resolve(request.result) })
    const tx = db.transaction(['contents', 'pending', 'settings'])
    const read = (store: string, id: string) => new Promise<{file?: Blob; input?: object; value?: object}>(resolve => { const request = tx.objectStore(store).get(id); request.onsuccess = () => resolve(request.result) })
    const [content, pending, preference] = await Promise.all([read('contents', '000000'), read('pending', 'legacy-pending'), read('settings', 'preferences')])
    db.close(); return { file: await content.file!.text(), input: pending.input, preference: preference.value }
  })
  expect(preserved).toMatchObject({ file: 'original-000000', input: { notes: 'Queued note' }, preference: { size: 20 } })
})

test('removes only the selected download while preserving its state and other book content', async ({ page }) => {
  await seedLegacy(page, 2)
  await expect(page.locator('.story-card')).toHaveCount(2)
  await page.goto('/?work=1&manage=1')
  await expect(page.getByRole('dialog', { name: 'Manage EPUB' })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Remove Download', exact: true }).click()
  await expect(page.locator('.story-card')).toHaveCount(2)
  await expect(page.locator('.story-card .availability').filter({ hasText: 'Available In Cloud' })).toHaveCount(1)
  expect((await calls(page))['contents.get'] ?? 0).toBe(0)
  const removed = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('bta-reader'); request.onsuccess = () => resolve(request.result) })
    const tx = db.transaction(['books', 'contents', 'catalog'])
    const read = (store: string) => new Promise<Record<string, unknown>[]>(resolve => { const request = tx.objectStore(store).getAll(); request.onsuccess = () => resolve(request.result) })
    const [books, contents, catalog] = await Promise.all([read('books'), read('contents'), read('catalog')]); db.close()
    return { book: books[0], contents: contents.map(c => c.id), catalog: catalog[0] }
  })
  expect(removed.book).toMatchObject({ id: '000000', hasFile: false, notes: 'Private note 000000', history: [expect.anything()], position: { chapter: 'chapter:000000', fraction: 0 } })
  expect(removed.catalog).toMatchObject({ id: '000000', hasFile: false })
  expect(removed.contents).toEqual(['000001'])
})
