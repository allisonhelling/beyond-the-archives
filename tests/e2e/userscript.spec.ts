import { mergeEdits, type EditValues, type MergeResult } from '../../src/features/library/edit-merge'
import { expect, test } from '@playwright/test'
import { verifyPersonalTagControls } from './personal-tag-controls'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('built userscript keeps chapter controls, editor fields, and collapsible panels in sync', async ({ page }) => {
 const directory = await mkdtemp(join(tmpdir(), 'ao3-userscript-browser-'))
 try {
  execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-userscript.mjs', '--outDir', join(directory, 'dist')], { env: { ...process.env, VITE_SUPABASE_URL: 'https://userscript-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', EXTENSION_APP_ORIGIN: 'https://library-test.example' }, stdio: 'pipe' })
  const bundle = await readFile(join(directory, 'dist/ao3-library.user.js'), 'utf8')
  // Userscripts supplies GM in the script's scope, without exposing it on globalThis.
  const script = `(function (GM) {\n${bundle}\n})(window.userscriptTestApi);`
  await page.route('https://archiveofourown.org/**', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="main"><div id="workskin"><h2 class="title">Test story</h2><div class="summary module"><blockquote></blockquote></div><div id="chapters"><div class="chapter"><div class="summary module"><blockquote>Chapter summary only</blockquote></div>PRIVATE CHAPTER TEXT</div></div><dl class="work meta"><dd class="chapters">10/10</dd></dl><select id="selected_id"><option value="101">1. First</option><option value="102">2. Second</option><option value="103">3. Third</option><option value="104" selected>4. Fourth</option><option value="105">5. Fifth</option><option value="106">6. Sixth</option><option value="107">7. Seventh</option><option value="108">8. Eighth</option><option value="109">9. Ninth</option><option value="110">10. Last</option></select></div><div id="kudos">Kudos list</div></main></body></html>' }))
  await page.route('https://archiveofourown.org/works/123?view_adult=true', route => route.fulfill({ contentType: 'text/html', body: '<h2 class="title">Test story</h2><div class="summary module"><blockquote><p>Work <em>summary</em>.</p><p>Second<br>line.</p></blockquote></div><dl class="work meta"><dd class="chapters">6/?</dd></dl>' }))
  await page.goto('https://archiveofourown.org/works/123/chapters/104')
  await page.exposeFunction('mergeLibraryEdits', mergeEdits)
  await page.evaluate(() => {
   // Open the shadow root only in this fixture so Playwright can interact with
   // it. Production and the source-level privacy tests use a closed root.
   const attach = Element.prototype.attachShadow
   Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }) }
   const state: { entry: Record<string, unknown> | null; fail: boolean; requests: Record<string, unknown>[] } = { entry: null, fail: true, requests: [] }
   const storage = new Map<string, unknown>([['connection:https://userscript-test.supabase.co', { userId: 'alice', secret: 'fixture-device-secret' }]])
   Object.assign(window, { userscriptTestState: state, userscriptTestApi: {
    getValue: async (key: string, fallback: unknown) => storage.get(key) ?? fallback,
    setValue: async (key: string, value: unknown) => storage.set(key, value),
    deleteValue: async (key: string) => storage.delete(key),
    xmlHttpRequest: async ({ data }: { data: string }) => {
     const body = JSON.parse(data); state.requests.push(body)
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
     return { status: 200, responseText: JSON.stringify({ entry: state.entry, collections: [{ id: 'weekend', name: 'Weekend reads' }, { id: 'night', name: 'Night reads' }] }) }
    },
   } })
  })
  expect(await page.evaluate(() => 'GM' in globalThis)).toBe(false)
  await page.addScriptTag({ content: script })
  const top = page.locator('#ao3-library-companion'), bottom = page.locator('#ao3-library-progress')
  await expect(top.getByRole('link', { name: 'View in between chapters library' })).toBeVisible()
  await expect(top.locator('.library-link')).toHaveText('')
  await expect(page.locator('#ao3-library-companion small a')).toHaveAttribute('href', 'https://library-test.example/settings#ios-safari-userscript')
  await expect(page.getByText(/AO3 Library v/)).toBeHidden()
  await expect(bottom).toBeVisible()
  await expect(bottom.locator('.toolbar')).toHaveText((await top.locator('.toolbar').textContent())!)
  await bottom.screenshot({path:`test-results/safari-unsaved-bottom-${page.viewportSize()!.width}.png`})
  await bottom.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('Current Chapter', { exact: true })).toHaveValue('4')
  await expect(page.getByLabel('Reading Status', { exact: true })).toHaveValue('reading')
  await expect(page.getByText(/AO3 Library v/)).toBeVisible()
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
  const stableTagInput = await page.getByRole('textbox', { name: 'Personal tags', exact: true }).elementHandle()
  for (const tag of ['Comfort', 'A much longer personal tag', 'comfort']) {
   await page.getByRole('textbox', { name: 'Personal tags', exact: true }).fill(tag)
   await page.keyboard.press('Enter')
   expect(await page.getByRole('textbox', { name: 'Personal tags', exact: true }).evaluate((element, previous) => element === previous, stableTagInput)).toBe(true)
  }
  await expect(page.getByRole('button', { name: /^Delete personal tag/ })).toHaveCount(2)
  await page.getByRole('button', { name: 'Personal tags help', exact: true }).click()
  const tagHelpText = page.locator('.personal-tag-help > span')
  await expect(tagHelpText).toBeVisible()
  if ((page.viewportSize()?.width ?? 1280) <= 650) {
   await expect(tagHelpText).toContainText('Hold the grip')
   await expect(tagHelpText).not.toContainText('Backspace')
  } else await expect(tagHelpText).toContainText('Press Enter')
  const tagBox = (await page.locator('.tag-input').boundingBox())!, helpBox = (await page.getByRole('button', { name: 'Personal tags help', exact: true }).boundingBox())!
  expect(helpBox.x).toBeGreaterThanOrEqual(tagBox.x + tagBox.width)
  await page.getByRole('button', { name: 'Personal tags help', exact: true }).click()
  await verifyPersonalTagControls(page)
  for (const tag of ['Comfort', 'A much longer personal tag']) {
   const chip = page.getByRole('button', { name: `Delete personal tag ${tag}`, exact: true })
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
   await page.getByRole('textbox', { name: 'Personal tags', exact: true }).fill('Remove me')
   await page.keyboard.press('Enter')
   const removable = page.getByRole('button', { name: 'Delete personal tag Remove me', exact: true })
   await removable.tap()
   await expect(removable).toHaveClass(/tag-selected/)
   await expect(removable.locator('.tag-label')).toHaveCSS('mask-image', 'none')
   await expect(removable.locator('.tag-remove-cap')).toHaveCSS('opacity', '0')
   await removable.tap()
   await expect(removable).toHaveCount(0)
  }
  await page.getByRole('radio', { name: '4 out of 5 stars' }).check()
  await expect(page.getByRole('button', { name: 'Clear Rating', exact: true })).toHaveCSS('font-size', notesFont)
  for (const chip of await page.getByRole('button', { name: /^Delete personal tag/ }).all()) await expect(chip).toHaveCSS('font-size', notesFont)
  await page.getByRole('button', { name: 'Clear Rating', exact: true }).click()
  await expect(page.getByText('Unrated', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '3 out of 5 stars' }).check()
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
  await expect(page.getByText('Custom collections', { exact: true })).toHaveCount(0)
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
  expect(saved).toMatchObject({ status: 'reading', progress: 3, metadata: { summary: 'Work summary.\n\nSecond\nline.', summary_html: '<p>Work <em>summary</em>.</p><p>Second<br>line.</p>', published_chapters: 10, total_chapters: 10 } })
  expect(JSON.stringify(saved)).not.toMatch(/Chapter summary only|PRIVATE CHAPTER TEXT/)

  expect(await page.locator('#kudos').evaluate(element => element.previousElementSibling?.id)).toBe('ao3-library-progress')
  await expect(top.getByRole('link', { name: 'View in between chapters library' })).toHaveAttribute('href', 'https://library-test.example/stories/fic-entry')
  await expect(top.locator('.library-link')).toHaveText('')
  await expect(top.locator('.toolbar-actions').getByRole('button', { name: 'Mark through chapter 4 as read', exact: true })).toBeVisible()
  for (const surface of [top, bottom]) {
   await expect(surface.locator('.chapter-progress > span')).toBeHidden()
   await surface.getByLabel('About chapters read', { exact: true }).click()
   await expect(surface.locator('.chapter-progress > span')).toBeVisible()
   await expect(surface.locator('.chapter-progress > span')).toHaveText('chapters read')
   await surface.getByLabel('About chapters read', { exact: true }).click()
   for (const element of await surface.locator('.toolbar *, .bottom-bar *').all()) await expect(element).toHaveCSS('font-size', '20px')
  }
  await expect(top.locator('.complete-chapter svg')).toHaveCSS('width', '26px')
  await expect(top.locator('.edit-button svg')).toHaveCSS('width', '26px')
  await expect(top.locator('.toolbar-progress').getByRole('button')).toHaveCount(0)
  await expect(top.locator('.status-bullet')).toHaveText('•')
  await expect(top.locator('.status-bullet')).toHaveCSS('color', 'rgb(38, 115, 68)')
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
  await expect(top.locator('.complete-chapter')).toHaveText('Ch. 4')
  await expect(top.locator('.toolbar')).toHaveCSS('column-gap', '12px')
  await expect(top.locator('.toolbar-actions')).toHaveCSS('gap', '12px')
  const actionButtons = await top.locator('.toolbar-actions > button').all()
  for (const button of actionButtons) {
   const bounds = (await button.boundingBox())!
   if (!mobile) expect(Math.abs(bounds.y + bounds.height / 2 - rowCenter)).toBeLessThan(1)
   await expect(button).toHaveCSS('margin-left', '0px')
  }
  const bottomBounds = (await bottom.locator('.bottom-bar').boundingBox())!, chapterBounds = (await bottom.locator('.reading-summary').boundingBox())!, completeBounds = (await bottom.locator('.complete-chapter').boundingBox())!
  if (Math.abs(chapterBounds.y + chapterBounds.height / 2 - completeBounds.y - completeBounds.height / 2) < 2) {
   expect(Math.abs((chapterBounds.x + completeBounds.x + completeBounds.width) / 2 - bottomBounds.x - bottomBounds.width / 2)).toBeLessThan(1)
  } else {
   for (const bounds of [chapterBounds, completeBounds]) expect(Math.abs(bounds.x + bounds.width / 2 - bottomBounds.x - bottomBounds.width / 2)).toBeLessThan(1)
  }

  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 3 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByText('Currently Reading', { exact: true })).toBeVisible()
   await expect(surface.getByRole('button', { name: 'Mark through chapter 4 as read', exact: true })).toBeVisible()
  }
  await top.screenshot({ path: `test-results/userscript-top-toolbar-${page.viewportSize()!.width}.png` })
  await bottom.screenshot({ path: `test-results/userscript-bottom-toolbar-${page.viewportSize()!.width}.png` })
  await expect(bottom.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  await expect(bottom.getByRole('button', { name: 'Connection', exact: true })).toHaveCount(0)
  await bottom.getByRole('button', { name: 'Mark through chapter 4 as read', exact: true }).click()
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 4 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByText('Read', { exact: true })).toBeVisible()
   await expect(surface.locator('.completion-indicator')).toHaveCSS('gap', '4px')
   await expect(surface.getByRole('button', { name: /Through Ch/ })).toHaveCount(0)
  }
  expect(page.url()).toBe('https://archiveofourown.org/works/123/chapters/104')
  await expect(page.getByText(/AO3 Library v/)).toBeHidden()
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
  await expect(pairing.getByRole('button', { name: /chapter|Finish Fic|Reread/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Unsaved notes stay while changing chapters')
  await page.getByLabel('Reading Status', { exact: true }).selectOption('re_reading')
  await page.getByLabel('Current Chapter', { exact: true }).fill('1')
  await page.getByLabel('This Chapter Is Finished', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  for (const surface of [top, bottom]) await expect(surface.getByText('Ch. 0 / 10', { exact: true })).toBeVisible()
  await bottom.getByRole('button', { name: 'Mark through chapter 4 as read', exact: true }).click()
  for (const surface of [top, bottom]) await expect(surface.getByText('Ch. 4 / 10', { exact: true })).toBeVisible()
  await page.evaluate(() => {
   document.getElementById('ao3-library-companion')!.remove()
   history.replaceState(null, '', '/works/123/chapters/110')
  })
  await page.addScriptTag({ content: script })
  await expect(bottom.getByRole('button', { name: 'Finished', exact: true })).toBeVisible()
  await bottom.getByRole('button', { name: 'Finished', exact: true }).click()
  await expect(top.getByText('Finished', { exact: true })).toBeVisible()
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 10 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByText('Read', { exact: true })).toBeVisible()
   await expect(surface.locator('.completion-indicator')).toHaveCSS('gap', '4px')
  }
  await page.evaluate(() => {
   document.getElementById('ao3-library-companion')!.remove()
   history.replaceState(null, '', '/works/123/chapters/104')
  })
  await page.addScriptTag({ content: script })
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Read', { exact: true })).toBeVisible()
   await expect(surface.locator('.completion-indicator')).toHaveCSS('gap', '4px')
   await expect(surface.getByRole('button', { name: /Through Ch|Finish Fic/ })).toHaveCount(0)
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
  const review = page.getByRole('region', { name: 'Review conflicting edits' })
  await expect(review.getByText('Keep this unsaved draft during recollection', { exact: true })).toBeVisible()
  await expect(review.getByText('New desktop notes while mobile is editing', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await review.screenshot({ path: `test-results/userscript-conflict-${page.viewportSize()!.width}.png` })
  await review.getByLabel('Edit or combine notes', { exact: true }).check()
  await review.getByLabel('Notes to save', { exact: true }).fill('Both desktop and mobile notes')
  await changeSavedNotes('Desktop changed again during review')
  await review.getByRole('button', { name: 'Save resolved changes' }).click()
  await expect(review.getByText('Desktop changed again during review', { exact: true })).toBeVisible()
  await review.getByLabel('Keep my draft', { exact: true }).check()
  await review.getByRole('button', { name: 'Save resolved changes' }).click()
  await expect(review).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Both desktop and mobile notes')
  await page.getByRole('radio', { name: '5 out of 5 stars', exact: true }).check()
  await changeSavedNotes('Desktop notes for an untouched notes field')
  await page.getByRole('button', { name: 'Reload Saved Entry', exact: true }).click()
  await expect(page.getByLabel('Private Notes', { exact: true })).toHaveValue('Desktop notes for an untouched notes field')
  await expect(page.getByRole('radio', { name: '5 out of 5 stars', exact: true })).toBeChecked()
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
  const ratingText = page.getByRole('textbox', { name: 'Rating info text', exact: true })
  await expect(ratingText).toHaveValue('Add how your personal rating system corresponds to the stars here! Edit this text in settings. To hide the info symbol, leave the box blank.')
  const customRatingInfo = '1 star: Not for me\n5 stars: A favorite <3'
  await ratingText.fill(customRatingInfo)
  await page.getByRole('button', { name: 'Save Rating Info', exact: true }).click()
  await expect(top.getByRole('status')).toHaveText('Rating info saved on this device.')
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
  const ratingHelp = page.getByRole('button', { name: 'Personal rating info', exact: true })
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
  expect(await page.getByRole('textbox', { name: 'Personal tags', exact: true }).evaluate(element => getComputedStyle(element, '::placeholder').color)).toBe('rgb(208, 197, 197)')
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
  await expect(page.getByRole('button', { name: 'Personal rating info', exact: true })).toHaveCount(0)
  await top.getByRole('button', { name: 'Connection', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.getByRole('button', { name: 'Light Mode', exact: true }).click()
  for (const surface of [top, bottom]) {
   await expect(surface).toHaveAttribute('data-theme', 'light')
   await expect(surface.locator('section').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  }
  // Safari's installable userscript also mounts every series work before pairing.
  const seriesUrl = 'https://archiveofourown.org/series/77'
  const seriesHtml = (await readFile('server/ao3/fixtures/series.html', 'utf8')).replace('<dl class="stats"><dd', '<dl class="stats"><dd class="kudos">42</dd><dd')
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
 } finally { await rm(directory, { recursive: true, force: true }) }
})
