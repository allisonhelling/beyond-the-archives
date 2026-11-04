import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'
import { exampleWork } from '../../src/features/library/display/display-examples'

test('scrolls the complete shelf at every width and hides only known empty collections', async ({ page }) => {
 const tables = await fixture(page)
 tables.collections = Array.from({ length: 15 }, (_, index) => ({ id: `shelf-${index}`, name: `Shelf ${index}`, default_key: null, sort_position: index }))
 tables.works.push({ ...exampleWork.work, id: 'carousel-work' })
 tables.library_entries.push({ ...exampleWork, id: 'carousel-entry', work_id: 'carousel-work', metadata_overrides: exampleWork.metadata })
 tables.collection_works.push({ collection_id: 'shelf-0', library_entry_id: 'carousel-entry' })
 await page.goto('/library'); await login(page)
 const shelves = page.getByRole('navigation', { name: 'Library Shelves', exact: true })
 const track = shelves.locator('.collection-shelf-rows')
 const compactTitle = shelves.locator('.collection-spine-mini .collection-spine-title')
 await expect(compactTitle).toHaveText('New Collection')
 expect(await compactTitle.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true)
 await expect(shelves.locator('.collection-shelf-row')).toHaveCount(1)
 await expect(shelves.getByRole('button', { name: 'Shelf 14', exact: true })).toBeAttached()
 expect(await track.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
 await track.evaluate(element => { element.scrollLeft = element.scrollWidth })
 expect(await track.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
 await expect(shelves.getByRole('button', { name: 'Shelf 0', exact: true }).locator('.collection-spine-count')).toHaveText('1')
 await page.getByRole('button', { name: 'Hide Empty', exact: true }).click()
 await expect(shelves.getByRole('button', { name: 'Shelf 0', exact: true })).toHaveCount(1)
 await expect(shelves.getByRole('button', { name: 'Shelf 14', exact: true })).toHaveCount(0)
 await page.reload()
 await expect(page.getByRole('button', { name: 'Hide Empty', exact: true })).toHaveAttribute('aria-pressed', 'true')
 await expect(shelves.getByRole('button', { name: 'Shelf 14', exact: true })).toHaveCount(0)
})

test('retains Offline collections and counts cloud works without duplicate versions or installation-only files', async ({ page }) => {
 await fixture(page)
 const stories = [201, 202].map(id => ({ ...exampleWork, id: `entry-${id}`, metadata: { ...exampleWork.metadata, title: `Offline ${id}` }, work: { ...exampleWork.work, ao3_work_id: id }, collectionIds: ['cloud-shelf'] }))
 const collections = [{ id: 'cloud-shelf', name: 'Cloud Shelf', default_key: null }, { id: 'empty-shelf', name: 'Empty Shelf', default_key: null }]
 await page.route('**/rest/v1/rpc/reader_offline_snapshot', route => route.fulfill({ json: {
  readers: [{ id: 'reader', name: 'Reader', url: 'https://reader.example/', reportedAt: new Date().toISOString(), works: ['202'] }], stories, collections,
  cloudBooks: ['a', 'b'].map(id => ({ id: id.repeat(64), workId: '201', metadata: stories[0].metadata, status: 'reading', notes: '', completedCount: 0 })),
 } }))
 await page.goto('/library'); await login(page); await page.goto('/offline')
 const shelves = page.getByRole('navigation', { name: 'Library Shelves', exact: true })
 await expect(shelves.getByRole('button', { name: 'All Works', exact: true }).locator('.collection-spine-count')).toHaveText('1')
 await expect(shelves.getByRole('button', { name: 'Cloud Shelf', exact: true }).locator('.collection-spine-count')).toHaveText('1')
 await expect(page.locator('.story-card')).toHaveCount(2)
 const progress = page.locator('.book-spine-footer .chapter-progress-button').first()
 await expect(progress).toHaveCSS('text-align', 'left')
 const alignment = await progress.evaluate(button => {
  const range = document.createRange(); range.selectNodeContents(button)
  const track = button.closest('.spine-progress')!.querySelector('.spine-progress-track')!
  return Math.abs(range.getBoundingClientRect().left - track.getBoundingClientRect().left)
 })
 expect(alignment).toBeLessThan(1)
 await shelves.getByRole('button', { name: 'Cloud Shelf', exact: true }).click()
 await expect(page.locator('.story-card')).toHaveCount(2)
 await expect(page.getByRole('button', { name: 'Edit Collections', exact: true })).toHaveCount(0)
 await page.getByRole('button', { name: 'Hide Empty', exact: true }).click()
 await expect(shelves.getByRole('button', { name: 'Empty Shelf', exact: true })).toHaveCount(0)
 await page.evaluate(() => {
  for (const storage of [localStorage, sessionStorage]) for (const key of Object.keys(storage)) if (key.startsWith('sb-') && key.endsWith('-auth-token')) storage.removeItem(key)
  sessionStorage.setItem('connected-login-signed-out', '1')
 })
 await page.reload()
 await expect(page.getByRole('link', { name: 'Online Sign-In', exact: true })).toBeVisible()
 await expect(shelves.getByRole('button', { name: 'Cloud Shelf', exact: true }).locator('.collection-spine-count')).toHaveText('1')
 await expect(page.locator('.story-card')).toHaveCount(2)
})
