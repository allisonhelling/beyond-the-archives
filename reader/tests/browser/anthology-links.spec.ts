import { createHash } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { anthologyFiles } from '../anthology-fixture'
import { organizerAccount, owner } from './account-fixture'
import { connectOrganizer } from './library-fixture'

async function importAnthology(page: Page, title: string, files = anthologyFiles()) {
  const buffer = Buffer.from(await createZip(files.map(file => ({ ...file, content: file.content.replaceAll('Three Fic Anthology', title) }))).arrayBuffer())
  await page.getByLabel('Import EPUB File').setInputFiles({ name: `${title}.epub`, mimeType: 'application/epub+zip', buffer })
  await expect(page.getByLabel('Book Content')).toBeVisible()
  await page.getByRole('button', { name: 'Bookshelf', exact: true }).click()
  return { buffer, id: createHash('sha256').update(buffer).digest('hex') }
}

test('anthology details link each matched fic and explicitly offer to add missing works', async ({ page, context }) => {
  await organizerAccount(context)
  let secondExists = false, writes = 0
  await context.route('**/rest/v1/rpc/userscript_library', async route => {
    const request = route.request().postDataJSON()
    if (!['get','reader_report'].includes(request.p_action)) writes++
    const exists = request.p_work === 91001 || request.p_work === 91002 && secondExists
    return route.fulfill({ json: { entry: exists ? { id: `organizer-${request.p_work}`, version: '1', status: 'to_read', progress: 0, notes: '' } : null, collections: [] } })
  })
  const files = anthologyFiles().map(file => ({ ...file, content: file.name.startsWith('book2/') ? file.content.replaceAll('https://archiveofourown.org/works/91003', 'https://fiction.example/fic-3') : file.content }))
  await page.goto('/')
  await importAnthology(page, 'Linked Anthology', files)
  await connectOrganizer(page)
  await page.getByLabel('Work Actions', { exact: true }).click()
  await page.getByRole('button', { name: 'View Details', exact: true }).click()
  const contents = page.getByRole('region', { name: 'Anthology Contents', exact: true })
  const first = contents.getByRole('listitem').filter({ hasText: 'Fic 1' }), second = contents.getByRole('listitem').filter({ hasText: 'Fic 2' }), third = contents.getByRole('listitem').filter({ hasText: 'Fic 3' })
  await expect(first.getByRole('link', { name: 'View in Organizer', exact: true })).toHaveAttribute('href', /\/stories\/organizer-91001$/)
  await expect(second).toContainText('Not in Organizer')
  const add = second.getByRole('link', { name: 'Add to Organizer', exact: true })
  const destination = new URL((await add.getAttribute('href'))!)
  expect(destination.pathname).toBe('/add')
  expect(destination.searchParams.get('url')).toBe('https://archiveofourown.org/works/91002')
  await expect(third).toContainText('AO3 work link needed.')
  await expect(third.getByRole('button', { name: 'Review Anthology Contents', exact: true })).toBeVisible()
  expect(writes).toBe(0)
  secondExists = true
  await page.getByRole('button', { name: 'Refresh Organizer Links', exact: true }).click()
  await expect(second.getByRole('link', { name: 'View in Organizer', exact: true })).toHaveAttribute('href', /\/stories\/organizer-91002$/)
  await expect(add).toHaveCount(0)
  await first.getByRole('button', { name: 'Read This Fic', exact: true }).click()
  await expect(page.locator('.current-anthology-work')).toContainText('Fic 1 · Chapter 1 of 3')
  await page.locator('.reading-work-name').click()
  await second.getByRole('button', { name: 'Read This Fic', exact: true }).click()
  await expect(page.locator('.current-anthology-work')).toContainText('Fic 2 · Chapter 1 of 1')
})

for (const width of [390, 1280]) test(`chooses an anthology for a fic and remembers only that fic at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/')
  await importAnthology(page, 'First Anthology')
  await importAnthology(page, 'Second Anthology')
  await page.goto('/?work=91002&chapter=1')
  const choice = page.getByRole('dialog', { name: 'Choose EPUB', exact: true })
  await expect(choice).toBeVisible()
  await expect(choice.getByRole('radio', { name: /^Second Anthology/ })).toBeChecked()
  await choice.getByRole('radio', { name: /^First Anthology/ }).check()
  await choice.getByRole('button', { name: 'Open EPUB', exact: true }).click()
  await expect(page.locator('.reading-work-name')).toHaveText('First Anthology')
  await expect(page.locator('.current-anthology-work')).toContainText('Fic 2 · Chapter 1 of 1')
  await page.reload()
  await expect(choice).toHaveCount(0)
  await expect(page.locator('.reading-work-name')).toHaveText('First Anthology')
  await page.goto('/?work=91003&chapter=1')
  await expect(choice).toBeVisible()
  await choice.getByRole('radio', { name: /^Second Anthology/ }).check()
  await choice.getByRole('checkbox', { name: 'Remember This Choice for This Work', exact: true }).uncheck()
  await choice.getByRole('button', { name: 'Open EPUB', exact: true }).click()
  await expect(page.locator('.reading-work-name')).toHaveText('Second Anthology')
  await expect(page.locator('.current-anthology-work')).toContainText('Fic 3 · Chapter 1 of 1')
  await page.reload()
  await expect(choice).toBeVisible()
  expect(await choice.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('downloads a chosen cloud anthology and opens the requested member', async ({ page, context }) => {
  await organizerAccount(context)
  await context.route('**/rest/v1/rpc/userscript_library', route => route.fulfill({ json: { entry: null, collections: [] } }))
  await page.goto('/')
  await importAnthology(page, 'Local Anthology')
  const cloud = await importAnthology(page, 'Cloud Anthology')
  await context.route('**/storage/v1/object/**', route => route.request().method() === 'GET' ? route.fulfill({ body: cloud.buffer, contentType: 'application/epub+zip' }) : route.fulfill({ json: {} }))
  await page.evaluate(async ({ owner, id }) => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(`bta-reader-account:${owner}`); request.onsuccess = () => resolve(request.result) })
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['books','catalog','contents','settings'], 'readwrite')
      for (const name of ['books','catalog']) { const store = tx.objectStore(name), request = store.get(id); request.onsuccess = () => store.put({ ...request.result, hasFile: false }) }
      tx.objectStore('contents').delete(id)
      tx.objectStore('settings').put({ id: `cloud-file:${id}`, value: true })
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
    }) } finally { db.close() }
  }, { owner, id: cloud.id })
  await page.goto('/?work=91002&chapter=1')
  const choice = page.getByRole('dialog', { name: 'Choose EPUB', exact: true })
  await expect(choice.getByRole('radio', { name: /^Local Anthology/ })).toBeChecked()
  await choice.getByRole('radio', { name: /^Cloud Anthology/ }).check()
  await choice.getByRole('button', { name: 'Download and Open', exact: true }).click()
  await expect(page.locator('.reading-work-name')).toHaveText('Cloud Anthology')
  await expect(page.locator('.current-anthology-work')).toContainText('Fic 2 · Chapter 1 of 1')
})
