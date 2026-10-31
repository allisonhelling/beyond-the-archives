import { isTooltipPaintedAt } from './tooltip-assertions'
import { expect, test, type Page, type Locator } from '@playwright/test'
import { fixture, login } from './library-fixture'
import type { TagAppearance } from '../../src/features/library/display/display-settings'

async function setup(page: Page, tagAppearance?: TagAppearance) {
  const tables = await fixture(page)
  if (tagAppearance) tables.metadata_preferences.push({ user_id: '10000000-0000-0000-0000-000000000001', tag_appearance: tagAppearance })
  const timestamp = '2026-10-15T00:00:00Z'
  tables.works.push({ id: 'display-work', ao3_work_id: 123, canonical_url: 'https://archiveofourown.org/works/123', verified_chapters: {} })
  tables.library_entries.push({ id: 'display-entry', work_id: 'display-work', reading_status: 'reading', last_read_chapter: 1, notes: 'Work note', is_favorite: false, personal_rating: null, created_at: timestamp, updated_at: timestamp, original_url: 'https://archiveofourown.org/works/123', metadata_overrides: { title: 'Display work', authors: ['Display author'], fandoms: ['Display fandom'], ao3_tags: [], summary: 'Display summary', rating: 'Mature', publication_status: 'complete', published_chapters: 3, total_chapters: 3, word_count: 1000, series: ['Display series'], series_memberships: [{ id: 77, name: 'Display series', url: 'https://archiveofourown.org/series/77', position: 1 }] } })
  tables.library_series.push({ id: 'display-series', ao3_series_id: 77, notes: 'Series note', is_favorite: false, created_at: timestamp, updated_at: timestamp, metadata: { seriesId: 77, title: 'Display series', normalizedUrl: 'https://archiveofourown.org/series/77', description: 'Series Description', creators: ['Series author'], wordCount: 1000, workCount: 1, complete: true, works: [{ workId: 123, title: 'Display work', position: 1, url: 'https://archiveofourown.org/works/123', authors: ['Display author'], fandoms: ['Display fandom'], summary: 'Display summary', tags: [], chapters: '3/3', wordCount: 1000, complete: true }] } })
  await page.goto('/settings#settings-display')
  await login(page)
  await expect(page.getByRole('button', { name: 'Edit Work Tiles', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#display-work-editor')).toBeHidden()
  const tagFormat=page.getByRole('button',{name:'Edit Tag Format',exact:true})
  await expect(tagFormat).toHaveAttribute('aria-expanded','false')
  await expect(page.locator('#display-tag-format')).toBeHidden()
  await tagFormat.click()
  await expect(page.locator('#display-tag-format')).toBeVisible()
  await tagFormat.click()
  await expect(page.locator('#display-tag-format')).toBeHidden()
  await tagFormat.click()
  await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Series Tiles', exact: true }).click()
  return tables
}
const editor = (page: Page, title: string) => page.locator(`[aria-label="${title} Editor"]:visible`).first()
const field = (scope: Locator, group: string, key: string) => scope.frameLocator('iframe').locator(`[data-display-group="${group}"][data-display-field="${key}"]`).last()
const storedProfile = (page: Page) => page.evaluate(() => { const saved = JSON.parse(localStorage.getItem('between-chapters:display:v1')!); return innerWidth <= 1100 ? { ...saved, ...saved.mobile } : saved })
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('between-chapters:display:v1'))
async function manage(scope: Locator, open: boolean) {
  const button = scope.getByRole('button', { name: 'Hide/Show Information', exact: true })
  if (await button.getAttribute('aria-expanded') !== String(open)) await button.click()
}

async function applyTileDrafts(page: Page, name: 'Save' | 'Cancel') {
  for (const picker of await page.locator('.display-settings .collection-color-trigger[aria-expanded="true"]').all()) await picker.click()
  for (const bar of await page.locator('.display-settings .display-save-bar').all()) {
    const button = bar.getByRole('button', { name, exact: true })
    if (await button.isVisible() && await button.isEnabled()) await button.click()
  }
}

async function dragInformation(page: Page, source: Locator, destination: Locator, mobile: boolean) {
  // Wrapped inline fields can have an empty center in their overall bounding box.
  await source.scrollIntoViewIfNeeded()
  const rectInPage = async (node: Locator) => {
    const outer = (await node.boundingBox())!
    const native = await node.evaluate(element => ({ first: element.getClientRects()[0].toJSON(), box: element.getBoundingClientRect().toJSON() }))
    const scale = outer.width / native.box.width
    return { x: outer.x + (native.first.x - native.box.x) * scale, y: outer.y + (native.first.y - native.box.y) * scale, width: native.first.width * scale, height: native.first.height * scale }
  }
  const from = await rectInPage(source), to = await rectInPage(destination)
  const shadow = source.locator('xpath=ancestor::*[contains(@class, "display-edit-surface")]').locator('.display-drop-shadow').first()
  let projected: {x:number;y:number;width:number;height:number} | null = null
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }, end = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  if (mobile) {
    const session = await page.context().newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8 }] })
    await expect(shadow).toBeVisible(); expect(await source.evaluate(node => node.ownerDocument.getSelection()?.toString() ?? '')).toBe('')
    projected = await shadow.boundingBox()
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  } else {
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await expect(shadow).toBeVisible(); expect(await source.evaluate(node => node.ownerDocument.getSelection()?.toString() ?? '')).toBe(''); projected = await shadow.boundingBox(); await page.mouse.up()
  }
  const placed = (await source.locator('xpath=ancestor-or-self::*[@data-display-field][1]').boundingBox())!
  expect(placed.y).toBeCloseTo(projected!.y, 0)
}

