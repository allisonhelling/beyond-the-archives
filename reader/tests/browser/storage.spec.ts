import { expect, test } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { epubFiles } from '../../../src/test/epub-fixture'
async function fixture(extra = '') {
  const files = epubFiles()
  files[files.length - 1].content = String(files.at(-1)!.content).replace('</body>', `<p>${extra}</p></body>`)
  return Buffer.from(await createZip(files).arrayBuffer())
}
test('reports storage exhaustion without deleting downloads, then removes only the chosen file and permits retry', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Import EPUB File').setInputFiles({ name: 'saved.epub', mimeType: 'application/epub+zip', buffer: await fixture() })
  await expect(page.getByLabel('Book Content')).toBeVisible()
  await page.getByRole('button', { name: '← Bookshelf' }).click()
  await page.getByRole('button', { name: 'Manage EPUB', exact: true }).click()
  await page.getByLabel('Personal Notes', { exact: true }).fill('Keep my notes')
  await page.getByRole('button', { name: 'Save Personal Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Close Dialog' }).click()
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'contents' && sessionStorage.getItem('storage-failure') !== 'resolved') throw new DOMException('Storage is full', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  const replacement = { name: 'second.epub', mimeType: 'application/epub+zip', buffer: await fixture('Another edition') }
  await page.getByLabel('Import EPUB File').setInputFiles(replacement)
  await page.getByRole('button', { name: 'Keep Both Versions' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage Local Storage' })
  await expect(dialog.getByRole('alert')).toContainText('Browser storage is full')
  await expect(dialog.getByRole('button', { name: 'Remove Download', exact: true })).toHaveCount(1)
  await expect(page.locator('.story-card')).toHaveCount(1)
  await dialog.getByLabel('Select Visible Works', { exact: true }).check()
  page.once('dialog', prompt => void prompt.accept())
  await dialog.getByRole('button', { name: 'Remove Download', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Remove Download', exact: true })).toBeDisabled()
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('bta-reader'); request.onsuccess = () => resolve(request.result) })
    const result = await new Promise<{ books: { notes: string; hasFile: boolean }[]; files: number }>(resolve => {
      const tx = db.transaction(['books', 'contents']), books = tx.objectStore('books').getAll(), files = tx.objectStore('contents').count()
      tx.oncomplete = () => resolve({ books: books.result, files: files.result })
    })
    db.close(); sessionStorage.setItem('storage-failure', 'resolved'); return result
  })
  expect(saved.files).toBe(0)
  expect(saved.books).toMatchObject([{ notes: 'Keep my notes', hasFile: false }])
  await dialog.getByRole('button', { name: 'Close Dialog' }).click()
  // The failed import stays available to retry after freeing space.
  await page.getByRole('button', { name: 'Keep Both Versions' }).click()
  await expect(page.getByLabel('Book Content')).toBeVisible()
  await page.getByRole('button', { name: '← Bookshelf' }).click()
  await expect(page.locator('.story-card')).toHaveCount(2)
  await expect(page.locator('.story-card .availability').filter({ hasText: 'Available In Cloud' })).toHaveCount(1)
})
test('uses fresh pages online while retaining the prepared shell offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Reader prepared for offline use', { exact: false })).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    const key = (await caches.keys()).filter(key => key.startsWith('reader-')).sort().at(-1)!
    const cache = await caches.open(key), original = await cache.match('/index.html')
    sessionStorage.setItem('original-shell', await original!.text())
    await cache.put('/index.html', new Response('<!doctype html><h1>Outdated Cached Reader</h1>', { headers: { 'Content-Type': 'text/html' } }))
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The Bookshelf' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Outdated Cached Reader' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Profile Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Organizer & Sync', exact: true }).click()
  await expect(page.getByRole('dialog',{name:'Reader Account & Cloud Library'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Create Account',exact:true})).toBeVisible()
  await expect(page.getByLabel('Backend URL', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Public API Key', { exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    const key = (await caches.keys()).filter(key => key.startsWith('reader-')).sort().at(-1)!
    await (await caches.open(key)).put('/index.html', new Response(sessionStorage.getItem('original-shell')!, { headers: { 'Content-Type': 'text/html' } }))
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The Bookshelf' })).toBeVisible()
})
