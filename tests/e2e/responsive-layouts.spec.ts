import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('mobile and desktop tile arrangements save independently through real viewport previews', async ({ page }, info) => {
 await fixture(page)
 await page.goto('/settings#settings-display'); await login(page)
 await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
 const mobile = page.getByRole('region', { name: 'Mobile Work Tile Layout', exact: true })
 const desktop = page.getByRole('region', { name: 'Desktop Work Tile Layout', exact: true })
 const preview = mobile.frameLocator('iframe')
 const authors = preview.locator('[data-display-field="authors"]')
 await expect(authors).toBeVisible()
 if (info.project.name === 'desktop') {
  await expect(desktop.frameLocator('iframe').locator('.authors')).toBeVisible()
  const left = (await desktop.boundingBox())!, right = (await mobile.boundingBox())!
  expect(right.x).toBeGreaterThan(left.x)
  expect(right.y).toBeCloseTo(left.y, 0)
 } else await expect(desktop).toHaveCount(0)
 await mobile.getByRole('button', { name: 'Hide/Show Information', exact: true }).click()
 await authors.click()
 await page.keyboard.press('Backspace')
 await expect(authors).toHaveCount(0)
 await mobile.getByRole('button', { name: 'Save', exact: true }).click()
 const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('between-chapters:display:v1')!))
 expect(saved.mobile.workTile.hidden).toContain('authors')
 expect(saved.workTile?.hidden ?? []).not.toContain('authors')
 if (info.project.name === 'desktop') await expect(desktop.frameLocator('iframe').locator('.authors')).toBeVisible()
 await page.reload()
 await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
 await expect(authors).toHaveCount(0)
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('screen presets and custom sizes apply to tile, info-page and local development previews', async ({ page }, info) => {
 await fixture(page)
 await page.goto('/settings#settings-display'); await login(page)
 const size = page.getByRole('group', { name: 'Mobile Preview', exact: true })
 await size.getByRole('combobox', { name: 'Device', exact: true }).selectOption('iphone-14-pro')
 await size.getByRole('spinbutton', { name: 'Width (px)', exact: true }).fill('410')
 await size.getByRole('spinbutton', { name: 'Height (px)', exact: true }).fill('900')
 await page.getByRole('button', { name: 'Save Preview Sizes', exact: true }).click()
 await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
 const mobile = page.getByRole('region', { name: 'Mobile Work Tile Layout', exact: true }).frameLocator('iframe')
 await expect.poll(() => mobile.locator('body').evaluate(node => node.ownerDocument.defaultView!.innerWidth)).toBe(410)
 await page.goto('/settings/example-work')
 if (info.project.name === 'desktop') await page.getByRole('button', { name: 'Mobile View', exact: true }).click()
 const frame = page.locator('.display-example-page > div:not([hidden]) iframe')
 await expect(frame).toHaveCount(1)
 await expect.poll(() => frame.contentFrame().locator('body').evaluate(node => node.ownerDocument.defaultView!.innerWidth)).toBe(410)
 await expect(frame.contentFrame().locator('.story-details-page')).toBeVisible()
 const ratingInfo = frame.contentFrame().getByRole('button', { name: 'Personal Rating Info', exact: true })
 await ratingInfo.focus()
 const tooltip = frame.contentFrame().getByRole('tooltip').filter({ hasText: 'Add how your personal rating system' })
 await expect(tooltip).toBeVisible()
 const iconBox = (await ratingInfo.boundingBox())!, helpBox = (await tooltip.boundingBox())!
 expect(helpBox.y).toBeGreaterThanOrEqual(iconBox.y + iconBox.height)
 await page.getByRole('button', { name: 'Desktop View', exact: true }).isVisible().then(async visible => { if (visible) { await page.getByRole('button', { name: 'Desktop View', exact: true }).click(); await expect.poll(() => page.locator('.display-example-page > div:not([hidden]) iframe').contentFrame().locator('body').evaluate(node => node.ownerDocument.defaultView!.innerWidth)).toBe(1440) } })
 const toolbar = page.getByRole('complementary', { name: 'Local Viewport Preview', exact: true })
 await toolbar.getByText('Preview Size', { exact: true }).click()
 await toolbar.getByRole('spinbutton', { name: 'Width (px)', exact: true }).fill('430')
 await toolbar.getByRole('button', { name: 'Apply Preview Size', exact: true }).click()
 await expect(toolbar.getByRole('button', { name: 'Mobile · 430px', exact: true })).toBeVisible()
 await toolbar.getByRole('button', { name: 'Mobile · 430px', exact: true }).click()
 await expect.poll(() => page.frameLocator('iframe[title="Local App Viewport"]').locator('body').evaluate(node => node.ownerDocument.defaultView!.innerWidth)).toBe(430)
})