test('full work and series tiles expand on demand, hide/show outside the preview, and save drafts explicitly', async ({ page }, info) => {
  await setup(page)
  const work = editor(page, 'Work Tile'), series = editor(page, 'Series Tile')
  await expect(work.frameLocator('iframe').locator('.work-card')).toBeVisible()
  await expect(series.frameLocator('iframe').locator('.series-card')).toBeVisible()
  await expect(work.frameLocator('iframe').locator('.display-edit-surface').getByRole('button', { name: 'Hide/Show Information', exact: true })).toHaveCount(0)
  await manage(work, true)
  await work.getByRole('button', { name: /Add Relationships/ }).click()
  await expect(field(work, 'workTile', 'relationships')).toContainText('Dick Grayson & Bruce Wayne')
  await manage(work, true)
  await field(work, 'workTile', 'authors').click()
  await expect(field(work, 'workTile', 'authors')).toBeVisible()
  await page.keyboard.press('Backspace')
  await expect(work.frameLocator('iframe').locator('.authors')).toHaveCount(0)
  await manage(work, false)
  await field(work, 'workTile', 'summary').click()
  await field(work, 'workTile', 'fandoms').click()
  expect(await field(work, 'workTile', 'summary').evaluate(node => !!(node.compareDocumentPosition(node.parentElement!.querySelector('[data-display-field="fandoms"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  expect(await stored(page)).toBeNull()
  await applyTileDrafts(page, 'Save')
  await page.reload()
  await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Series Tiles', exact: true }).click()
  await expect(work.frameLocator('iframe').locator('.authors')).toHaveCount(0)
  await expect(field(work, 'workTile', 'relationships')).toBeVisible()
  await manage(work, true)
  await field(work, 'workTile', 'fandoms').click()
  await page.keyboard.press('Backspace')
  await applyTileDrafts(page, 'Cancel')
  await expect(field(work, 'workTile', 'fandoms')).toBeVisible()
  await manage(work, true)
  await field(work, 'workTile', 'fandoms').click()
  await page.keyboard.press('Backspace')
  await page.reload()
  await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Series Tiles', exact: true }).click()
  await expect(field(work, 'workTile', 'fandoms')).toBeVisible()
  // Real card actions remain visible, but cannot edit records or navigate in the editor.
  await work.frameLocator('iframe').locator('.story-card-title h2 a').click()
  await expect(page).toHaveURL(/\/settings#settings-display$/)
  expect(await work.frameLocator('iframe').locator('.work-card').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await work.screenshot({ path: `test-results/full-work-tile-preview-${info.project.name}.png` })
  await page.goto('/reading')
  await expect(page.locator('.work-card .authors')).toHaveCount(0)
  await expect(page.locator('.work-card .story-card-title')).toContainText('Display work')
})

test('actual tile data sections support mouse and touch dragging', async ({ page }, info) => {
  await setup(page)
  const work = editor(page, 'Work Tile')
  const source = field(work, 'workTile', 'authors'), destination = field(work, 'workTile', 'fandoms')
  await work.locator('iframe').scrollIntoViewIfNeeded()
  await dragInformation(page, source.locator('a').first(), destination, info.project.name === 'mobile')
  expect(await source.evaluate(node => !!(node.compareDocumentPosition(node.parentElement!.querySelector('[data-display-field="fandoms"]')!) & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true)
  expect(await stored(page)).toBeNull()
  await applyTileDrafts(page, 'Cancel')
  expect(await source.evaluate(node => !!(node.compareDocumentPosition(node.parentElement!.querySelector('[data-display-field="fandoms"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
})

for (const kind of ['Work', 'Series'] as const) test(`opens a full Example ${kind} Info Page with independent Save and Cancel`, async ({ page }) => {
  await setup(page)
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/rest/') && (request.postData() ?? '').includes('example-')) requests.push(request.url()) })
  await page.getByRole('link', { name: `Edit ${kind} Info Page`, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/settings/example-${kind.toLowerCase()}$`))
  await expect(page.getByRole('heading', { name: `Example ${kind} Info Page`, exact: true })).toBeVisible()
  const preview = editor(page, `Example ${kind} Info Page`)
  await expect(preview.frameLocator('iframe').locator('.story-details-page')).toBeVisible()
  const group = kind === 'Work' ? 'workInfo' : 'seriesDescription', key = kind === 'Work' ? 'summary' : 'description'
  await manage(preview, true)
  await field(preview, group, key).click()
  await page.keyboard.press('Backspace')
  await expect(field(preview, group, key)).toHaveCount(0)
  expect(await stored(page)).toBeNull()
  await page.locator('.display-example-page > div:not([hidden]) > .display-save-bar').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(/\/settings#settings-display$/)
  await page.getByRole('link', { name: `Edit ${kind} Info Page`, exact: true }).click()
  await expect(field(preview, group, key)).toBeVisible()
  await manage(preview, true)
  await field(preview, group, key).click()
  await page.keyboard.press('Backspace')
  const statistics = kind === 'Work' ? 'workStats' : 'seriesStats'
  await field(preview, statistics, 'words').press('Alt+ArrowDown')
  await expect(preview.frameLocator('iframe').locator('.details-story-stats dt').first()).toHaveText(kind === 'Work' ? 'Published / Total Chapters' : 'Publication Status')
  await page.locator('.display-example-page > div:not([hidden]) > .display-save-bar').getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/settings#settings-display$/)
  const preferences = await storedProfile(page)
  expect(preferences[group].hidden).toContain(key)
  expect(preferences[statistics].order[1]).toBe('words')
  await page.getByRole('link', { name: `Edit ${kind} Info Page`, exact: true }).click()
  await expect(field(preview, group, key)).toHaveCount(0)
  expect(requests).toEqual([])
})

for (const kind of ['Work', 'Series'] as const) test(`${kind} tiles support grouped lines and standalone information`, async ({ page }, info) => {
  await setup(page)
  const preview = editor(page, `${kind} Tile`), group = kind === 'Work' ? 'workTile' : 'seriesTile'
  const extra = kind === 'Work' ? 'reading' : 'updated', extraLabel = kind === 'Work' ? 'Reading Status' : 'Date Updated'
  await manage(preview, true)
  await preview.getByRole('button', { name: new RegExp(`^Add ${extraLabel}`) }).click()
  if (kind === 'Series') await preview.getByRole('button', { name: /^Add Private Notes/ }).click()
  await manage(preview, false)
  await field(preview, group, extra).click()
  await field(preview, group, 'line:facts').click({ position: { x: 3, y: 3 } })
  expect(await field(preview, group, extra).evaluate(node => !!node.closest('.display-grouped-line'))).toBe(true)
  await field(preview, group, extra).click()
  await preview.getByRole('button', { name: 'Move to Own Line', exact: true }).click()
  expect(await field(preview, group, extra).evaluate(node => !!node.closest('.display-grouped-line'))).toBe(false)
  await preview.getByRole('button', { name: 'Add Grouped Line', exact: true }).click()
  const empty = preview.frameLocator('iframe').locator('.display-grouped-line').filter({ has: preview.frameLocator('iframe').locator('.display-line-placeholder') })
  await expect(empty).toHaveCount(1)
  await field(preview, group, extra).click()
  await empty.click()
  const newLine = preview.frameLocator('iframe').locator('.display-grouped-line').filter({ has: preview.frameLocator('iframe').locator(`[data-display-group="${group}"][data-display-field="${extra}"]`) })
  await expect(newLine).toHaveCount(1)
  const second = kind === 'Work' ? 'summary' : 'notes'
  const source = field(preview, group, second), destination = field(preview, group, extra)
  await source.evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 150))
  await dragInformation(page, source, destination, info.project.name === 'mobile')
  await expect(newLine.locator(`[data-display-field="${second}"]`).last()).toBeVisible()
  expect(await stored(page)).toBeNull()
  await applyTileDrafts(page, 'Save')
  await page.reload()
  await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Series Tiles', exact: true }).click()
  await expect(newLine.locator(`[data-display-field="${second}"]`).last()).toBeVisible()
  await field(preview, group, extra).click()
  await preview.getByRole('button', { name: 'Move to Own Line', exact: true }).click()
  await applyTileDrafts(page, 'Cancel')
  await expect(newLine.locator(`[data-display-field="${second}"]`).last()).toBeVisible()
  expect(await preview.frameLocator('iframe').locator('article').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await preview.screenshot({ path: `test-results/grouped-${kind.toLowerCase()}-${info.project.name}.png` })
  await page.goto(kind === 'Work' ? '/reading' : '/library?shelf=series')
  await expect(page.locator(`${kind === 'Work' ? '.work-card' : '.series-card'} .display-grouped-line`).filter({ has: page.locator('.story-summary') })).toHaveCount(1)
})

for (const kind of ['Work', 'Series'] as const) test(`${kind} info page fields can share a grouped line`, async ({ page }, info) => {
  await setup(page)
  await page.getByRole('link', { name: `Edit ${kind} Info Page`, exact: true }).click()
  const preview = editor(page, `Example ${kind} Info Page`), group = kind === 'Work' ? 'workStats' : 'seriesStats'
  await field(preview, group, 'words').click()
  await preview.getByRole('button', { name: 'Add Grouped Line', exact: true }).click()
  const created = preview.frameLocator('iframe').locator('.display-grouped-line').filter({ has: preview.frameLocator('iframe').locator(`[data-display-group="${group}"][data-display-field="words"]`) })
  const line = (await created.getAttribute('data-display-field'))!
  await field(preview, group, 'updated').click()
  await field(preview, group, line).click({ position: { x: 3, y: 3 } })
  await expect(field(preview, group, line).locator('.display-line-item')).toHaveCount(2)
  await page.locator('.display-example-page > div:not([hidden]) > .display-save-bar').getByRole('button', { name: 'Save', exact: true }).click()
  await page.goto(kind === 'Work' ? '/stories/display-entry' : '/series/77')
  const grouped = page.locator('.details-story-stats .display-grouped-line')
  await expect(grouped.locator('dt')).toHaveCount(2)
  await grouped.screenshot({ path: `test-results/grouped-page-${kind.toLowerCase()}-${info.project.name}.png` })
  await page.reload()
  await expect(grouped.locator('dt')).toHaveCount(2)
})

test('Shift-click groups and deletes multiple fields, with repeatable saved dividers', async ({ page }) => {
  await setup(page)
  const work = editor(page, 'Work Tile')
  await field(work, 'workTile', 'authors').click({ modifiers: ['Shift'] })
  await field(work, 'workTile', 'fandoms').click({ modifiers: ['Shift'] })
  await expect(work.getByRole('status')).toContainText('2 elements selected')
  await work.getByRole('button', { name: 'Add Grouped Line', exact: true }).click()
  const line = work.frameLocator('iframe').locator('.display-grouped-line').filter({ has: work.frameLocator('iframe').locator('[data-display-field="authors"]') })
  await expect(line.locator('.display-line-item')).toHaveCount(2)
  await line.getByRole('button', { name: 'Select Grouped Line', exact: true }).click({ modifiers: ['Shift'] })
  await page.keyboard.press('Delete')
  await expect(line).toHaveCount(0)
  await expect(field(work, 'workTile', 'authors')).toBeVisible()
  await field(work, 'workTile', 'authors').click({ modifiers: ['Shift'] })
  await field(work, 'workTile', 'fandoms').click({ modifiers: ['Shift'] })
  await page.keyboard.press('Delete')
  await expect(field(work, 'workTile', 'authors')).toHaveCount(0)
  await expect(field(work, 'workTile', 'fandoms')).toHaveCount(0)
  await work.getByRole('button', { name: 'Add Divider', exact: true }).click()
  await work.getByRole('button', { name: 'Add Divider', exact: true }).click()
  await expect(work.frameLocator('iframe').locator('.display-custom-divider')).toHaveCount(2)
  expect(await stored(page)).toBeNull()
  await applyTileDrafts(page, 'Save')
  await page.reload()
  await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Series Tiles', exact: true }).click()
  await expect(work.frameLocator('iframe').locator('.display-custom-divider')).toHaveCount(2)
  await work.frameLocator('iframe').locator('.display-custom-divider').first().click({ modifiers: ['Shift'] })
  await page.keyboard.press('Delete')
  await expect(work.frameLocator('iframe').locator('.display-custom-divider')).toHaveCount(1)
  await page.reload()
  await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Series Tiles', exact: true }).click()
  await expect(work.frameLocator('iframe').locator('.display-custom-divider')).toHaveCount(2)
})

test('new tile metadata and category colors preview immediately and apply only after Save', async ({ page }) => {
  await setup(page)
  for (const kind of ['Work', 'Series']) {
    const preview = editor(page, `${kind} Tile`), group = `${kind.toLowerCase()}Tile`
    await manage(preview, true)
    for (const label of ['Relationships', 'Characters', 'Additional Tags', 'AO3 Warnings', 'Personal Rating', 'Custom Collections', 'AO3 Kudos']) {
      await preview.getByRole('button', { name: new RegExp(`^Add ${label}`) }).click()
    }
    await manage(preview, false)
    await expect(field(preview, group, 'warnings')).toContainText('Creator Chose Not To Use Archive Warnings')
    await expect(field(preview, group, 'kudos')).toContainText(kind === 'Work' ? '18,314' : '27,699')
    await expect(field(preview, group, 'relationships')).not.toContainText('Relationships:')
    await expect(field(preview, group, 'characters')).not.toContainText('Characters:')
    await expect(field(preview, group, 'tags')).not.toContainText('Additional Tags:')
    const colors = page.getByRole('group', { name: 'Additional Tags Color', exact: true })
    if (await colors.getByRole('button', { name: 'Custom Color', exact: true }).getAttribute('aria-expanded') !== 'true') await colors.getByRole('button', { name: 'Custom Color', exact: true }).click()
    await colors.getByRole('textbox', { name: 'Custom Color (Hex)', exact: true }).fill('#123abc')
    await expect(page.locator('.tag-shape-option[aria-pressed="true"] .metadata-tag').first()).toHaveCSS('color', 'rgb(18, 58, 188)')
  }
  expect(await stored(page)).toBeNull()
  await page.reload()
  await page.getByRole('button', { name: 'Edit Tag Format', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Series Tiles', exact: true }).click()
  const work = editor(page, 'Work Tile')
  await expect(field(work, 'workTile', 'kudos')).toHaveCount(0)
  await manage(work, true)
  await work.getByRole('button', { name: /^Add Relationships/ }).click()
  const colors = page.getByRole('group', { name: 'Additional Tags Color', exact: true })
  if (await colors.getByRole('button', { name: 'Custom Color', exact: true }).getAttribute('aria-expanded') !== 'true') await colors.getByRole('button', { name: 'Custom Color', exact: true }).click()
  await colors.getByRole('textbox', { name: 'Custom Color (Hex)', exact: true }).fill('#123abc')
  await applyTileDrafts(page, 'Save')
  await page.reload()
  await page.getByRole('button', { name: 'Edit Tag Format', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Work Tiles', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Series Tiles', exact: true }).click()
  await expect(page.locator('.tag-shape-option[aria-pressed="true"] .metadata-tag').first()).toHaveCSS('color', 'rgb(18, 58, 188)')
})

test('tag shape choices and short dividers save from the real work preview', async ({ page }) => {
  await setup(page)
  const work=editor(page,'Work Tile'), series=editor(page,'Series Tile')
  await expect(work.frameLocator('iframe').getByRole('heading',{name:'Minimum Height Requirement',exact:true})).toBeVisible()
  await expect(series.frameLocator('iframe').getByRole('link',{name:'Childish Things',exact:true})).toBeVisible()
  await expect(field(series,'seriesTile','words')).toHaveText('67,405 words')
  await manage(work,true)
  await work.getByRole('button',{name:/^Add Additional Tags/}).click()
  await manage(work,false)
  const tags=field(work,'workTile','tags').locator('.categorized-tags')
  await expect(tags).toHaveAttribute('data-tag-shape','bullets')
  await expect(tags).toContainText('Batfamily Feels • Bruce Wayne is a Good Dad')
  const choices=page.getByRole('region',{name:'Site-Wide Tag Appearance',exact:true}).getByRole('group',{name:'Tag Shape',exact:true})
  await expect(choices.locator('.metadata-tag')).toHaveCount(12)
  const options = choices.locator('.tag-shape-option')
  await expect(options).toHaveCount(6)
  const tops = await options.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top))
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1)
  await expect(choices).toHaveCSS('padding-top', '8px')
  const unselected = options.filter({ hasText: 'Filled Chips' })
  const fill = await unselected.evaluate(node => getComputedStyle(node).backgroundColor)
  await unselected.focus()
  await expect(unselected).not.toHaveCSS('background-color', fill)
  await choices.getByRole('button',{name:'Humor Fluff Sharp Rectangles',exact:true}).click()
  await expect(tags).toHaveAttribute('data-tag-shape','sharp')
  await expect(tags.locator('.metadata-tag').first()).toHaveCSS('border-radius','0px')
  await choices.getByRole('button',{name:'Humor, Fluff Text With Comma Separators',exact:true}).click()
  await expect(tags).toContainText('Batfamily Feels, Bruce Wayne is a Good Dad')
  await expect(tags.locator('.metadata-tag').first()).toHaveCSS('border-width','0px')
  await choices.getByRole('button',{name:'Humor Fluff Rounded Pill',exact:true}).click()
  await work.getByRole('button',{name:'Add Short Divider',exact:true}).click()
  await work.getByRole('button',{name:'Add Short Divider',exact:true}).click()
  await expect(work.frameLocator('iframe').locator('.display-short-divider')).toHaveCount(2)
  await expect(work.frameLocator('iframe').locator('.display-short-divider').first()).toHaveCSS('width','48px')
  expect(await stored(page)).toBeNull()
  await applyTileDrafts(page, 'Save')
  await page.reload()
  await page.getByRole('button',{name:'Edit Work Tiles',exact:true}).click()
  await expect(tags).toHaveAttribute('data-tag-shape','pill')
  await expect(work.frameLocator('iframe').locator('.display-short-divider')).toHaveCount(2)
  expect(await work.frameLocator('iframe').locator('article').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true)
})


test('wrapped tags flow directly into the next section on a grouped line', async ({page})=>{
  const tables=await setup(page)
  const entry=tables.library_entries.find(entry=>entry.id==='display-entry')!
  entry.metadata_overrides={...entry.metadata_overrides as object,additional_tags:['Humor '.repeat(14).trim(),'Fluff']}
  for(const shape of ['bullets','pill']) {
    await page.evaluate(shape=>localStorage.setItem('between-chapters:display:v1',JSON.stringify({workTile:{order:['line:flow'],hidden:[],lines:{'line:flow':['tags','words']},tagShape:shape}})),shape)
    await page.goto('/reading')
    const line=page.locator('.work-card .display-grouped-line').filter({has:page.locator('.categorized-tags')})
    await line.evaluate(node=>{(node as HTMLElement).style.width='250px'})
    const positions=await line.evaluate(node=>{
      function edge(element:Element,last:boolean) {
        const text=element.firstChild!,range=document.createRange(),index=last?text.textContent!.length-1:0
        range.setStart(text,index);range.setEnd(text,index+1)
        return range.getBoundingClientRect().toJSON()
      }
      return {lastTag:edge(node.querySelector('.metadata-tag:last-child')!,true),nextSection:edge(node.querySelector('.display-fact-value')!,false),firstTag:node.querySelector('.metadata-tag')!.getBoundingClientRect().toJSON()}
    })
    expect(positions.firstTag.height).toBeGreaterThan(25)
    expect(Math.abs(positions.lastTag.top-positions.nextSection.top)).toBeLessThan(4)
    if(shape==='bullets') {
      const sizes=await line.evaluate(node=>({tag:parseFloat(getComputedStyle(node.querySelector('.metadata-tag')!).fontSize),bullet:parseFloat(getComputedStyle(node.querySelector('.info-separator')!).fontSize)}))
      expect(sizes.bullet/sizes.tag).toBeCloseTo(.75,1)
    }
  }
})


test('information remains draggable while Hide/Show Information is open', async ({page},info)=>{
  await setup(page)
  const work=editor(page,'Work Tile')
  await manage(work,true)
  const authors=field(work,'workTile','authors'),fandoms=field(work,'workTile','fandoms')
  await authors.scrollIntoViewIfNeeded()
  await dragInformation(page,authors.locator('a').first(),fandoms,info.project.name==='mobile')
  await expect(authors).toBeVisible()
  expect(await authors.evaluate(node=>!!(node.compareDocumentPosition(node.parentElement!.querySelector('[data-display-field="fandoms"]')!)&Node.DOCUMENT_POSITION_PRECEDING))).toBe(true)
  expect(await stored(page)).toBeNull()
})

test('inline grouped information drags from its text without selecting it', async ({page},info)=>{
  await setup(page)
  const work=editor(page,'Work Tile'),words=field(work,'workTile','words'),rating=field(work,'workTile','rating')
  await field(work,'workTile','line:facts').scrollIntoViewIfNeeded()
  await dragInformation(page,words,rating,info.project.name==='mobile')
  expect(await words.evaluate(node=>!!(node.compareDocumentPosition(node.closest('.display-grouped-line')!.querySelector('[data-display-field="rating"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
})


test('global tag appearance, Apply and Undo are shared across tiles and pages',async({page})=>{
 const tables=await setup(page)
 tables.library_entries[0].metadata_overrides={...tables.library_entries[0].metadata_overrides as object,additional_tags:['Humor','Fluff'],relationship_tags:['Alice/Bob'],character_tags:['Alice'],archive_warnings:['No Archive Warnings Apply'],ao3_tags:['Display fandom','Humor','Fluff']}
 const appearance=page.getByRole('region',{name:'Site-Wide Tag Appearance',exact:true})
 const work=editor(page,'Work Tile'),series=editor(page,'Series Tile')
 await expect(work.getByRole('group',{name:'Tag Shape',exact:true})).toHaveCount(0)
 await expect(series.getByRole('group',{name:'Tag Colors',exact:true})).toHaveCount(0)
 const warning=appearance.getByRole('group',{name:'AO3 Warnings Color',exact:true})
 await expect(warning.getByRole('button',{name:'Custom Color',exact:true})).toHaveText('#970000')
 const sizes=await appearance.evaluate(node=>({shape:getComputedStyle(node.querySelector('.display-tag-shapes legend')!).fontSize,colors:getComputedStyle(node.querySelector('.display-tag-colors legend')!).fontSize,help:getComputedStyle(node.querySelector(':scope > .field-help')!).fontSize,labels:[...node.querySelectorAll('.display-tag-color-grid > div > .field-help')].map(label=>getComputedStyle(label).fontSize)}))
 expect(sizes.colors).toBe(sizes.shape)
 expect(sizes.labels).toEqual(Array(6).fill(sizes.help))
 await expect(appearance.locator('.display-tag-color-grid .metadata-tag')).toHaveCount(6)
 await expect(appearance.locator('.display-tag-example > span:first-child')).toHaveText(Array(6).fill('Ex.'))
 for(const label of await appearance.locator('.display-tag-color-grid > div > .field-help').all()) await expect(label).toHaveText(/:$/)
 await expect(appearance.getByRole('group',{name:'Change All Tags',exact:true}).locator('.field-help')).toHaveText('Change All Tags:')
 const all=appearance.getByRole('group',{name:'Change All Tags',exact:true})
 await all.getByRole('button',{name:'Custom Color',exact:true}).click()
 await all.getByRole('textbox',{name:'Custom Color (Hex)',exact:true}).fill('#123abc')
 const heights=await Promise.all([all.getByRole('button',{name:'Custom Color',exact:true}),appearance.getByRole('button',{name:'Apply',exact:true}),appearance.getByRole('button',{name:'Undo',exact:true})].map(async button=>(await button.boundingBox())!.height))
 expect(heights).toEqual(Array(3).fill(heights[0]))
 await appearance.getByRole('button',{name:'Apply',exact:true}).click()
 await expect(appearance.locator('.display-tag-color-grid .collection-color-trigger')).toHaveText(Array(6).fill('#123abc'))
 expect(await stored(page)).toBeNull()
 await appearance.getByRole('button',{name:'Undo',exact:true}).click()
 await expect(warning.getByRole('button',{name:'Custom Color',exact:true})).toHaveText('#970000')
 await expect(appearance.getByRole('button',{name:'Undo',exact:true})).toBeDisabled()
 await appearance.getByRole('button',{name:'Apply',exact:true}).click()
 await appearance.getByRole('button',{name:'Humor Fluff Sharp Rectangles',exact:true}).click()
 expect(await appearance.locator('.display-tag-color-grid .categorized-tags').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-tag-shape')))).toEqual(Array(6).fill('sharp'))
 for(const tag of await appearance.locator('.display-tag-color-grid .metadata-tag').all()) await expect(tag).toHaveCSS('color','rgb(18, 58, 188)')
 for(const [preview,group] of [[work,'workTile'],[series,'seriesTile']] as const) {
  await manage(preview,true)
  await preview.getByRole('button',{name:/^Add Additional Tags/}).click()
  await manage(preview,false)
  await expect(field(preview,group,'tags').locator('.categorized-tags')).toHaveAttribute('data-tag-shape','sharp')
  await expect(field(preview,group,'tags').locator('.metadata-tag').first()).toHaveCSS('color','rgb(18, 58, 188)')
 }
 await applyTileDrafts(page, 'Save')
 expect(JSON.parse((await stored(page))!).tagAppearance).toMatchObject({shape:'sharp',colors:{warnings:'#123abc',tags:'#123abc'}})
 for(const kind of ['Work','Series']) {
  await page.goto(`/settings/example-${kind.toLowerCase()}`)
  await expect(page.getByRole('group',{name:'Tag Shape',exact:true})).toHaveCount(0)
  const preview=editor(page,`Example ${kind} Info Page`)
  if(kind==='Series') {
   await manage(preview,true)
   await preview.getByRole('button',{name:/^Add Additional Tags/}).click()
   await manage(preview,false)
  }
  const tags=preview.frameLocator('iframe').locator('.categorized-tags[data-tag-category="tags"]').first()
  await expect(tags).toHaveAttribute('data-tag-shape','sharp')
  await expect(tags.locator('.metadata-tag').first()).toHaveCSS('color','rgb(18, 58, 188)')
 }
 await page.goto('/reading')
 const renderedTagGroups = page.locator('.work-card .categorized-tags')
 await expect(renderedTagGroups.first()).toBeVisible()
 for (const tags of await renderedTagGroups.all()) await expect(tags).toHaveAttribute('data-tag-shape','sharp')
 await expect(page.locator('.work-card .expandable-metadata-tags .tag-group-label')).toHaveCount(0)
 const categorizedChips = page.locator('.work-card .expandable-metadata-tags .metadata-tag')
 await expect(categorizedChips).toHaveCount(page.viewportSize()!.width <= 650 ? 4 : 5)
 if (page.viewportSize()!.width <= 650) await page.locator('.work-card .expandable-metadata-tags').getByRole('button',{name:/more$/}).click()
 await expect(categorizedChips).toHaveCount(5)
 for (const chip of await categorizedChips.all()) { await expect(chip).toBeVisible(); await expect(chip).toHaveCSS('border-radius','0px') }
 await expect(categorizedChips.filter({hasText:'Display fandom'})).toHaveCount(0)
 await page.reload()
 await expect(page.locator('.work-card .expandable-metadata-tags .metadata-tag')).toHaveCount(page.viewportSize()!.width <= 650 ? 4 : 5)
 if (page.viewportSize()!.width <= 650) await page.locator('.work-card .expandable-metadata-tags').getByRole('button',{name:/more$/}).click()
 await expect(page.locator('.work-card .expandable-metadata-tags .metadata-tag')).toHaveCount(5)
 for (const chip of await page.locator('.work-card .expandable-metadata-tags .metadata-tag').all()) await expect(chip).toBeVisible()
 await expect(page.locator('.work-card .metadata-tag').first()).toHaveCSS('color','rgb(18, 58, 188)')
})

test('preview tiles match live tile widths and grouped-line indentation',async({page})=>{
 await setup(page)
 await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('between-chapters:display:v1') ?? '{}'); raw.previewViewports = { mobile: { width: innerWidth, height: innerHeight }, desktop: { width: innerWidth, height: innerHeight } }; localStorage.setItem('between-chapters:display:v1', JSON.stringify(raw)); dispatchEvent(new Event('between-chapters:display-changed')) })
 const previewWidths=await Promise.all(['Work','Series'].map(async kind=>await editor(page,`${kind} Tile`).frameLocator('iframe').locator('article').first().evaluate(node => node.getBoundingClientRect().width)))
 for (const kind of ['Work', 'Series']) {
  const preview = editor(page, `${kind} Tile`).frameLocator('iframe')
  const card = preview.locator('article').first()
  expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  for (const line of await card.locator('hr:visible').all()) expect(await line.evaluate(node => node.getBoundingClientRect().right <= node.closest('article')!.getBoundingClientRect().right)).toBe(true)
 }
 const previewInset=await field(editor(page,'Work Tile'),'workTile','line:facts').evaluate(node=>node.getBoundingClientRect().left-node.closest('article')!.getBoundingClientRect().left)
 await page.goto('/reading')
 const live=page.locator('.work-card').first()
 expect((await live.boundingBox())!.width).toBeCloseTo(previewWidths[0],0)
 const liveInset=await live.locator('.display-grouped-line').first().evaluate(node=>node.getBoundingClientRect().left-node.closest('article')!.getBoundingClientRect().left)
 expect(previewInset).toBeCloseTo(liveInset,1)
 await page.goto('/library?shelf=series')
 expect((await page.locator('.series-card').first().boundingBox())!.width).toBeCloseTo(previewWidths[1],0)
})

test('editor actions are centered, subsection titles interrupt borders, and category rows stay aligned',async({page},info)=>{
 await setup(page)
 const work=editor(page,'Work Tile')
 for(const width of info.project.name==='mobile'?[320,390]:[1280]) {
  await page.setViewportSize({width,height:844})
  const titlePositions:number[]=[],buttonWidths:number[]=[]
  for(const heading of await page.locator('.display-tile-heading').all()) {
   const titleNode=heading.getByRole('heading'),title=(await titleNode.boundingBox())!,legend=(await heading.boundingBox())!
   expect(await heading.evaluate(node=>node.tagName)).toBe('LEGEND')
   titlePositions.push(title.x)
   expect(title.width+1).toBeGreaterThanOrEqual(await titleNode.evaluate(node=>node.scrollWidth))
   for(const control of await heading.locator(':scope > .button').all()) {
    const bounds=(await control.boundingBox())!
    if(await control.evaluate(node=>node.tagName==='BUTTON')) buttonWidths.push(bounds.width)
    expect(bounds.x).toBeGreaterThanOrEqual(legend.x)
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(legend.x+legend.width+1)
    expect(await control.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true)
    expect(bounds.y).toBeGreaterThanOrEqual(legend.y)
    expect(bounds.y+bounds.height).toBeLessThanOrEqual(legend.y+legend.height+1)
   }
  }
  if(info.project.name==='mobile') {
   expect(new Set(titlePositions).size).toBe(1)
   expect(buttonWidths).toEqual([110,110,110])
  }
 }
 const layout=await page.locator('.display-settings').evaluate(node=>{
  const actions=node.querySelector('.display-editor-actions')!,buttons=[...actions.querySelectorAll('button')].map(button=>button.getBoundingClientRect()),section=actions.getBoundingClientRect()
  const sections=[...node.querySelectorAll('.display-tile-section')],toggle=sections[0].querySelector('.display-tile-heading > button')!,heading=sections[0].querySelector('h3')!
  const grid=node.querySelector('.display-tag-color-grid')!
  return {allPickerLeft:node.querySelector('.display-all-colors .collection-color-trigger')!.getBoundingClientRect().left,actionCenter:(Math.min(...buttons.map(rect=>rect.left))+Math.max(...buttons.map(rect=>rect.right)))/2,sectionCenter:(section.left+section.right)/2,borders:sections.map(section=>getComputedStyle(section).borderTopWidth),headingCenter:(heading.getBoundingClientRect().top+heading.getBoundingClientRect().bottom)/2,toggleCenter:(toggle.getBoundingClientRect().top+toggle.getBoundingClientRect().bottom)/2,afterPreviewGap:sections[1].querySelector('.display-tile-heading > button')!.getBoundingClientRect().top-sections[0].querySelector('.viewport-preview-crop')!.getBoundingClientRect().bottom,gridWidth:grid.getBoundingClientRect().width,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,rows:[...grid.children].map(row=>{const label=row.querySelector(':scope > .field-help')!.getBoundingClientRect(),picker=row.querySelector('.collection-color-trigger')!.getBoundingClientRect(),tag=row.querySelector('.categorized-tags')!.getBoundingClientRect();return {rowWidth:row.getBoundingClientRect().width,rowCenter:(row.getBoundingClientRect().left+row.getBoundingClientRect().right)/2,labelX:label.right,pickerLeft:picker.left,pickerRight:picker.right,tagLeft:tag.left,labelY:(label.top+label.bottom)/2,pickerY:(picker.top+picker.bottom)/2,tagTop:tag.top,tagCenter:(tag.top+tag.bottom)/2,pickerBottom:picker.bottom}})}
 })
 expect(layout.actionCenter).toBeCloseTo(layout.sectionCenter,0)
 expect(layout.borders).toEqual(['1px','1px'])
 expect(layout.headingCenter).toBeCloseTo(layout.toggleCenter,0)
 expect(layout.afterPreviewGap).toBeGreaterThanOrEqual(32)
 expect(layout.columns).toBe(info.project.name==='mobile'?1:2)
 const divider = await page.locator('.display-tag-color-grid').evaluate(node => ({display:getComputedStyle(node,'::before').display,border:getComputedStyle(node,'::before').borderInlineStartWidth}))
 if(layout.columns===2) { expect(divider.display).not.toBe('none');expect(divider.border).toBe('1px') }
 else expect(divider.display).toBe('none')
 if(layout.columns===2) {
  expect(layout.rows[3].pickerLeft).toBeGreaterThan(layout.rows[0].pickerRight)
  expect(layout.rows[3].pickerY).toBe(layout.rows[0].pickerY)
 }
 expect(layout.allPickerLeft).toBe(layout.rows[0].pickerLeft)
 for(const [index,row] of layout.rows.entries()) {
  expect(row.pickerLeft).toBe(layout.rows[layout.columns===1?0:index<3?0:3].pickerLeft)
  if(info.project.name==='desktop') {
   expect(row.pickerLeft-row.labelX).toBe(8)
   expect(Math.abs(row.labelY-row.pickerY)).toBeLessThan(1)
  } else expect(row.labelY).toBeLessThan(row.pickerY)
  expect(row.tagLeft).toBeGreaterThan(row.pickerRight)
  expect(Math.abs(row.tagCenter-row.pickerY)).toBeLessThan(1)
  expect(row.rowWidth).toBeCloseTo((layout.gridWidth-(layout.columns-1)*24)/layout.columns,0)
 }
 for(const tag of await page.locator('.display-tag-color-grid .metadata-tag').all()) {
  expect(await tag.evaluate(node=>node.getBoundingClientRect().right<=innerWidth)).toBe(true)
 }
 await expect(work.getByRole('button',{name:'Hide/Show Information',exact:true})).toBeVisible()
 await page.getByRole('region',{name:'Site-Wide Tag Appearance',exact:true}).screenshot({path:`test-results/tag-category-rows-${info.project.name}.png`})
 await page.goto('/settings#settings-metadata')
 const metadataGap=await page.getByRole('group',{name:'Retrieval Mode',exact:true}).evaluate(node=>node.querySelector('.form-controls-row label')!.getBoundingClientRect().top-node.querySelector('legend')!.getBoundingClientRect().bottom)
 await page.goto('/settings#ao3-browser-bar')
 const installationGap=await page.getByRole('group',{name:'Install or Update',exact:true}).evaluate(node=>node.querySelector(':scope > p')!.getBoundingClientRect().top-node.querySelector('legend')!.getBoundingClientRect().bottom)
 expect(metadataGap).toBeCloseTo(installationGap,0)
})

test('Move Up and Move Down retain the current single or multiple selection',async({page})=>{
 await setup(page)
 const work=editor(page,'Work Tile'),authors=field(work,'workTile','authors')
 await authors.click()
 for(let cycle=0;cycle<2;cycle++) {
  await work.getByRole('button',{name:'Move Authors Down',exact:true}).click()
  await expect(authors).toHaveAttribute('data-display-selected','true')
  await work.getByRole('button',{name:'Move Authors Up',exact:true}).click()
  await expect(authors).toHaveAttribute('data-display-selected','true')
 }
 await work.frameLocator('iframe').locator('.display-edit-surface').press('Escape')
 const rating=field(work,'workTile','rating'),words=field(work,'workTile','words')
 await rating.click()
 await words.click({modifiers:['Shift']})
 for(const direction of ['Up','Down']) {
  await work.getByRole('button',{name:`Move Selected Elements ${direction}`,exact:true}).click()
  await expect(rating).toHaveAttribute('data-display-selected','true')
  await expect(words).toHaveAttribute('data-display-selected','true')
  await expect(work.getByRole('status')).toContainText('2 elements selected')
 }
 expect(await stored(page)).toBeNull()
})

test('desktop settings outline shows descriptions and jumps to every section', async ({ page }, info) => {
 test.skip(info.project.name === 'mobile', 'Mobile uses section navigation.')
 await setup(page)
 await expect(page.getByRole('navigation', { name: 'Settings Quick Access', exact: true })).toHaveCount(0)
 const outline = page.getByRole('navigation', { name: 'Settings Section Outline', exact: true })
 await expect(outline).toBeVisible()
 await expect(outline.getByRole('link')).toHaveCount(await page.locator('.settings-section').count())
 const outlineBox = (await outline.boundingBox())!, contentBox = (await page.locator('.settings-content').boundingBox())!
 expect(outlineBox.x + outlineBox.width).toBeLessThanOrEqual(contentBox.x)
 const links = await outline.getByRole('link').evaluateAll(nodes => nodes.map(node => ({ title: node.getAttribute('aria-label')!, href: node.getAttribute('href')! })))
 for (const { title, href } of links) {
  const link = outline.getByRole('link', { name: title, exact: true })
  const description = link.locator('small')
  await expect(description).not.toBeEmpty()
  await expect(link).toHaveAccessibleDescription(await description.innerText())
  await link.click()
  const section = page.locator(href)
  await expect(section).toBeFocused()
  await expect(section.getByRole('heading', { name: title, exact: true })).toBeInViewport()
  await expect(link).toHaveAttribute('aria-current', 'location')
  await expect(outline.locator('[aria-current="location"]')).toHaveCount(1)
 }
 await page.evaluate(() => { const section = document.getElementById('settings-display')!; window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top + 200) })
 await expect(outline.getByRole('link', { name: 'Tile and Page Information', exact: true })).toHaveAttribute('aria-current', 'location')
 await page.evaluate(() => window.scrollTo(0, 0))
 await expect(outline.getByRole('link', { name: 'Account & Security', exact: true })).toHaveAttribute('aria-current', 'location')
 for (const title of await page.locator('.settings-page :is(h2,h3,h4,legend):not(.display-edit-surface *)').all()) await expect(title).toHaveCSS('color', 'rgb(151, 0, 0)')
 expect(await stored(page)).toBeNull()
})


test('mobile settings list opens sections, supports back, and retains display drafts', async ({ page }, info) => {
 test.setTimeout(60000)
 test.skip(info.project.name !== 'mobile', 'Mobile Navigation.')
 await fixture(page)
 await page.goto('/settings')
 await login(page)
 const list = page.getByRole('navigation', { name: 'Settings Sections', exact: true })
 await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
 await expect(page.getByText('MAKE YOURSELF AT HOME')).toHaveCount(0)
 await expect(list.getByRole('link')).toHaveCount(await page.locator('.settings-section').count())
 await page.setViewportSize({ width: 320, height: 844 })
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
 await expect(page.getByRole('navigation', { name: 'Settings Quick Access', exact: true })).toHaveCount(0)
 const links = await list.getByRole('link').evaluateAll(nodes => nodes.map(node => ({ title: node.getAttribute('aria-label')!, href: node.getAttribute('href')! })))
 for (const { title, href } of links) {
  const link = list.getByRole('link', { name: title, exact: true })
  const description = link.locator('small')
  await expect(description).toBeVisible()
  await expect(description).not.toBeEmpty()
  await expect(link).toHaveAccessibleDescription(await description.innerText())
  const labelBox = (await link.locator('.settings-section-label > span').boundingBox())!
  expect((await description.boundingBox())!.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height)
  await list.getByRole('link', { name: title, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${href}$`))
  await expect(list).toBeHidden()
  const section = page.locator(href.slice(href.indexOf('#')))
  await expect(section).toBeVisible()
  await expect(section).toBeFocused()
  await expect(page.locator('.settings-section > .settings-card:visible')).toHaveCount(1)
  await page.getByRole('button', { name: 'Back to Settings', exact: true }).click()
  await expect(list).toBeVisible()
  await expect(list.getByRole('link', { name: title, exact: true })).toBeFocused()
 }
 await list.getByRole('link', { name: 'Tile and Page Information', exact: true }).click()
 await page.getByRole('button', { name: 'Edit Tag Format', exact: true }).click()
 const shape = page.locator('.tag-shape-option').last()
 await shape.click()
 await expect(shape).toHaveAttribute('aria-pressed', 'true')
 await page.goBack()
 await expect(list).toBeVisible()
 await page.goForward()
 await expect(page.locator('#display-tag-format')).toBeVisible()
 await expect(shape).toHaveAttribute('aria-pressed', 'true')
 await page.getByRole('button', { name: 'Back to Settings', exact: true }).click()
 await list.getByRole('link', { name: 'Library Browsing', exact: true }).click()
 await expect(page.getByRole('combobox', { name: 'Works per Page', exact: true })).toBeVisible()
 await page.getByRole('button', { name: 'Back to Settings', exact: true }).click()
 await list.getByRole('link', { name: 'Tile and Page Information', exact: true }).click()
 await expect(shape).toHaveAttribute('aria-pressed', 'true')
 expect(await stored(page)).toBeNull()
 await page.reload()
 await expect(page.locator('#settings-display')).toBeVisible()
 await page.getByRole('button', { name: 'Back to Settings', exact: true }).click()
 await expect(list).toBeVisible()
 await page.goto('/settings#settings-display')
 await page.getByRole('link', { name: 'Edit Work Info Page', exact: true }).click()
 await page.locator('.display-example-page > div:not([hidden]) > .display-save-bar').getByRole('button', { name: 'Cancel', exact: true }).click()
 await expect(page.locator('#settings-display')).toBeVisible()
 await page.goto('/settings#ios-safari-userscript')
 await expect(page.locator('#ios-safari-userscript')).toBeVisible()
 await page.getByRole('button', { name: 'Back to Settings', exact: true }).click()
 await expect(list).toBeVisible()
})

test('saves and cancels tag, series and work tile drafts independently', async ({ page }) => {
 await setup(page)
 const work = editor(page, 'Work Tile'), series = editor(page, 'Series Tile')
 for (const [preview, group] of [[work, 'workTile'], [series, 'seriesTile']] as const) {
  await manage(preview, true)
  await field(preview, group, 'authors').click()
  await expect(field(preview, group, 'authors')).toBeVisible()
  await page.keyboard.press('Backspace')
  await expect(field(preview, group, 'authors')).toHaveCount(0)
 }
 await page.getByRole('group', { name: 'Tag Shape', exact: true }).getByRole('button', { name: 'Humor Fluff Sharp Rectangles', exact: true }).click()
 await page.locator('#display-work-editor .display-save-bar').first().getByRole('button', { name: 'Save', exact: true }).click()
 let preferences = await storedProfile(page)
 expect(preferences.workTile.hidden).toContain('authors')
 expect(preferences.seriesTile.hidden).not.toContain('authors')
 expect(preferences.tagAppearance.shape).toBe('bullets')
 await expect(field(series, 'seriesTile', 'authors')).toHaveCount(0)
 await page.locator('#display-series-editor .display-save-bar').first().getByRole('button', { name: 'Cancel', exact: true }).click()
 await expect(field(series, 'seriesTile', 'authors')).toBeVisible()
 await page.locator('#display-tag-format .display-save-bar').getByRole('button', { name: 'Save', exact: true }).click()
 preferences = await storedProfile(page)
 expect(preferences.tagAppearance.shape).toBe('sharp')
 expect(preferences.workTile.hidden).toContain('authors')
})

test('AO3 Category and statistics can be added to work tiles and information pages', async ({ page }) => {
 const tables = await setup(page)
 Object.assign(tables.library_entries[0].metadata_overrides as object, { categories: ['M/M'], language: 'English', bookmark_count: 0, comment_count: 12, hits: 1234 })
 const preview = editor(page, 'Work Tile')
 await manage(preview, true)
 for (const label of ['Category', 'AO3 Bookmarks', 'AO3 Comments', 'AO3 Hits', 'Language', 'Date Published']) {
  await preview.getByRole('button', { name: new RegExp(`^Add ${label}`) }).click()
 }
 await manage(preview, false)
 await expect(field(preview, 'workTile', 'category')).toContainText('Category:')
 await expect(field(preview, 'workTile', 'category')).toContainText('F/M')
 await applyTileDrafts(page, 'Save')
 await page.goto('/library')
 const tile = page.locator('.work-card').first()
 await expect(tile).toContainText('Category: M/M')
 await expect(tile).toContainText('0 bookmarks')
 await expect(tile).toContainText('12 comments')
 await expect(tile).toContainText('1,234 hits')
 await expect(tile).toContainText('English')
 await page.goto('/settings/example-work')
 const info = editor(page, 'Example Work Info Page')
 await manage(info, true)
 for (const label of ['Category', 'AO3 Warnings', 'AO3 Bookmarks', 'AO3 Comments', 'AO3 Hits', 'Language', 'Date Published']) {
  await info.getByRole('button', { name: new RegExp(`^Add ${label}`) }).click()
 }
 await manage(info, false)
 await page.locator('.display-example-page > div:not([hidden]) > .display-save-bar').getByRole('button', { name: 'Save', exact: true }).click()
 await page.goto('/stories/display-entry')
 const details = page.getByRole('region', { name: 'Story Information' })
 await expect(details).toContainText('Category')
 await expect(details).toContainText('M/M')
 await expect(details).toContainText('0 bookmarks')
 await expect(details).toContainText('12 comments')
 await expect(details).toContainText('1,234 hits')
 await expect(details).toContainText('English')
})

for (const kind of ['work', 'series'] as const) for (const layout of ['tile', 'page'] as const) test(`restores ${kind} ${layout} saved and unsaved customizations after confirmation`, async ({ page }) => {
 const group = layout === 'tile' ? `${kind}Tile` : `${kind}Info`
 const hiddenField = layout === 'tile' ? 'authors' : kind === 'work' ? 'summary' : 'begun'
 const saved = {
  [group]: { order: ['divider:custom', hiddenField], hidden: [hiddenField], lines: {} },
  tagAppearance: { shape: 'sharp' as const, colors: { tags: '#123456' } },
  ...(kind === 'work' ? { seriesHeader: { order: ['source', 'authors'], hidden: ['authors'] } } : { workHeader: { order: ['stats', 'authors'], hidden: ['authors'] } }),
 }
 // Account tag format and browser-local layouts are independent saved settings.
 await setup(page, saved.tagAppearance)
 await page.evaluate(value => localStorage.setItem('between-chapters:display:v1', JSON.stringify(value)), saved)
 await page.reload()
 async function open() {
  if (layout === 'page') await page.getByRole('link', { name: `Edit ${kind === 'work' ? 'Work' : 'Series'} Info Page`, exact: true }).click()
  else await page.getByRole('button', { name: `Edit ${kind === 'work' ? 'Work' : 'Series'} Tiles`, exact: true }).click()
 }
 await open()
 const controls = layout === 'page' ? page.locator('.display-example-page > div:not([hidden]) > .display-save-bar') : page.locator(`#display-${kind}-editor .display-save-bar`).first()
 const preview = editor(page, layout === 'page' ? `Example ${kind === 'work' ? 'Work' : 'Series'} Info Page` : `${kind === 'work' ? 'Work' : 'Series'} Tile`)
 await expect(field(preview, group, hiddenField)).toHaveCount(0)
 await preview.getByRole('button', { name: 'Add Divider', exact: true }).click()
 await controls.getByRole('button', { name: 'Restore to Default', exact: true }).click()
 const confirmation = page.getByRole('dialog', { name: 'Restore to Default?', exact: true })
 await expect(confirmation).toBeVisible()
 await expect(field(preview, group, hiddenField)).toHaveCount(0)
 expect(JSON.parse((await stored(page))!)).toEqual(saved)
 await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
 await expect(controls.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
 expect(JSON.parse((await stored(page))!)).toEqual(saved)
 await controls.getByRole('button', { name: 'Restore to Default', exact: true }).click()
 await confirmation.getByRole('button', { name: 'Restore to Default', exact: true }).click()
 await expect(confirmation).toHaveCount(0)
 await expect(field(preview, group, hiddenField)).toBeVisible()
 await expect(field(preview, group, 'divider:custom')).toHaveCount(0)
 await expect(controls.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
 const result = await storedProfile(page)
 expect(result[group].hidden).not.toContain(hiddenField)
 expect(result[group].order.some((key: string) => key.startsWith('divider:'))).toBe(false)
 expect(result.tagAppearance).toEqual(saved.tagAppearance)
 expect(result[kind === 'work' ? 'seriesHeader' : 'workHeader'].hidden).toContain('authors')
 await page.reload()
 if (layout === 'tile') await open()
 await expect(field(preview, group, hiddenField)).toBeVisible()
 expect(await storedProfile(page)).toEqual(result)
})

test('example work expands editable other metadata and preserves its own field choices', async ({ page }) => {
 await setup(page)
 await page.goto('/settings/example-work')
 const info = editor(page, 'Example Work Info Page')
 const chapterHistory = field(info, 'workInfo', 'chapterHistory')
 await expect(chapterHistory).toContainText('No chapter reads recorded yet.')
 await chapterHistory.click()
 await info.getByRole('button', { name: 'Hide/Delete Selected', exact: true }).click()
 await expect(chapterHistory).toHaveCount(0)
 await manage(info, true)
 await info.getByRole('button', { name: 'Add Chapter Reading History', exact: true }).click()
 await manage(info, false)
 await expect(chapterHistory).toBeVisible()
 const other = info.frameLocator('iframe').locator('details').filter({ has: info.frameLocator('iframe').locator('summary').filter({ hasText: /^Other Metadata$/ }) })
 await expect(other).toHaveAttribute('open', '')
 await expect(field(info, 'workOther', 'language')).toBeVisible()
 await expect(field(info, 'workOther', 'warnings')).toBeVisible()
 await expect(field(info, 'workOther', 'authors')).toHaveCount(0)
 await field(info, 'workOther', 'language').click()
 await info.getByRole('button', { name: 'Hide/Delete Selected', exact: true }).click()
 await expect(field(info, 'workOther', 'language')).toHaveCount(0)
 await manage(info, true)
 await expect(info.getByRole('heading', { name: 'Hide/Show Information', exact: true })).toHaveCount(0)
 const available = info.getByRole('region', { name: 'Available Information', exact: true })
 const section = available.locator('details').filter({ has: page.getByText('Work Pages · Other Metadata', { exact: true }) })
 const addLanguage = section.getByRole('button', { name: 'Add Language', exact: true })
 await expect(addLanguage).toBeVisible()
 await section.locator('summary').click()
 await expect(addLanguage).toBeHidden()
 const shown = info.getByRole('region', { name: 'Shown Information', exact: true }).locator('details').filter({ has: page.getByText('Work Pages · Other Metadata', { exact: true }) })
 await expect(shown.getByRole('button', { name: 'Select Verified Canonical URL', exact: true })).toBeVisible()
 await section.locator('summary').click()
 await addLanguage.click()
 await manage(info, false)
 await expect(field(info, 'workOther', 'language')).toBeVisible()
 await field(info, 'workOther', 'canonical').click()
 await info.getByRole('button', { name: 'Hide/Delete Selected', exact: true }).click()
 await page.locator('.display-example-page > div:not([hidden]) > .display-save-bar').getByRole('button', { name: 'Save', exact: true }).click()
 await expect(page).toHaveURL(/\/settings#settings-display$/)
 await page.goto('/settings/example-work')
 await expect(field(editor(page, 'Example Work Info Page'), 'workOther', 'language')).toBeVisible()
 await expect(field(editor(page, 'Example Work Info Page'), 'workOther', 'canonical')).toHaveCount(0)
 await page.screenshot({ path: test.info().outputPath('expanded-other-metadata.png') })
})

test('sample tile tooltips extend beyond the crop without moving their anchors', async ({ page }, info) => {
 await setup(page)
 for (const kind of ['Work', 'Series']) {
  const desktop = page.getByRole('region', { name: `${info.project.name === 'mobile' ? 'Mobile' : 'Desktop'} ${kind} Tile Layout`, exact: true })
  // Put the Favorite trigger near the crop edge using the supported tile editor.
  // Hide fandoms to keep the sample content compact while testing its crop edge.
  if (kind === 'Work') {
   const fandoms = field(desktop, 'workTile', 'fandoms')
   await fandoms.click()
   await page.keyboard.press('Backspace')
   await expect(fandoms).toHaveCount(0)
  }
  const preview = desktop.locator('iframe')
  const frame = preview.contentFrame()
  const anchor = frame.getByRole('button', { name: /^(?:Unmark|Mark) Favorite$/ }).first()
  await anchor.hover()
  const tooltip = page.getByRole('tooltip', { name: 'Favorite', exact: true })
  await expect(tooltip).toBeVisible()
  await expect(anchor).toHaveAccessibleDescription('Favorite')
  const crop = (await desktop.locator('.viewport-preview-crop').boundingBox())!, trigger = (await anchor.boundingBox())!, hint = (await tooltip.boundingBox())!
  const scale = await preview.evaluate(node => node.getBoundingClientRect().width / (node as HTMLIFrameElement).offsetWidth)
  expect(hint.y).toBeLessThan(crop.y)
  expect(Math.abs(hint.y + hint.height + 6 * scale - trigger.y)).toBeLessThan(2)
  expect(Math.abs(hint.x + hint.width / 2 - trigger.x - trigger.width / 2)).toBeLessThan(2)
  // Hit testing above the crop confirms that the tooltip is painted, not clipped.
  expect(await tooltip.evaluate(isTooltipPaintedAt, Math.min(crop.y - 1, hint.y + hint.height / 2))).toBe(true)
  await expect(tooltip).toHaveCSS('pointer-events', 'none')
  await page.mouse.move(0, 0)
  await expect(tooltip).toHaveCount(0)
 }
})

test('tile previews use their own viewport for collapsed tag counts',async({page})=>{
 await setup(page)
 const previews=page.getByRole('region',{name:/^(Desktop|Mobile) Work Tile Layout$/})
 await expect(previews).toHaveCount(page.viewportSize()!.width <= 1100 ? 1 : 2)
 for(const preview of await previews.all()) {
  const mobile=(await preview.getAttribute('aria-label'))!.startsWith('Mobile')
  const frame=preview.locator('iframe').contentFrame()
  await expect(frame.locator('.expandable-metadata-tags .metadata-tag')).toHaveCount(mobile?4:7)
 }
})


test('saves All Tags category order and applies it before collapsed tile limits',async({page})=>{
 const tables=await setup(page)
 const entry=tables.library_entries.find(entry=>entry.id==='display-entry')!
 Object.assign(entry.metadata_overrides as object,{relationship_tags:['A/B'],character_tags:['Alice'],additional_tags:['Fluff','Humor'],archive_warnings:['Warning'],categories:['Gen']})
 const format=page.locator('#display-tag-format'),order=format.locator('.tag-order-list')
 await expect(order.locator('li').first()).toContainText('Additional Tags')
 await format.getByRole('button',{name:'Move Characters Up',exact:true}).click()
 await format.getByRole('button',{name:'Move Characters Up',exact:true}).click()
 await expect(order.locator('li').first()).toContainText('Characters')
 await format.locator('.display-save-bar').getByRole('button',{name:'Save',exact:true}).click()
 await expect.poll(()=>tables.metadata_preferences[0]?.tag_appearance).toMatchObject({order:['characters','tags','relationships','categories','warnings']})
 await page.goto('/reading')
 const tags=page.locator('.work-card .expandable-metadata-tags .metadata-tag')
 await expect(tags.first()).toHaveText('Alice')
 await expect(tags.nth(1)).toHaveText('Fluff')
 await expect(tags.nth(2)).toHaveText('Humor')
 await page.reload()
 await expect(tags.first()).toHaveText('Alice')
})
