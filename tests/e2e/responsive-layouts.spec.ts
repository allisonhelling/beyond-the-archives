import { desktopCompanion } from './desktop-companion-fixture'
import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('mobile and desktop tile arrangements save independently through real viewport previews', async ({ page }) => {
 await fixture(page)
 await page.goto('/settings#settings-display'); await login(page)
 await page.getByRole('button', { name: 'Work Tile', exact: true }).click()
 const mobile = page.getByRole('region', { name: 'Mobile Work Tile Layout', exact: true })
 const desktop = page.getByRole('region', { name: 'Desktop Work Tile Layout', exact: true })
 const tabs = page.getByRole('tablist', {name:'Work Tile Layout',exact:true})
 await tabs.getByRole('tab', {name:'Mobile'}).click()
 const preview = mobile.frameLocator('iframe')
 const authors = preview.locator('[data-display-field="authors"]')
 await expect(authors).toBeVisible()
 await expect(desktop).toBeHidden()
 await mobile.getByRole('button', { name: 'Hide/Show Information', exact: true }).click()
 await authors.click()
 await page.keyboard.press('Backspace')
 await tabs.getByRole('tab', {name:'Mobile'}).click()
 await expect(authors).toHaveCount(0)
 await mobile.getByRole('button', { name: 'Save', exact: true }).click()
 const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('between-chapters:display:v1')!))
 expect(saved.mobile.workTile.hidden).toContain('authors')
 expect(saved.workTile?.hidden ?? []).not.toContain('authors')
 await tabs.getByRole('tab', {name:'Desktop'}).click()
 await expect(desktop.frameLocator('iframe').locator('.authors')).toBeVisible()
 await tabs.getByRole('tab', {name:'Mobile'}).click()
 await page.reload()
 await page.getByRole('button', { name: 'Work Tile', exact: true }).click()
 await tabs.getByRole('tab', {name:'Mobile'}).click()
 await expect(authors).toHaveCount(0)
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('screen presets and custom sizes apply to tile, info-page and local development previews', async ({ page }, info) => {
 await fixture(page)
 await page.goto('/settings#settings-display'); await login(page)
 const tileSettings = page.getByRole('region', { name: 'Tile and Page Information', exact: true })
 const size = tileSettings.getByRole('group', { name: 'Mobile Preview Screen Size', exact: true })
 const disclosure = size.getByRole('button', { name: 'Mobile Preview Screen Size', exact: true })
 await expect(disclosure).toHaveAttribute('aria-expanded', 'false', { timeout: 15_000 })
 await expect(size.getByRole('combobox', { name: 'Device', exact: true })).toBeHidden()
 await disclosure.click()
 await expect(size.getByRole('combobox', { name: 'Device', exact: true })).toHaveValue('iphone-16', { timeout: 15_000 })
 await expect(size).toHaveCSS('padding', info.project.name === 'desktop' ? '24px' : '18px')
 await expect(size.locator('.viewport-size-content > .field-help').first()).toHaveCSS('margin-top', '0px')
 await expect(size.locator('fieldset')).toHaveCount(0)
 const workTile = tileSettings.getByRole('group', { name: 'Work Tile', exact: true })
 const layout = await Promise.all([
  size.boundingBox(),
  workTile.boundingBox(),
  size.getByRole('spinbutton', { name: 'Width (in)', exact: true }).boundingBox(),
  size.locator('.viewport-size-conversion').boundingBox(),
  size.getByRole('combobox', { name: 'Device', exact: true }).boundingBox(),
  size.getByRole('button', { name: 'Save Preview Sizes', exact: true }).boundingBox(),
 ])
 const [box, tile, width, conversion, device, save] = layout.map(value => value!)
 expect(Math.abs(box.width - tile.width)).toBeLessThan(1)
 expect(Math.abs(width.x - conversion.x)).toBeLessThan(1)
 expect(Math.abs(device.x - save.x)).toBeLessThan(1)
 expect(save.y).toBeGreaterThanOrEqual(device.y + device.height)
 if (info.project.name === 'desktop') {
  expect(Math.abs(conversion.y + conversion.height / 2 - save.y - save.height / 2)).toBeLessThan(1)
  const controls = await size.locator('select, input').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)))
  expect(new Set(controls).size).toBe(1)
 }
 await size.getByRole('combobox', { name: 'Units', exact: true }).selectOption('mm')
 await size.getByRole('spinbutton', { name: 'Width (mm)', exact: true }).fill('108.48')
 await size.getByRole('spinbutton', { name: 'Height (mm)', exact: true }).fill('238.13')
 await page.getByRole('button', { name: 'Save Preview Sizes', exact: true }).click()
 await page.getByRole('button', { name: 'Work Tile', exact: true }).click()
 await page.getByRole('tablist',{name:'Work Tile Layout',exact:true}).getByRole('tab',{name:'Mobile'}).click()
 const mobile = page.getByRole('region', { name: 'Mobile Work Tile Layout', exact: true }).frameLocator('iframe')
 await expect.poll(() => mobile.locator('body').evaluate(node => node.ownerDocument.defaultView!.innerWidth)).toBe(410)
 await page.goto('/settings/example-work')
 if (info.project.name === 'desktop') await page.getByRole('tab', { name: 'Mobile', exact: true }).click()
 const preview = page.locator('.display-example-page [role="tabpanel"]:visible .display-example-content')
 await expect(preview.locator('iframe')).toHaveCount(0)
 await expect.poll(() => preview.evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(410)
 await expect(preview.locator('.story-details-page')).toBeVisible()
 const ratingInfo = preview.getByRole('button', { name: 'Personal Rating Info', exact: true })
 await ratingInfo.focus()
 const tooltip = page.getByRole('tooltip').filter({ hasText: 'Add how your personal rating system' })
 await expect(tooltip).toBeVisible()
 const iconBox = (await ratingInfo.boundingBox())!, helpBox = (await tooltip.boundingBox())!
 expect(helpBox.y >= iconBox.y + iconBox.height || helpBox.y + helpBox.height <= iconBox.y).toBe(true)
 if (info.project.name === 'desktop') {
  await page.getByRole('tablist', { name: 'Information Page Preview Layout' }).getByRole('tab', { name: 'Desktop', exact: true }).click()
  await expect.poll(() => preview.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(410)
 }
 expect(await preview.evaluate(node => node.getBoundingClientRect().width <= node.parentElement!.clientWidth)).toBe(true)
 const toolbar = page.getByRole('complementary', { name: 'Local Viewport Preview', exact: true })
 await toolbar.getByText('Preview Size', { exact: true }).click()
 await toolbar.getByRole('combobox', { name: 'Units', exact: true }).selectOption('mm')
 await toolbar.getByRole('spinbutton', { name: 'Width (mm)', exact: true }).fill('113.77')
 await toolbar.getByRole('button', { name: 'Apply Preview Size', exact: true }).click()
 await expect(toolbar.getByRole('tab', { name: 'Mobile · 113.77 mm', exact: true })).toBeVisible()
 await toolbar.getByRole('tab', { name: 'Mobile · 113.77 mm', exact: true }).click()
 await expect.poll(() => page.frameLocator('iframe[title="Local App Viewport"]').locator('body').evaluate(node => node.ownerDocument.defaultView!.innerWidth)).toBe(430)
 const localPreview = (await page.locator('iframe[title="Local App Viewport"]').boundingBox())!
 expect(localPreview.y + localPreview.height).toBeLessThanOrEqual(page.viewportSize()!.height)
 expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
})