test('library and reading actions fit their headers and filters across viewport sizes', async ({ page }) => {
 const tables = await fixture(page)
 for (let index = 1; index <= 113; index++) {
  tables.works.push({ id: `layout-work-${index}`, ao3_work_id: index, title: `Layout work ${index}`, verified_chapters: {} })
  tables.library_entries.push({ id: `layout-entry-${index}`, work_id: `layout-work-${index}`, reading_status: 'reading', last_read_chapter: 1, notes: '', original_url: `https://archiveofourown.org/works/${index}`, metadata_overrides: { published_chapters: 10, total_chapters: 10, fandoms: [index % 2 ? 'Naruto' : 'Supernatural'] } })
 }
 await page.goto('/library?size=50'); await login(page)
 for (const width of [1440, 1024, 430, 375, 320]) {
  await page.setViewportSize({ width, height: 900 })
  const header = page.locator('.library-heading-actions'), toolbar = page.locator('.reading-toolbar')
  const refresh = header.getByRole('button', { name: 'Mass Refresh All Stories on Page', exact: true })
  await expect(refresh).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Mass Refresh All Stories on Page' })).toHaveCount(0)
  await expect(header.getByRole('link', { name: 'Add Story', exact: true })).toHaveCount(0)
  await expect(page.locator('.app-header').getByRole('link', { name: 'Add Story', exact: true })).toBeVisible({ visible: width > 1100 })
  // Resize and asynchronously loaded shelf counts can reflow the toolbar.
  await expect(async () => {
   const series = (await toolbar.getByRole('button', { name: 'Show Series', exact: true }).boundingBox())!
   const filters = (await toolbar.getByRole('button', { name: 'Filters', exact: true }).boundingBox())!
   expect(series.y).toBeCloseTo(filters.y, 0)
   expect(series.x + series.width).toBeLessThanOrEqual(filters.x)
   if (width > 1100) {
    const controls = await toolbar.locator(':scope > .custom-dropdown, :scope > .suggestion-search, :scope > .fandom-select, :scope > button').all()
    for (const control of controls) expect((await control.boundingBox())!.y).toBeCloseTo(series.y, 0)
   }
   const status = page.locator('.pagination-inline [role=status]')
   await expect(status).toContainText('1–50 of 113 works')
   const previous = (await page.locator('.pagination-inline').getByRole('button', { name: 'Prev', exact: true }).boundingBox())!
   const next = (await page.locator('.pagination-inline').getByRole('button', { name: 'Next', exact: true }).boundingBox())!
   const count = (await status.boundingBox())!
   expect(Math.abs(previous.y + previous.height / 2 - (next.y + next.height / 2))).toBeLessThan(2)
   expect(previous.y + previous.height / 2).toBeGreaterThanOrEqual(count.y)
   expect(previous.y + previous.height / 2).toBeLessThanOrEqual(count.y + count.height)
   expect(await status.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }).toPass({ timeout: 5000 })
 }
 await page.locator('.fandom-trigger').click()
 const rows = page.locator('.fandom-options .check-label')
 await expect(rows).toHaveCount(2)
 await expect(rows.nth(1)).toHaveCSS('border-top-width', '1px')
 await expect(rows.nth(1)).toHaveCSS('padding-top', '7px')
 await page.goto('/reading')
 await expect(page.getByRole('heading', { name: 'Currently Reading', exact: true })).toBeVisible()
 await expect(page.locator('.library-heading-actions').getByRole('button', { name: 'Sort', exact: true })).toHaveCount(0)
 await expect(page.locator('.reading-toolbar').getByRole('button', { name: 'Sort', exact: true })).toBeVisible()
 await page.locator('.reading-toolbar').getByRole('button', { name: 'Sort', exact: true }).click()
 await page.getByRole('option', { name: 'Alphabetical', exact: true }).click()
 await expect(page).toHaveURL(/sort=alpha/)
})

test('mobile collection holds, filter defaults, inputs and work controls fit', async ({ page }) => {
 const tables = await fixture(page)
 tables.collections.push({ id: 'mobile-collection', name: 'Mobile Collection', default_key: null, sort_position: 1 })
 tables.works.push({ id: 'mobile-work', ao3_work_id: 123, title: 'Mobile work', verified_chapters: {} })
 tables.library_entries.push({ id: 'mobile-entry', work_id: 'mobile-work', reading_status: 'reading', last_read_chapter: 1, notes: '', original_url: 'https://archiveofourown.org/works/123', metadata_overrides: { published_chapters: 10, total_chapters: 10 } })
 await page.setViewportSize({ width: 375, height: 900 })
 await page.goto('/library'); await login(page)
 const spine = page.getByRole('button', { name: 'Mobile Collection', exact: true })
 await spine.scrollIntoViewIfNeeded()
 await expect(spine).toBeEnabled()
 await spine.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 300 })
 const editor = page.getByRole('dialog', { name: 'Edit Collection', exact: true })
 await expect(editor).toBeVisible()
 await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
 expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
 expect(await editor.getByLabel('Name', { exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16)
 await editor.getByRole('checkbox', { name: 'Automatic Collection', exact: true }).check()
 await editor.getByRole('button', { name: 'Fandoms', exact: true }).click()
 const fandomPanel = (await editor.locator('.fandom-panel').boundingBox())!
 const filterBox = (await editor.locator('.reading-toolbar-rules').boundingBox())!
 expect(Math.abs(fandomPanel.x - filterBox.x)).toBeLessThanOrEqual(1)
 expect(Math.abs(fandomPanel.width - filterBox.width)).toBeLessThanOrEqual(2)
 await editor.getByRole('button', { name: 'Fandoms', exact: true }).click()
 await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
 await page.getByRole('button', { name: 'Mass Refresh All Stories on Page', exact: true }).click()
 const confirmation = page.getByRole('dialog', { name: 'Mass Refresh?', exact: true })
 await expect(confirmation).toBeVisible()
 await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
 await page.getByRole('button', { name: 'Edit Collections', exact: true }).click()
 const done = (await page.getByRole('button', { name: 'Done Editing', exact: true }).boundingBox())!
 const select = (await page.getByRole('button', { name: 'Select Collections', exact: true }).boundingBox())!
 expect(select.x).toBeGreaterThan(done.x)
 expect(select.y).toBeCloseTo(done.y, 0)
 await page.getByRole('button', { name: 'Done Editing', exact: true }).click()
 await page.getByRole('button', { name: 'Filters', exact: true }).click()
 const defaults = page.locator('.filter-default-actions button')
 expect((await defaults.nth(0).boundingBox())!.y).toBeCloseTo((await defaults.nth(1).boundingBox())!.y, 0)
 await page.goto('/stories/mobile-entry')
 const rating = page.locator('.details-reading-controls .rating-heading')
 const collection = page.locator('.details-collections')
 // Cover both the native system font and the sans-serif fallback used in CI.
 for (const fallback of [false, true]) {
  if (fallback) await page.addStyleTag({ content: ':root { --font-sans: Arial, sans-serif; }' })
  for (const width of [375, 390]) {
   await page.setViewportSize({ width, height: 900 })
   const ratingBox = (await rating.boundingBox())!, collectionBox = (await collection.boundingBox())!
   expect(ratingBox.x + ratingBox.width).toBeLessThanOrEqual(collectionBox.x)
   expect(ratingBox.height).toBeLessThan(30)
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
 }
})
