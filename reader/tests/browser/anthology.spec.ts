import { expect, test } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { anthologyFiles } from '../anthology-fixture'
import { organizerAccount, owner } from './account-fixture'
import { connectOrganizer } from './library-fixture'

for (const width of [390, 1280]) test(`anthology counts, reading, and content corrections persist at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/')
  await page.getByLabel('Import EPUB File').setInputFiles({ name: 'anthology.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(await createZip(anthologyFiles()).arrayBuffer()) })
  await expect(page.getByLabel('Book Content')).toBeVisible()
  const mark = page.locator('.reading-footer').getByRole('button', { name: 'Mark Chapter Read', exact: true })
  await expect(mark).toBeDisabled() // Title pages never count as chapters.
  for (const [label, progress] of [['3. Fic 1 Part 3', 3], ['1. Fic 2 Part 1', 4], ['1. Fic 3 Part 1', 5]] as const) {
    await page.getByRole('button', { name: 'Contents', exact: true }).click()
    const contents = page.getByRole('complementary', { name: 'Contents', exact: true })
    await expect(contents.locator('.toc-work-title')).toHaveCount(3)
    await contents.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('.current-anthology-work')).toContainText(label.startsWith('3.') ? 'Chapter 3 of 3' : 'Chapter 1 of 1')
    await mark.click()
    await expect(page.getByRole('button', { name: `Chapter ${progress} of 5 — Edit Progress`, exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Bookshelf', exact: true }).click()
  await expect(page.locator('.anthology-summary')).toHaveText('Anthology · 3 Works · 5 Chapters')
  await expect(page.locator('.card-progress')).toContainText('Finished')
  await page.getByRole('button', { name: 'Manage EPUB', exact: true }).click()
  await expect(page.getByLabel('Link to Organizer Work', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Review Anthology Contents', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Review Anthology Contents', exact: true })
  await review.getByRole('combobox', { name: 'Section Type', exact: true }).nth(2).selectOption('notes')
  await review.getByRole('textbox', { name: 'Work Title', exact: true }).first().fill('Renamed First Fic')
  await review.getByRole('button', { name: 'Save Contents', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Manage EPUB', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close Dialog', exact: true }).click()
  await page.reload()
  await expect(page.locator('.anthology-summary')).toHaveText('Anthology · 3 Works · 4 Chapters')
  await page.getByRole('button', { name: 'Continue Reading →', exact: true }).click()
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Contents', exact: true }).getByRole('button', { name: 'Renamed First Fic', exact: true })).toBeVisible()
  await page.getByRole('complementary', { name: 'Contents', exact: true }).getByRole('button', { name: '2. Fic 1 Part 3', exact: true }).click()
  await expect(page.locator('.current-anthology-work')).toContainText('Chapter 2 of 2')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('anthology organizer sync updates each fic independently', async ({ page, context }) => {
  await organizerAccount(context)
  const writes: { work: number; input: Record<string, unknown> }[] = []
  const remotes = new Map([91001, 91002, 91003].map(work => [work, { id: `organizer-${work}`, version: 'v1', status: 'to_read', progress: 0, notes: '' }]))
  await context.route('**/rest/v1/rpc/userscript_library', async route => {
    const request = route.request().postDataJSON()
    if (request.p_action === 'reader_report') return route.fulfill({ json: {} })
    if (request.p_action !== 'get') {
      writes.push({ work: request.p_work, input: request.p_input })
      remotes.set(request.p_work, { ...remotes.get(request.p_work)!, ...request.p_input, status: request.p_work === 91002 ? 'reading' : request.p_input.status, version: `v${writes.length + 1}` })
    }
    return route.fulfill({ json: { entry: remotes.get(request.p_work) ?? null, collections: [] } })
  })
  await page.goto('/')
  await page.getByLabel('Import EPUB File').setInputFiles({ name: 'anthology.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(await createZip(anthologyFiles()).arrayBuffer()) })
  await expect(page.getByLabel('Book Content')).toBeVisible()
  await page.getByRole('button', { name: 'Bookshelf', exact: true }).click()
  await connectOrganizer(page)
  await expect.poll(() => page.evaluate(async owner => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(`bta-reader-account:${owner}`); request.onsuccess = () => resolve(request.result) })
    try { return await new Promise<number>(resolve => { const request = db.transaction('books').objectStore('books').getAll(); request.onsuccess = () => resolve(request.result[0]?.works?.filter((work: { remote?: unknown }) => work.remote).length ?? 0) }) } finally { db.close() }
  }, owner)).toBe(3)
  await page.getByRole('button', { name: 'Start Reading →', exact: true }).click()
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  await page.getByRole('complementary', { name: 'Contents', exact: true }).getByRole('button', { name: '3. Fic 1 Part 3', exact: true }).click()
  await page.locator('.reading-footer').getByRole('button', { name: 'Mark Chapter Read', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({ work: 91001, input: { progress: 3, status: 'finished', chapter_read: { chapter: 3, chapter_id: '910013' } } })
  expect(remotes.get(91002)?.progress).toBe(0)
  expect(remotes.get(91003)?.progress).toBe(0)
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  await page.getByRole('complementary', { name: 'Contents', exact: true }).getByRole('button', { name: '1. Fic 2 Part 1', exact: true }).click()
  await page.locator('.reading-footer').getByRole('button', { name: 'Mark Chapter Read', exact: true }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]).toMatchObject({ work: 91002, input: { progress: 1, status: 'finished' } })
  expect(remotes.get(91003)?.progress).toBe(0)
  await expect.poll(() => page.evaluate(async owner => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(`bta-reader-account:${owner}`); request.onsuccess = () => resolve(request.result) })
    try { return await new Promise<string | undefined>(resolve => { const request = db.transaction('books').objectStore('books').getAll(); request.onsuccess = () => resolve(request.result[0]?.works?.find((work: { workId: string }) => work.workId === '91002')?.status) }) } finally { db.close() }
  }, owner)).toBe('reading')
})