test('library and reading actions fit their headers and filters across viewport sizes', async ({ page }) => {
 const tables = await fixture(page)
 for (let index = 1; index <= 113; index++) {
  tables.works.push({ id: `layout-work-${index}`, ao3_work_id: index, title: `Layout work ${index}`, verified_chapters: {} })
  tables.library_entries.push({ id: `layout-entry-${index}`, work_id: `layout-work-${index}`, reading_status: 'reading', last_read_chapter: 1, notes: '', original_url: `https://archiveofourown.org/works/${index}`, metadata_overrides: { published_chapters: 10, total_chapters: 10, fandoms: [index % 2 ? 'Naruto' : 'Supernatural'] } })
 }
 await page.goto('/library?size=50'); await login(page)
 // Exercise the sans-serif fallback used when Avenir/Segoe are unavailable.
 await page.addStyleTag({ content: ':root { --font-sans: Arial, sans-serif; }' })
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
   if (width > 650) {
    expect(series.y).toBeCloseTo(filters.y, 0)
    expect(series.x + series.width).toBeLessThanOrEqual(filters.x)
   } else {
    const apply = (await toolbar.getByRole('button', { name: 'Apply Filters', exact: true }).boundingBox())!
    expect(series.y).toBeCloseTo(apply.y, 0)
    expect(series.x + series.width).toBeLessThanOrEqual(apply.x)
    expect(apply.y).toBeCloseTo(filters.y, 0)
    expect(await toolbar.getByRole('button', { name: 'Show Series', exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(apply.x + apply.width).toBeLessThanOrEqual(filters.x)
   }
   if (width > 1100) {
    const controls = await toolbar.locator(':scope > .custom-dropdown, :scope > .suggestion-search, :scope > .fandom-select, :scope > button').all()
    for (const control of controls) expect((await control.boundingBox())!.y).toBeCloseTo(series.y, 0)
   }
   const status = page.locator('.pagination-inline [role=status]')
   await expect(status).toContainText('1–50 of 113 works')
   const previous = (await page.locator('.pagination-inline, .reading-toolbar').getByRole('button', { name: 'Prev', exact: true }).boundingBox())!
   const next = (await page.locator('.pagination-inline, .reading-toolbar').getByRole('button', { name: 'Next', exact: true }).boundingBox())!
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
 await expect(page.locator('.pagination-inline, .reading-toolbar').getByRole('button', { name: 'Sort', exact: true })).toBeVisible()
 await page.locator('.pagination-inline, .reading-toolbar').getByRole('button', { name: 'Sort', exact: true }).click()
 await page.getByRole('option', { name: 'Alphabetical', exact: true }).click()
 await expect(page).toHaveURL(/sort=alpha/)
})

test('mobile collection holds, filter defaults, inputs and work controls fit', async ({ page }) => {
 // This checks responsive desktop controls; eligibility still comes from the companion.
 await desktopCompanion(page)
 const tables = await fixture(page)
 tables.collections.push({ id: 'mobile-collection', name: 'Mobile Collection', default_key: null, sort_position: 1 })
 tables.works.push({ id: 'mobile-work', ao3_work_id: 123, title: 'Mobile work', verified_chapters: {} })
 tables.library_entries.push({ id: 'mobile-entry', work_id: 'mobile-work', reading_status: 'reading', last_read_chapter: 1, notes: '', original_url: 'https://archiveofourown.org/works/123', metadata_overrides: { published_chapters: 10, total_chapters: 10, authors: ['LongUnbrokenAuthorName'.repeat(12)] } })
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
 const [hide, hidden, select] = await Promise.all(['Hide Empty', 'Hidden', 'Select Collections'].map(async name => (await page.getByRole('button', { name, exact: true }).boundingBox())!))
 expect(hidden.x - hide.x - hide.width).toBeCloseTo(select.x - hidden.x - hidden.width)
 expect(hide.y).toBeCloseTo(select.y, 0)
 await page.getByRole('button', { name: 'Done Editing', exact: true }).click()
 await page.getByRole('button', { name: 'Filters', exact: true }).click()
 const defaults = page.locator('.filter-default-actions button')
 expect((await defaults.nth(0).boundingBox())!.y).toBeCloseTo((await defaults.nth(1).boundingBox())!.y, 0)
 for (const button of await defaults.all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
 const footerBox = (await page.locator('.reading-filters > .form-actions').boundingBox())!, resetBox = (await page.locator('.filter-reset-actions').boundingBox())!
 expect(Math.abs(footerBox.x + footerBox.width - resetBox.x - resetBox.width)).toBeLessThan(1)
 await page.goto('/stats')
 await page.setViewportSize({ width: 320, height: 900 })
 await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible()
 const navigation = (await page.locator('.stats-period-navigation').boundingBox())!, today = (await page.getByRole('button', { name: 'Today', exact: true }).boundingBox())!
 expect(today.x).toBeGreaterThanOrEqual(navigation.x + navigation.width)
 expect(Math.abs(today.y + today.height / 2 - navigation.y - navigation.height / 2)).toBeLessThan(1)
 await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320)
 await page.setViewportSize({ width: 375, height: 900 })
 await page.goto('/stories/mobile-entry')
 const rating = page.locator('.details-reading-controls .rating-heading')
 const collection = page.locator('.details-collections')
 // Cover both the native system font and the sans-serif fallback used in CI.
 for (const fallback of [false, true]) {
  if (fallback) await page.addStyleTag({ content: ':root { --font-sans: Arial, sans-serif; }' })
  for (const width of [375, 390]) {
   await page.setViewportSize({ width, height: 900 })
   const ratingBox = (await rating.boundingBox())!, collectionBox = (await collection.boundingBox())!
   expect(collectionBox.y).toBeGreaterThanOrEqual(ratingBox.y + ratingBox.height)
   expect(Math.abs(ratingBox.x + ratingBox.width / 2 - collectionBox.x - collectionBox.width / 2)).toBeLessThan(1)
   await expect(collection).toHaveCSS('border-top-width', '1px')
   expect(ratingBox.height).toBeLessThan(30)
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
 }
})

test('work action menus scroll within a short viewport without overlapping navigation', async ({ page }) => {
 const tables = await fixture(page)
 tables.works.push({ id: 'menu-work', ao3_work_id: 8001, verified_chapters: {} })
 tables.library_entries.push({ id: 'menu-entry', work_id: 'menu-work', original_url: 'https://archiveofourown.org/works/8001', reading_status: 'to_read', last_read_chapter: 0, notes: '', is_favorite: false, metadata_overrides: { title: 'Menu Boundaries', authors: ['Author'] }, created_at: '2026-11-01T00:00:00Z' })
 await page.setViewportSize({ width: page.viewportSize()!.width, height: 360 })
 await page.goto('/library'); await login(page)
 const trigger = page.getByLabel('Story Actions for Menu Boundaries', { exact: true })
 await trigger.scrollIntoViewIfNeeded()
 await trigger.click()
 const panel = page.locator('.story-menu[open] > .menu-surface')
 const bounds = (await panel.boundingBox())!
 const navigation = await page.getByRole('navigation', { name: 'Mobile Navigation', exact: true }).isVisible() ? await page.getByRole('navigation', { name: 'Mobile Navigation', exact: true }).boundingBox() : null
 expect(bounds.y).toBeGreaterThanOrEqual(8)
 expect(bounds.y + bounds.height).toBeLessThanOrEqual(navigation?.y ?? 360)
 expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
 await panel.getByRole('button', { name: 'Remove from Library', exact: true }).click()
 const confirmation = page.getByRole('dialog', { name: 'Remove from Library?', exact: true })
 await expect(confirmation).toBeVisible()
 await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
 await expect(confirmation).toHaveCount(0)
})
