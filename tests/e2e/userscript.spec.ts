import { verifyReadingActionOrder } from './reading-action-controls'
import { mergeEdits, type EditValues, type MergeResult } from '../../src/features/library/edit-merge'
import { statuses } from '../../src/features/library/model'
import { expect, test } from '@playwright/test'
import { verifyPersonalTagControls } from './personal-tag-controls'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('built userscript keeps chapter controls, editor fields, and collapsible panels in sync', async ({ page }) => {
 test.setTimeout(90000)
 const directory = await mkdtemp(join(tmpdir(), 'ao3-userscript-browser-'))
 try {
  execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-userscript.mjs', '--outDir', join(directory, 'dist')], { env: { ...process.env, VITE_SUPABASE_URL: 'https://userscript-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', EXTENSION_APP_ORIGIN: 'https://library-test.example' }, stdio: 'pipe' })
  const bundle = await readFile(join(directory, 'dist/beyond-the-archives.user.js'), 'utf8')
  // Userscripts supplies GM in the script's scope, without exposing it on globalThis.
  const script = `(function (GM) {\n${bundle}\n})(window.userscriptTestApi);`
  await page.route('https://archiveofourown.org/**', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="main"><div id="workskin"><h2 class="title">Test story</h2><h3 class="byline"><a rel="author" href="/users/Writer/pseuds/PenName">PenName</a></h3><div class="summary module"><blockquote></blockquote></div><div id="chapters"><div id="chapter-4" class="chapter"><div class="summary module"><blockquote>Chapter summary only</blockquote></div><div class="userstuff">PRIVATE CHAPTER TEXT</div><div class="notes">Private author notes</div></div></div><dl class="work meta"><dd class="chapters">10/10</dd></dl><ul class="work navigation actions"><li class="chapter"><select id="selected_id"><option value="101">1. First</option><option value="102">2. Second</option><option value="103">3. Third</option><option value="104" selected>4. Fourth</option><option value="105">5. Fifth</option><option value="106">6. Sixth</option><option value="107">7. Seventh</option><option value="108">8. Eighth</option><option value="109">9. Ninth</option><option value="110">10. Last</option></select></li></ul></div><div id="kudos">Kudos list</div></main></body></html>' }))
  await page.route('https://archiveofourown.org/works/123?view_adult=true', route => route.fulfill({ contentType: 'text/html', body: '<h2 class="title">Test story</h2><h3 class="byline"><a rel="author" href="/users/Writer/pseuds/PenName">PenName</a></h3><div class="summary module"><blockquote><p>Work <em>summary</em>.</p><p>Second<br>line.</p></blockquote></div><dl class="work meta"><dd class="chapters">6/?</dd></dl>' }))
  await page.goto('https://archiveofourown.org/works/123/chapters/104')
  await page.exposeFunction('mergeLibraryEdits', mergeEdits)
  await page.evaluate(() => {
   // Open the shadow root only in this fixture so Playwright can interact with
   // it. Production and the source-level privacy tests use a closed root.
   const attach = Element.prototype.attachShadow
   Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }) }
   const state: { entry: Record<string, unknown> | null; fail: boolean; ratingInfo: string | null; requests: Record<string, unknown>[] } = { entry: null, fail: true, ratingInfo: null, requests: [] }
   const storage = new Map<string, unknown>([['connection:https://userscript-test.supabase.co', { userId: 'alice', secret: 'fixture-device-secret' }]])
   Object.assign(window, { userscriptTestState: state, userscriptTestApi: {
    getValue: async (key: string, fallback: unknown) => storage.get(key) ?? fallback,
    setValue: async (key: string, value: unknown) => storage.set(key, value),
    deleteValue: async (key: string) => storage.delete(key),
    xmlHttpRequest: async ({ data }: { data: string }) => {
     const body = JSON.parse(data); state.requests.push(body)
     if (body.p_action === 'rating_save') state.ratingInfo = body.p_input.text
     if (state.entry && ['save', 'progress'].includes(body.p_action) && body.p_input.base) {
      const saved = Object.fromEntries(['status', 'progress', 'notes', 'rating', 'tags', 'collections'].map(key => [key, state.entry![key]])) as EditValues
      const local = Object.fromEntries((body.p_action === 'progress' ? ['status', 'progress'] : ['status', 'progress', 'notes', 'rating', 'tags', 'collections']).map(key => [key, body.p_input[key]])) as EditValues
      const merge = (window as Window & { mergeLibraryEdits(base: EditValues, local: EditValues, saved: EditValues): Promise<MergeResult> }).mergeLibraryEdits
      const review = await merge(body.p_input.base, local, saved)
      if (review.conflicts.length) return { status: 409, responseText: JSON.stringify({ code: '40001', details: JSON.stringify({ ...review, base: saved }) }) }
      Object.assign(body.p_input, review.merged)
     }
     if (body.p_action === 'save') {
      if (state.fail) { state.fail = false; return { status: 503, responseText: '{}' } }
      state.entry = { ...body.p_input, id: 'fic-entry', version: 'v1' }
     }
     if (body.p_action === 'progress') state.entry = { ...state.entry, ...body.p_input, version: 'v2' }
     return { status: 200, responseText: JSON.stringify({ entry: state.entry, ratingInfo: state.ratingInfo, collections: [{ id: 'weekend', name: 'Weekend reads' }, { id: 'night', name: 'Night reads' }] }) }
    },
   } })
  })
  expect(await page.evaluate(() => 'GM' in globalThis)).toBe(false)
  await page.addScriptTag({ content: script })
  const top = page.locator('#ao3-library-companion'), bottom = page.locator('#ao3-library-progress')
  await expect(top.getByRole('link', { name: 'View in Beyond the Archives' })).toBeVisible()
  await expect(top.locator('.library-link')).toHaveText('')
  await expect(page.locator('#ao3-library-companion small a')).toHaveAttribute('href', 'https://library-test.example/settings#ios-safari-userscript')
  await expect(page.getByText(/Beyond the Archives v/)).toBeHidden()
  await expect(bottom).toBeVisible()
  await expect(bottom.locator('.toolbar')).toHaveText((await top.locator('.toolbar').textContent())!)
  await bottom.screenshot({path:`test-results/safari-unsaved-bottom-${page.viewportSize()!.width}.png`})
  await bottom.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('Current Chapter', { exact: true })).toHaveValue('4')
  await expect(page.getByLabel('Reading Status', { exact: true })).toHaveValue('reading')
  await expect(page.getByText(/Beyond the Archives v/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload Saved Entry' })).toHaveCount(0)
  const notesFont = await page.getByLabel('Reading Status', { exact: true }).evaluate(element => getComputedStyle(element.closest('label')!).fontSize)
  for (const selector of ['h3', 'label', 'button:not(.tag-insertion-point)', 'input', 'select', 'textarea', 'small', '.personal-rating legend', '.rating-value']) {
   for (const element of await page.locator(`#ao3-library-companion :is(${selector}):not(.toolbar *)`).all()) await expect(element).toHaveCSS('font-size', notesFont)
  }
  for (const title of ['reading status', 'current chapter']) {
   const help = page.locator(`summary[aria-label="About ${title}"]`)
   const input = page.getByLabel(title === 'reading status' ? 'Reading Status' : 'Current Chapter', { exact: true })
   const controlBounds = (await input.boundingBox())!, helpBounds = (await help.boundingBox())!
   expect(helpBounds.x).toBeGreaterThanOrEqual(controlBounds.x + controlBounds.width)
   expect(Math.abs(helpBounds.y + helpBounds.height / 2 - controlBounds.y - controlBounds.height / 2)).toBeLessThan(1)
   expect(helpBounds.width).toBeGreaterThanOrEqual(44)
   await expect(help.locator('svg')).toHaveCSS('width', '32px')
  }
  await expect(page.locator('.rating-star svg').first()).toHaveCSS('width', '34px')
  await expect(page.locator('.personal-tag-help > span')).toBeHidden()

  await page.locator('summary[aria-label="About reading status"]').click()
  await expect(page.getByText('To Read marks no chapters as read.', { exact: false })).toBeVisible()
  await expect(page.locator('.field-info[open] > span')).toHaveCSS('font-size', notesFont)
  await page.locator('summary[aria-label="About reading status"]').click()
  await page.locator('summary[aria-label="About current chapter"]').click()
  await expect(page.getByText('Current Chapter − 1 counts as completed; check finished to include this chapter.', { exact: true })).toBeVisible()
  await page.locator('summary[aria-label="About current chapter"]').click()
  for (const status of ['to_read', 'finished']) {
   await page.getByLabel('Reading Status', { exact: true }).selectOption(status)
   await expect(page.getByLabel('Current Chapter', { exact: true })).toBeHidden()
   await expect(page.getByLabel('This Chapter Is Finished', { exact: true })).toBeHidden()
  }
  for (const status of ['re_reading', 'reading']) {
   await page.getByLabel('Reading Status', { exact: true }).selectOption(status)
   await expect(page.getByLabel('Current Chapter', { exact: true })).toBeVisible()
   await expect(page.getByLabel('This Chapter Is Finished', { exact: true })).toBeVisible()
  }
  for (const field of ['Private Notes']) {
   const input = page.getByLabel(field, { exact: true })
   await input.fill(Array.from({ length: 16 }, (_, index) => `Line ${index + 1}`).join('\n'))
   const expanded = (await input.boundingBox())!.height
   const notesBounds = (await input.boundingBox())!, toggleBounds = (await page.getByRole('button', { name: `Collapse ${field}`, exact: true }).boundingBox())!
   expect(toggleBounds.x).toBeGreaterThanOrEqual(notesBounds.x + notesBounds.width)
   expect(Math.abs(toggleBounds.y - notesBounds.y)).toBeLessThan(1)

   expect(await input.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
   await page.getByRole('button', { name: `Collapse ${field}`, exact: true }).click()
   expect((await input.boundingBox())!.height).toBeLessThan(expanded)
   await page.getByRole('button', { name: `Expand ${field}`, exact: true }).click()
   expect((await input.boundingBox())!.height).toBeGreaterThan(expanded - 2)
   await input.fill('')
  }
  const stableTagInput = await page.getByRole('textbox', { name: 'Personal Tags', exact: true }).elementHandle()
  for (const tag of ['Comfort', 'A much longer personal tag', 'comfort']) {
   await page.getByRole('textbox', { name: 'Personal Tags', exact: true }).fill(tag)
   await page.keyboard.press('Enter')
   expect(await page.getByRole('textbox', { name: 'Personal Tags', exact: true }).evaluate((element, previous) => element === previous, stableTagInput)).toBe(true)
  }
  await expect(page.getByRole('button', { name: /^Delete Personal Tag/ })).toHaveCount(2)
  await page.getByRole('button', { name: 'Personal Tags Help', exact: true }).click()
  const tagHelpText = page.locator('.personal-tag-help > span')
  await expect(tagHelpText).toBeVisible()
  if ((page.viewportSize()?.width ?? 1280) <= 650) {
   await expect(tagHelpText).toContainText('Hold the grip')
   await expect(tagHelpText).not.toContainText('Backspace')
  } else await expect(tagHelpText).toContainText('Press Enter')
  const tagBox = (await page.locator('.tag-input').boundingBox())!, helpBox = (await page.getByRole('button', { name: 'Personal Tags Help', exact: true }).boundingBox())!
  expect(helpBox.x).toBeGreaterThanOrEqual(tagBox.x + tagBox.width)
  await page.getByRole('button', { name: 'Personal Tags Help', exact: true }).click()
  await verifyPersonalTagControls(page)
  for (const tag of ['Comfort', 'A much longer personal tag']) {
   const chip = page.getByRole('button', { name: `Delete Personal Tag ${tag}`, exact: true })
   await page.mouse.move(0, 0)
   const before = await chip.boundingBox()
   const mobile = (page.viewportSize()?.width ?? 1280) <= 650
   if (mobile) await chip.tap()
   else await chip.hover()
   expect(await chip.boundingBox()).toEqual(before)
   if (mobile) {
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(chip.locator('.tag-label')).toHaveCSS('mask-image', 'none')
    await expect(chip.locator('.tag-remove-cap')).toHaveCSS('opacity', '0')
    await expect(chip.locator('.tag-remove-cap')).toBeHidden()
    await expect(chip).toHaveCSS('background-color', 'rgb(255, 196, 202)')
   }
   await expect(chip).toHaveCSS('color', 'rgb(17, 17, 17)')
   await expect(chip.locator('.tag-remove-cap')).toHaveCSS('background-color', 'rgb(255, 196, 202)')
  }
  if ((page.viewportSize()?.width ?? 1280) <= 650) {
   await page.getByRole('textbox', { name: 'Personal Tags', exact: true }).fill('Remove me')
   await page.keyboard.press('Enter')
   const removable = page.getByRole('button', { name: 'Delete Personal Tag Remove me', exact: true })
   await removable.tap()
   await expect(removable).toHaveClass(/tag-selected/)
   await expect(removable.locator('.tag-label')).toHaveCSS('mask-image', 'none')
   await expect(removable.locator('.tag-remove-cap')).toHaveCSS('opacity', '0')
   await removable.tap()
   await expect(removable).toHaveCount(0)
  }
  await page.getByRole('radio', { name: '4 Out of 5 Stars' }).check()
  await expect(page.getByRole('button', { name: 'Clear Rating', exact: true })).toHaveCSS('font-size', notesFont)
  for (const chip of await page.getByRole('button', { name: /^Delete Personal Tag/ }).all()) await expect(chip).toHaveCSS('font-size', notesFont)
  await page.getByRole('button', { name: 'Clear Rating', exact: true }).click()
  await expect(page.getByText('Unrated', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '3 Out of 5 Stars' }).check()
  await expect(page.getByLabel('Weekend reads')).toBeHidden()
  await page.getByRole('button', { name: /^(Add to Collection|Edit Collections)$/ }).click()
  await page.getByLabel('Weekend reads').check()
  await page.getByLabel('Search Custom Collections').fill('NIGHT')
  await expect(page.getByLabel('Weekend reads')).toBeHidden()
  await expect(page.getByLabel('Night reads')).toBeVisible()
  await page.getByLabel('Night reads').check()
  await page.getByLabel('Search Custom Collections').fill('missing')
  await expect(page.getByText('No matching collections.')).toBeVisible()
  await page.getByLabel('Search Custom Collections').fill('')
  await expect(page.getByLabel('Weekend reads')).toBeChecked()
  await expect(page.getByText('Custom Collections', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Search Custom Collections', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Search Custom Collections')).toHaveAttribute('placeholder', 'Search Custom Collections')
  await page.getByRole('button', { name: /^(Add to Collection|Edit Collections)$/ }).click()
  await page.screenshot({ path: `test-results/userscript-editor-${page.viewportSize()!.width}.png`, fullPage: true })
  await page.getByLabel('Private Notes', { exact: true }).fill('Keep these notes after a network failure')
  await top.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toBeHidden()
  await expect(top.getByRole('button', { name: 'Add to Library', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await top.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Keep these notes after a network failure')
  await top.getByRole('button', { name: 'Connection', exact: true }).click()
  await page.getByLabel('One-Time Pairing Code').fill('partially-filled-pairing-code')
  await top.getByRole('button', { name: 'Connection', exact: true }).click()
  await expect(page.getByLabel('One-Time Pairing Code')).toBeHidden()
  await top.getByRole('button', { name: 'Connection', exact: true }).click()
  await expect(page.getByLabel('One-Time Pairing Code')).toHaveValue('partially-filled-pairing-code')
  await top.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('One-Time Pairing Code')).toBeHidden()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Keep these notes after a network failure')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Could not save')
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Keep these notes after a network failure')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  const saved = await page.evaluate(() => (window as Window & { userscriptTestState: { entry: Record<string, unknown> } }).userscriptTestState.entry)
  expect(saved).toMatchObject({ status: 'reading', progress: 3, metadata: { authors: ['PenName'], author_links: { PenName: 'https://archiveofourown.org/users/Writer/pseuds/PenName' }, summary: 'Work summary.\n\nSecond\nline.', summary_html: '<p>Work <em>summary</em>.</p><p>Second<br>line.</p>', published_chapters: 10, total_chapters: 10 } })
  expect(JSON.stringify(saved)).not.toMatch(/Chapter summary only|PRIVATE CHAPTER TEXT/)
  for (const status of ['to_read', 'waiting_for_updates', 'reading'] as const) {
   await top.getByRole('button', { name: 'Edit', exact: true }).click()
   await top.getByLabel('Reading Status', { exact: true }).selectOption(status)
   if (status !== 'to_read') await top.getByLabel('Current Chapter', { exact: true }).fill('4')
   await top.getByRole('button', { name: 'Save', exact: true }).click()
   await expect(top.getByRole('status')).toHaveText('Saved')
   for (const surface of [top, bottom]) {
    await expect(surface.locator('.reading-summary strong')).toHaveText(status === 'waiting_for_updates' ? 'Waiting' : statuses[status])
    if (status === 'to_read') {
     await expect(surface.getByRole('button', { name: 'Mark Read', exact: true })).toBeVisible()
     await expect(surface.getByRole('button', { name: 'Start Reading', exact: true })).toHaveCount(0)
    }
   }
  }

  expect(await page.locator('#kudos').evaluate(element => element.previousElementSibling?.id)).toBe('ao3-library-progress')
  await expect(top.getByRole('link', { name: 'View in Beyond the Archives' })).toHaveAttribute('href', 'https://library-test.example/stories/fic-entry')
  await expect(top.locator('.library-link')).toHaveText('')
  await expect(top.locator('.reading-actions').getByRole('button', { name: 'Read', exact: true })).toBeVisible()
  for (const surface of [top, bottom]) {
   await expect(surface.locator('button.chapter-progress')).toHaveText('Ch. 3 / 10')
   await verifyReadingActionOrder(surface)
   await expect(surface.locator('.chapter-progress')).not.toHaveAttribute('title')
   await expect(surface.getByLabel('About chapters read', { exact: true })).toHaveCount(0)
   for (const element of await surface.locator('.toolbar *, .bottom-bar *').all()) await expect(element).toHaveCSS('font-size', '20px')
  }
  for (const [surface, value] of [[bottom, '2'], [top, '3']] as const) {
   await surface.getByRole('button', { name: 'Edit Chapters Read' }).click()
   const popup = top.getByRole('dialog', { name: 'Edit Chapter Progress' })
   const input = popup.getByRole('spinbutton', { name: 'Chapters Read' })
   await expect(input).toBeFocused()
   const bounds = (await popup.boundingBox())!
   expect(bounds.width).toBeLessThanOrEqual(320)
   expect(bounds.x).toBeGreaterThanOrEqual(0)
   expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width)
   await input.fill(value)
   await popup.getByRole('button', { name: 'Save Progress' }).click()
   await expect(popup).toBeHidden()
   for (const bar of [top, bottom]) await expect(bar.locator('.chapter-progress')).toHaveText(`Ch. ${value} / 10`)
   await expect(surface.getByRole('button', { name: 'Edit Chapters Read' })).toBeFocused()
  }
  await bottom.getByRole('button', { name: 'Edit Chapters Read' }).click()
  await page.keyboard.press('Escape')
  await expect(top.getByRole('dialog', { name: 'Edit Chapter Progress' })).toBeHidden()
  await expect(top.locator('.complete-chapter svg')).toHaveCSS('width', '26px')
  await expect(top.locator('.edit-button svg')).toHaveCSS('width', '26px')
  await expect(top.locator('.toolbar-progress').getByRole('button', { name: 'Edit Chapters Read' })).toHaveCount(1)
  await expect(top.locator('.status-bullet')).toHaveText('•')
  await expect(top.locator('.status-bullet')).toHaveCSS('color', 'rgb(38, 115, 68)')
  for (const [status, color] of [
   ['reading', 'rgb(38, 115, 68)'], ['paused_reading', 'rgb(165, 107, 18)'],
   ['finished', 'rgb(151, 0, 0)'], ['to_read', 'rgb(50, 103, 168)'],
   ['re_reading', 'rgb(178, 148, 214)'],
  ]) {
   await top.locator('.status-bullet').evaluate((element, status) => { (element as HTMLElement).dataset.status = status }, status)
   await expect(top.locator('.status-bullet')).toHaveCSS('color', color)
  }
  await top.locator('.status-bullet').evaluate(element => { (element as HTMLElement).dataset.status = 'reading' })
  await top.locator('.toolbar').evaluate(element => { element.scrollLeft = 0 })
  const barBounds = (await top.locator('.toolbar').boundingBox())!, linkBounds = (await top.locator('.library-link').boundingBox())!, actionsBoundsTop = (await top.locator('.toolbar-actions').boundingBox())!, centerBounds = (await top.locator('.toolbar-progress').boundingBox())!
  expect(Math.abs(linkBounds.x - barBounds.x)).toBeLessThan(1)
  const mobile = page.viewportSize()!.width <= 650
  const rowCenter = linkBounds.y + linkBounds.height / 2
  if (mobile) {
   expect(actionsBoundsTop.y).toBeGreaterThanOrEqual(centerBounds.y + centerBounds.height)
   const original = page.viewportSize()!
   for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ ...original, width })
    for (const surface of [top, bottom]) {
     expect(await surface.locator('.toolbar, .bottom-bar').first().evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    }
    const bounds = (await top.locator('.complete-chapter').boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
   }
   await page.setViewportSize(original)
  } else {
   const rightEdge = await top.locator('.toolbar').evaluate(element => element.getBoundingClientRect().x + element.scrollWidth)
   expect(Math.abs(actionsBoundsTop.x + actionsBoundsTop.width - rightEdge)).toBeLessThan(1)
   expect(Math.abs(centerBounds.x + centerBounds.width / 2 - (linkBounds.x + linkBounds.width + actionsBoundsTop.x) / 2)).toBeLessThan(1)
   expect(Math.abs(centerBounds.y + centerBounds.height / 2 - rowCenter)).toBeLessThan(1)
   expect(Math.abs(actionsBoundsTop.y + actionsBoundsTop.height / 2 - rowCenter)).toBeLessThan(1)
  }
  await expect(top.locator('.complete-chapter')).toHaveText('Read')
  await expect(top.locator('.toolbar')).toHaveCSS('column-gap', '12px')
  await expect(top.locator('.toolbar-actions')).toHaveCSS('gap', '12px')
  const actionButtons = await top.locator('.toolbar-actions > button').all()
  for (const button of actionButtons) {
   const bounds = (await button.boundingBox())!
   if (!mobile) expect(Math.abs(bounds.y + bounds.height / 2 - rowCenter)).toBeLessThan(1)
   await expect(button).toHaveCSS('margin-left', '0px')
  }
  const bottomBounds = (await bottom.locator('.bottom-bar').boundingBox())!, summaryBounds = (await bottom.locator('.reading-summary').boundingBox())!
  expect(Math.abs(summaryBounds.x + summaryBounds.width / 2 - bottomBounds.x - bottomBounds.width / 2)).toBeLessThan(1)
  await verifyReadingActionOrder(bottom)

  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 3 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByText('Reading', { exact: true })).toBeVisible()
   const pause = surface.getByRole('button', { name: 'Pause Reading', exact: true })
   await expect(pause).toBeVisible()
   await expect(pause).toHaveText('Pause')
   const pauseHeight = (await pause.boundingBox())!.height
   for (const control of await surface.locator('.toolbar button, .bottom-bar button').all()) expect(Math.abs((await control.boundingBox())!.height - pauseHeight)).toBeLessThan(1)
   await expect(pause.locator('svg')).toBeVisible()
   await expect(surface.getByRole('button', { name: 'Read', exact: true })).toBeVisible()
  }
  await top.getByRole('button', { name: 'Pause Reading', exact: true }).click()
  const resume = top.getByRole('button', { name: 'Resume Reading', exact: true })
  await expect(resume).toHaveText('Resume')
  await expect(resume).toBeEnabled()
  await expect(top.getByRole('button', { name: 'Read', exact: true })).toHaveCount(0)
  await expect(bottom.getByRole('button', { name: 'Resume Reading', exact: true })).toHaveCount(0)
  await expect(bottom.getByRole('button', { name: 'Mark Read', exact: true })).toBeVisible()
  expect(Math.abs((await resume.boundingBox())!.height - (await top.getByRole('button', { name: 'Edit', exact: true }).boundingBox())!.height)).toBeLessThan(1)
  await resume.click()
  for (const surface of [top, bottom]) await expect(surface.locator('.chapter-progress')).toHaveText('Ch. 3 / 10')
  await top.screenshot({ path: `test-results/userscript-top-toolbar-${page.viewportSize()!.width}.png` })
  await bottom.screenshot({ path: `test-results/userscript-bottom-toolbar-${page.viewportSize()!.width}.png` })
  await expect(bottom.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  await expect(bottom.getByRole('button', { name: 'Connection', exact: true })).toHaveCount(0)
  await bottom.getByRole('button', { name: 'Read', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as {userscriptTestState:{requests:{p_input:{chapter_read?:unknown}}[]}}).userscriptTestState.requests.at(-1)!.p_input.chapter_read)).toEqual({chapter:4,chapter_id:'104',word_count:3})
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 4 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByText('Read', { exact: true })).toBeVisible()
   await expect(surface.locator('.completion-indicator')).toHaveCSS('gap', '4px')
   await expect(surface.getByRole('button', { name: /^Read$/ })).toHaveCount(0)
  }
  expect(page.url()).toBe('https://archiveofourown.org/works/123/chapters/104')
  await expect(page.getByText(/Beyond the Archives v/)).toBeHidden()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const metadataHelp = page.getByLabel('About collect metadata', { exact: true })
  const metadataText = page.getByText('Recollect metadata from this AO3 page. Reload AO3 first for the latest changes.', { exact: true })
  await expect(metadataText).toBeHidden()
  await metadataHelp.click()
  await expect(metadataText).toBeVisible()
  await expect(metadataText).toHaveCSS('font-size', notesFont)
  await metadataHelp.click()
  const reloadEntry = page.getByRole('button', { name: 'Reload Saved Entry' })
  await expect(reloadEntry).toBeVisible()
  const reloadHelp = page.getByLabel('About reload saved entry', { exact: true })
  const reloadButtonBounds = (await reloadEntry.boundingBox())!, reloadHelpBounds = (await reloadHelp.boundingBox())!
  expect(reloadHelpBounds.x).toBeGreaterThanOrEqual(reloadButtonBounds.x + reloadButtonBounds.width)
  await reloadHelp.click()
  await expect(page.getByText('Loads this fic’s latest saved information from your hosted library', { exact: false })).toBeVisible()
  await reloadHelp.click()
  const actionsBounds = await page.locator('.editor-actions').boundingBox()
  const reloadBounds = await page.locator('.reload-entry').boundingBox()
  expect(Math.abs(actionsBounds!.x + actionsBounds!.width - reloadBounds!.x - reloadBounds!.width)).toBeLessThan(1)
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Keep these notes after a network failure')
  await page.getByLabel('Private Notes', { exact: true }).fill('Unsaved notes stay while changing chapters')
  await top.getByRole('button', { name: 'Connection', exact: true }).click()
  const pairing = page.locator('#library-connection')
  await expect(pairing.getByRole('button')).toHaveCount(5)
  await expect(pairing.locator('.library-settings-link')).toHaveCSS('padding-top', '28px')
  await expect(pairing.getByRole('button', { name: /chapter|Finish Fic|Reread/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Unsaved notes stay while changing chapters')
  await page.getByLabel('Reading Status', { exact: true }).selectOption('re_reading')
  await page.getByLabel('Current Chapter', { exact: true }).fill('1')
  await page.getByLabel('This Chapter Is Finished', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  for (const surface of [top, bottom]) await expect(surface.getByText('Ch. 0 / 10', { exact: true })).toBeVisible()
  await bottom.getByRole('button', { name: 'Read', exact: true }).click()
  for (const surface of [top, bottom]) await expect(surface.getByText('Ch. 4 / 10', { exact: true })).toBeVisible()
  await page.evaluate(() => {
   document.getElementById('ao3-library-companion')!.remove()
   history.replaceState(null, '', '/works/123/chapters/110')
  })
  await page.addScriptTag({ content: script })
  await expect(bottom.getByRole('button', { name: 'Finish Fic', exact: true })).toBeVisible()
  await bottom.getByRole('button', { name: 'Finish Fic', exact: true }).click()
  await expect(top.getByText('Finished', { exact: true })).toBeVisible()
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 10 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByRole('button', { name: 'Re-Read', exact: true })).toBeVisible()
  }
  await page.evaluate(() => {
   document.getElementById('ao3-library-companion')!.remove()
   history.replaceState(null, '', '/works/123/chapters/104')
  })
  await page.addScriptTag({ content: script })
  for (const surface of [top, bottom]) {
   await expect(surface.getByRole('button', { name: 'Re-Read', exact: true })).toBeVisible()
   await expect(surface.getByRole('button', { name: /^(Read|Finish Fic)$/ })).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Private Notes', { exact: true }).fill('Keep this unsaved draft during recollection')
  await page.evaluate(() => { document.querySelector('dd.chapters')!.textContent = '12/12' })
  await page.getByRole('button', { name: 'Collect Metadata', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Metadata recollected. Your reading progress and draft are unchanged.')
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Keep this unsaved draft during recollection')
  await expect(page.getByLabel('Current Chapter', { exact: true })).toHaveAttribute('max', '12')
  for (const surface of [top, bottom]) await expect(surface.getByText('Ch. 10 / 12', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const changeSavedNotes = (notes: string) => page.evaluate(value => {
   const state = (window as Window & { userscriptTestState: { entry: Record<string, unknown> } }).userscriptTestState
   state.entry.notes = value; state.entry.version = String(state.entry.version) + '-changed'
  }, notes)
  await changeSavedNotes('New desktop notes while mobile is editing')
  await page.getByRole('button', { name: 'Reload Saved Entry', exact: true }).click()
  const review = page.getByRole('region', { name: 'Review Conflicting Edits' })
  await expect(review.getByText('Keep this unsaved draft during recollection', { exact: true })).toBeVisible()
  await expect(review.getByText('New desktop notes while mobile is editing', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await review.screenshot({ path: `test-results/userscript-conflict-${page.viewportSize()!.width}.png` })
  await review.getByLabel('Edit or Combine Notes', { exact: true }).check()
  await review.getByLabel('Notes to Save', { exact: true }).fill('Both desktop and mobile notes')
  await changeSavedNotes('Desktop changed again during review')
  await review.getByRole('button', { name: 'Save Resolved Changes' }).click()
  await expect(review.getByText('Desktop changed again during review', { exact: true })).toBeVisible()
  await review.getByLabel('Keep My Draft', { exact: true }).check()
  await review.getByRole('button', { name: 'Save Resolved Changes' }).click()
  await expect(review).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Both desktop and mobile notes')
  await page.getByRole('radio', { name: '5 Out of 5 Stars', exact: true }).check()
  await changeSavedNotes('Desktop notes for an untouched notes field')
  await page.getByRole('button', { name: 'Reload Saved Entry', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Desktop notes for an untouched notes field')
  await expect(page.getByRole('radio', { name: '5 Out of 5 Stars', exact: true })).toBeChecked()
  await expect(review).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await top.getByRole('button', { name: 'Connection', exact: true }).click()
  const mode = page.getByRole('button', { name: 'Dark Mode', exact: true })
  const ratingSettings = page.getByRole('button', { name: 'Rating Info', exact: true })
  const modeBox = (await mode.boundingBox())!, ratingSettingsBox = (await ratingSettings.boundingBox())!
  expect(ratingSettingsBox.x).toBeGreaterThanOrEqual(modeBox.x + modeBox.width)
  expect(ratingSettingsBox.y).toBe(modeBox.y)
  await expect(page.locator('.connection-settings')).toHaveCSS('padding-top', '14px')
  await ratingSettings.click()
  const ratingText = page.getByRole('textbox', { name: 'Rating Info Text', exact: true })
  await expect(ratingText).toHaveValue('Add how your personal rating system corresponds to the stars here! Edit this text in settings. To hide the info symbol, leave the box blank.')
  const customRatingInfo = '1 star: Not for me\n5 stars: A favorite <3'
  await ratingText.fill(customRatingInfo)
  await page.getByRole('button', { name: 'Save Rating Info', exact: true }).click()
  await expect(top.getByRole('status')).toHaveText('Rating info saved to your library account.')
  await expect(mode.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await mode.click()
  for (const surface of [top, bottom]) {
   await expect(surface).toHaveAttribute('data-theme', 'dark')
   await expect(surface.locator('section').first()).toHaveCSS('background-color', 'rgb(51, 51, 51)')
   await expect(surface.locator('section').first()).toHaveCSS('color', 'rgb(242, 242, 242)')
  }
  await expect(page.getByRole('button', { name: 'Light Mode', exact: true })).toHaveCSS('background-color', 'rgb(51, 51, 51)')
  await expect(page.getByLabel('One-Time Pairing Code')).toHaveCSS('background-color', 'rgb(51, 51, 51)')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveCSS('background-color', 'rgb(51, 51, 51)')
  await expect(page.locator('.rating-star').first()).toHaveCSS('color', 'rgb(255, 180, 171)')
  const ratingHelp = page.getByRole('button', { name: 'Personal Rating Info', exact: true })
  const clearBox = (await page.getByRole('button', { name: 'Clear Rating', exact: true }).boundingBox())!, infoBox = (await ratingHelp.boundingBox())!
  expect(infoBox.x).toBeGreaterThanOrEqual(clearBox.x + clearBox.width)
  expect(infoBox.y + infoBox.height / 2).toBeCloseTo(clearBox.y + clearBox.height / 2, 0)
  await ratingHelp.click()
  const ratingExplanation = page.locator('.rating-info > span')
  await expect(ratingExplanation).toBeVisible()
  await expect(ratingExplanation).toHaveText(customRatingInfo)
  await expect(ratingExplanation).toHaveCSS('white-space', 'pre-wrap')
  await expect(ratingExplanation).toHaveCSS('background-color', 'rgb(51, 51, 51)')
  const explanationBox = (await ratingExplanation.boundingBox())!
  const ratingControlsBox = (await page.locator('.rating-controls').boundingBox())!
  expect(explanationBox.width).toBeCloseTo(Math.min(420, ratingControlsBox.width), 0)
  expect(explanationBox.x).toBeGreaterThanOrEqual(0)
  expect(explanationBox.x + explanationBox.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await ratingHelp.click()
  expect(await page.getByRole('textbox', { name: 'Personal Tags', exact: true }).evaluate(element => getComputedStyle(element, '::placeholder').color)).toBe('rgb(208, 197, 197)')
  for (const chip of await page.locator('.removable-tag').all()) {
   await expect(chip).toHaveCSS('color', 'rgb(242, 242, 242)')
  }
  await reloadHelp.click()
  const reloadText = page.locator('.reload-entry .field-info > span')
  await expect(reloadText).toBeVisible()
  await expect(reloadText).toContainText('Newer saved notes and other fields update only fields you have not edited here.')
  await expect(reloadText).toContainText('Reloading does not save your draft or refresh AO3 metadata.')
  await expect(reloadText).toHaveCSS('background-color', 'rgb(51, 51, 51)')
  await reloadHelp.click()
  await top.screenshot({ path: `test-results/userscript-dark-editor-${page.viewportSize()!.width}.png` })
  await page.evaluate(() => document.getElementById('ao3-library-companion')!.remove())
  await page.addScriptTag({ content: script })
  await expect(top).toHaveAttribute('data-theme', 'dark')
  await expect(bottom).toHaveAttribute('data-theme', 'dark')
  await top.getByRole('button', { name: 'Connection', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Light Mode', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Rating Info', exact: true }).click()
  await expect(ratingText).toHaveValue(customRatingInfo)
  await ratingText.fill('')
  await page.getByRole('button', { name: 'Save Rating Info', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Personal Rating Info', exact: true })).toHaveCount(0)
  await top.getByRole('button', { name: 'Connection', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.getByRole('button', { name: 'Light Mode', exact: true }).click()
  for (const surface of [top, bottom]) {
   await expect(surface).toHaveAttribute('data-theme', 'light')
   await expect(surface.locator('section').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  }
  // Entire Work reuses the progress bar after each chapter, including its notes.
  const fullUrl = 'https://archiveofourown.org/works/123?view_full_work=true'
  await page.route(fullUrl, route => route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="main"><div id="workskin"><h2 class="title">Entire Work</h2><dl class="work meta"><dd class="chapters">3/?</dd></dl><div id="chapters">${[1, 2, 3].map(number => `<div class="chapter" id="chapter-${number}"><h3 class="title"><a href="/works/123/chapters/${100 + number}">Chapter ${number}</a></h3><div class="userstuff">${'Word '.repeat(number)}</div><div class="notes">Private author notes</div></div>`).join('')}</div></div><div id="kudos">Kudos</div></main></body></html>` }))
  await page.goto(fullUrl)
  await page.evaluate(() => {
   const attach = Element.prototype.attachShadow
   Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }) }
   let entry = { version: 'v1', status: 'reading', progress: 0, notes: '', rating: null, tags: [], collections: [] }
   const requests: Record<string, unknown>[] = []
   Object.assign(window, { fullWorkRequests: requests, userscriptTestApi: {
    getValue: async (key: string, fallback: unknown) => key.startsWith('connection:') ? { userId: 'alice', secret: 'fixture-device-secret' } : fallback,
    xmlHttpRequest: async ({ data }: { data: string }) => {
     const request = JSON.parse(data); requests.push(request)
     if (request.p_action === 'progress') entry = { ...entry, ...request.p_input }
     return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
    },
   } })
  })
  await page.addScriptTag({ content: script })
  const fullBars = page.locator('[id^="ao3-library-progress"]')
  await expect(fullBars).toHaveCount(3)
  for (let index = 0; index < 3; index++) expect(await fullBars.nth(index).evaluate(element => element.previousElementSibling?.id)).toBe(`chapter-${index + 1}`)
  await fullBars.nth(1).getByRole('button', { name: 'Read', exact: true }).click()
  await expect(fullBars.nth(1).getByText('Read', { exact: true })).toBeVisible()
  for (const surface of await fullBars.all()) {
   await expect(surface.locator('.chapter-progress')).toHaveText('Ch. 2 / 3')
   expect(await surface.locator('.bottom-bar').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  }
  expect(await page.evaluate(() => (window as unknown as { fullWorkRequests: { p_input: unknown }[] }).fullWorkRequests.at(-1)!.p_input)).toMatchObject({ chapter_read: { chapter: 2, chapter_id: '102', word_count: 2 } })
  await fullBars.nth(1).screenshot({ path: `test-results/full-work-chapter-bar-${page.viewportSize()!.width}.png` })
  await fullBars.nth(2).getByRole('button', { name: 'Read', exact: true }).click()
  for (const surface of [top, ...await fullBars.all()]) {
   await expect(surface.locator('.reading-summary strong')).toHaveText('Waiting')
   await expect(surface.locator('.reading-actions > button')).toHaveCount(2)
   await expect(surface.getByRole('button', { name: 'Re-Read', exact: true })).toBeVisible()
   await expect(surface.getByRole('button', { name: 'Pause Reading', exact: true })).toHaveCount(0)
  }
  expect(await page.evaluate(() => (window as unknown as { fullWorkRequests: { p_input: unknown }[] }).fullWorkRequests.at(-1)!.p_input)).toMatchObject({ status: 'waiting_for_updates', progress: 3, chapter_read: { chapter: 3, chapter_id: '103', word_count: 3 } })
  // Safari's installable userscript also mounts every series work before pairing.
  const seriesUrl = 'https://archiveofourown.org/series/77'
  const seriesHtml = (await readFile('server/ao3/fixtures/series.html', 'utf8')).replace('rel="author">One', 'rel="author" href="/users/One/pseuds/One">One').replace('<dl class="stats"><dd', '<dl class="stats"><dd class="kudos">42</dd><dd')
  await page.route(seriesUrl, route => route.fulfill({ contentType: 'text/html', body: seriesHtml }))
  await page.goto(seriesUrl)
  await page.evaluate(() => {
   const attach = Element.prototype.attachShadow
   Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }) }
   Object.assign(window, { userscriptTestApi: { getValue: async (_key: string, fallback: unknown) => fallback } })
  })
  await page.addScriptTag({ content: script })
  await expect(page.locator('#ao3-library-companion').getByRole('button', { name: 'Connect Library', exact: true })).toBeVisible()
  expect(await page.locator('#series-stats').evaluate(element => element.nextElementSibling?.id)).toBe('ao3-library-companion')
  expect(await page.locator('.series.work.index').evaluate(element => element.previousElementSibling?.id)).toBe('ao3-library-companion')
  await expect(page.locator('#ao3-library-progress')).toHaveCount(0)
  for (const work of [101, 102]) {
   const tile = page.locator(`#ao3-library-work-${work}`)
   await expect(tile.getByRole('button', { name: 'Connect Library', exact: true })).toBeVisible()
   expect(await tile.evaluate(element => element.parentElement?.lastElementChild === element && element.previousElementSibling?.matches('dl.stats'))).toBe(true)
   await expect(tile.locator('..').locator('[id^="ao3-library-"]')).toHaveCount(1)
  }
  for (const path of ['/tags/Naruto/works', '/users/Reader/pseuds/Reader']) {
   const url = `https://archiveofourown.org${path}`
   await page.route(url, route => route.fulfill({ contentType: 'text/html', body: seriesHtml }))
   await page.goto(url)
   await page.evaluate(() => {
    const attach = Element.prototype.attachShadow
    Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }) }
    const entries = new Map<number, unknown>()
    Object.assign(window, { userscriptTestApi: {
     getValue: async (key: string, fallback: unknown) => key.startsWith('connection:') ? { userId: 'alice', secret: 'fixture-device-secret' } : fallback,
     xmlHttpRequest: async ({ data }: { data: string }) => {
      const request = JSON.parse(data)
      if (request.p_action === 'save') { Object.assign(window, { savedListingMetadata: request.p_input.metadata }); entries.set(request.p_work, { ...request.p_input, id: 'listing-entry', version: 'v1' }) }
      return { status: 200, responseText: JSON.stringify({ entry: entries.get(request.p_work) ?? null, collections: [] }) }
     },
    } })
   })
   await page.addScriptTag({ content: script })
   await expect(page.locator('[data-work-tile]')).toHaveCount(2)
   const tile = page.locator('#ao3-library-work-101')
   await expect(tile.getByRole('button', { name: 'Add to Library', exact: true })).toBeVisible()
   await tile.getByRole('button', { name: 'To Read', exact: true }).click()
   await expect(tile.getByRole('status')).toHaveText('Saved')
   expect(await page.evaluate(() => (window as Window & { savedListingMetadata: unknown }).savedListingMetadata)).toMatchObject({ authors: ['One'], author_links: { One: 'https://archiveofourown.org/users/One/pseuds/One' } })
   await expect(tile.getByText('Ch. 0 / 2', { exact: true })).toBeVisible()
   await expect(tile.getByRole('button', { name: 'To Read', exact: true })).toHaveCount(0)
  }
 } finally { await rm(directory, { recursive: true, force: true }) }
})

test('built userscript saves unsaved works through first-chapter and completion actions', async ({ page }) => {
 const directory = await mkdtemp(join(tmpdir(), 'ao3-unsaved-reading-'))
 try {
  execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-userscript.mjs', '--outDir', join(directory, 'dist')], { env: { ...process.env, VITE_SUPABASE_URL: 'https://userscript-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', EXTENSION_APP_ORIGIN: 'https://library-test.example' }, stdio: 'pipe' })
  const bundle = await readFile(join(directory, 'dist/beyond-the-archives.user.js'), 'utf8')
  await page.route('https://archiveofourown.org/**', route => {
   const current = Number(new URL(route.request().url()).pathname.split('/').at(-1)) - 100
   return route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="main"><div id="workskin"><h2 class="title">Unsaved story</h2><div class="summary module"><blockquote>Summary</blockquote></div><dl class="work meta"><dd class="chapters">3/3</dd></dl><select id="selected_id">${[1, 2, 3].map(chapter => `<option value="${100 + chapter}">${chapter}. Chapter</option>`).join('')}</select><div id="chapters"><div id="chapter-${current}" class="chapter"><div class="userstuff"><p>Only three words.</p></div></div></div></div><div id="kudos">Kudos</div></main></body></html>` })
  })
  for (const action of [
   { chapter: 1, bottom: false, label: 'Reading', status: 'reading', progress: 0 },
   { chapter: 1, bottom: true, label: 'Mark Read', status: 'reading', progress: 1 },
   { chapter: 2, bottom: false, label: 'Mark Read', status: 'reading', progress: 2 },
   { chapter: 3, bottom: true, label: 'Finish Fic', status: 'finished', progress: 3 },
  ]) {
   await page.goto(`https://archiveofourown.org/works/123/chapters/${100 + action.chapter}`)
   await page.evaluate(() => {
    const attach = Element.prototype.attachShadow
    Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }) }
    let entry: Record<string, unknown> | null = null
    Object.assign(window, { unsavedReadingRequests: [], userscriptTestApi: {
     getValue: async (_key: string, fallback: unknown) => _key.startsWith('connection:') ? { userId: 'alice', secret: 'fixture-secret' } : fallback,
     setValue: async () => {}, deleteValue: async () => {},
     xmlHttpRequest: async ({ data }: { data: string }) => {
      const request = JSON.parse(data)
      ;(window as Window & { unsavedReadingRequests: object[] }).unsavedReadingRequests.push(request)
      if (request.p_action === 'save') entry = { ...request.p_input, id: 'quick-saved', version: 'v1' }
      return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
     },
    } })
   })
   await page.addScriptTag({ content: `(function (GM) {\n${bundle}\n})(window.userscriptTestApi);` })
   const top = page.locator('#ao3-library-companion'), bottom = page.locator('#ao3-library-progress')
   await expect(top.getByRole('button', { name: 'Add to Library', exact: true })).toBeVisible()
   await expect(bottom.getByRole('button', { name: 'To Read', exact: true })).toHaveCount(0)
   if (action.chapter === 1) {
    await expect(top.getByRole('button', { name: 'To Read', exact: true })).toBeVisible()
    await expect(top.getByRole('button', { name: 'Reading', exact: true })).toBeVisible()
   } else await expect(top.getByRole('button', { name: 'To Read', exact: true })).toHaveCount(0)
   await (action.bottom ? bottom : top).getByRole('button', { name: action.label, exact: true }).click()
   await expect(top.getByRole('status')).toHaveText('Saved')
   const saved = await page.evaluate(() => (window as Window & { unsavedReadingRequests: { p_action: string; p_input: Record<string, unknown> }[] }).unsavedReadingRequests.find(request => request.p_action === 'save')!.p_input)
   expect(saved).toMatchObject({ status: action.status, progress: action.progress })
   if (action.label === 'Reading') expect(saved).not.toHaveProperty('chapter_read')
   else expect(saved.chapter_read).toMatchObject({ chapter: action.chapter, word_count: 3 })
  }
 } finally { await rm(directory, { recursive: true, force: true }) }
})
