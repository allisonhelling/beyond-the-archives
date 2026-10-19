import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('built userscript keeps chapter controls, editor fields, and collapsible panels in sync', async ({ page }) => {
 const directory = await mkdtemp(join(tmpdir(), 'ao3-userscript-browser-'))
 try {
  execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-userscript.mjs', '--outDir', join(directory, 'dist')], { env: { ...process.env, VITE_SUPABASE_URL: 'https://userscript-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', EXTENSION_APP_ORIGIN: 'https://library-test.example' }, stdio: 'pipe' })
  const script = await readFile(join(directory, 'dist/ao3-library.user.js'), 'utf8')
  await page.route('https://archiveofourown.org/**', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="main"><div id="workskin"><h2 class="title">Test story</h2><dl class="work meta"><dd class="chapters">10/10</dd></dl><select id="selected_id"><option value="101">1. First</option><option value="102">2. Second</option><option value="103">3. Third</option><option value="104" selected>4. Fourth</option><option value="105">5. Fifth</option><option value="106">6. Sixth</option><option value="107">7. Seventh</option><option value="108">8. Eighth</option><option value="109">9. Ninth</option><option value="110">10. Last</option></select></div><div id="kudos">Kudos list</div></main></body></html>' }))
  await page.goto('https://archiveofourown.org/works/123/chapters/104')
  await page.evaluate(() => {
   // Open the shadow root only in this fixture so Playwright can interact with
   // it. Production and the source-level privacy tests use a closed root.
   const attach = Element.prototype.attachShadow
   Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }) }
   const state: { entry: Record<string, unknown> | null; fail: boolean; requests: Record<string, unknown>[] } = { entry: null, fail: true, requests: [] }
   const storage = new Map<string, unknown>([['connection:https://userscript-test.supabase.co', { userId: 'alice', secret: 'fixture-device-secret' }]])
   Object.assign(window, { GM: {
    getValue: async (key: string, fallback: unknown) => storage.get(key) ?? fallback,
    setValue: async (key: string, value: unknown) => storage.set(key, value),
    deleteValue: async (key: string) => storage.delete(key),
    xmlHttpRequest: async ({ data }: { data: string }) => {
     const body = JSON.parse(data); state.requests.push(body)
     if (body.p_action === 'save') {
      if (state.fail) { state.fail = false; return { status: 503, responseText: '{}' } }
      state.entry = { ...body.p_input, version: 'v1' }
     }
     if (body.p_action === 'progress') state.entry = { ...state.entry, ...body.p_input, version: 'v2' }
     return { status: 200, responseText: JSON.stringify({ entry: state.entry, collections: [{ id: 'weekend', name: 'Weekend reads' }, { id: 'night', name: 'Night reads' }] }) }
    },
   } })
  })
  await page.addScriptTag({ content: script })
  await expect(page.getByRole('link', { name: 'between chapters library' })).toBeVisible()
  await expect(page.getByText(/AO3 Library v/)).toBeHidden()
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('Current chapter', { exact: true })).toHaveValue('4')
  await expect(page.getByLabel('Reading status', { exact: true })).toHaveValue('reading')
  await expect(page.getByText(/AO3 Library v/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload saved entry' })).toHaveCount(0)
  await page.locator('summary[aria-label="About reading status"]').click()
  await expect(page.getByText('To Read marks no chapters as read.', { exact: false })).toBeVisible()
  await page.locator('summary[aria-label="About reading status"]').click()
  await page.locator('summary[aria-label="About current chapter"]').click()
  await expect(page.getByText('Current chapter − 1 counts as completed; check finished to include this chapter.', { exact: true })).toBeVisible()
  await page.locator('summary[aria-label="About current chapter"]').click()
  for (const status of ['to_read', 'finished']) {
   await page.getByLabel('Reading status', { exact: true }).selectOption(status)
   await expect(page.getByLabel('Current chapter', { exact: true })).toBeHidden()
   await expect(page.getByLabel('This chapter is finished', { exact: true })).toBeHidden()
  }
  for (const status of ['re_reading', 'reading']) {
   await page.getByLabel('Reading status', { exact: true }).selectOption(status)
   await expect(page.getByLabel('Current chapter', { exact: true })).toBeVisible()
   await expect(page.getByLabel('This chapter is finished', { exact: true })).toBeVisible()
  }
  for (const field of ['Private notes']) {
   const input = page.getByLabel(field, { exact: true })
   await input.fill(Array.from({ length: 16 }, (_, index) => `Line ${index + 1}`).join('\n'))
   const expanded = (await input.boundingBox())!.height
   expect(await input.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
   await page.getByRole('button', { name: `Collapse ${field}`, exact: true }).click()
   expect((await input.boundingBox())!.height).toBeLessThan(expanded)
   await page.getByRole('button', { name: `Expand ${field}`, exact: true }).click()
   expect((await input.boundingBox())!.height).toBeGreaterThan(expanded - 2)
   await input.fill('')
  }
  for (const tag of ['Comfort', 'A much longer personal tag', 'comfort']) {
   await page.getByRole('textbox', { name: 'Personal tags', exact: true }).fill(tag)
   await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('button', { name: /^Delete personal tag/ })).toHaveCount(2)
  for (const tag of ['Comfort', 'A much longer personal tag']) {
   const chip = page.getByRole('button', { name: `Delete personal tag ${tag}`, exact: true })
   await page.mouse.move(0, 0)
   const before = await chip.boundingBox()
   await chip.hover()
   expect(await chip.boundingBox()).toEqual(before)
   await expect(chip).toHaveCSS('color', 'rgb(17, 17, 17)')
   await expect(chip.locator('.tag-remove-cap')).toHaveCSS('background-color', 'rgb(255, 240, 241)')
  }
  await page.getByRole('radio', { name: '4 out of 5 stars' }).check()
  await page.getByRole('button', { name: 'Clear rating', exact: true }).click()
  await expect(page.getByText('Unrated', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '3 out of 5 stars' }).check()
  await expect(page.getByLabel('Weekend reads')).toBeHidden()
  await page.getByText('Add to custom collection', { exact: true }).click()
  await page.getByLabel('Weekend reads').check()
  await page.getByLabel('Search custom collections').fill('NIGHT')
  await expect(page.getByLabel('Weekend reads')).toBeHidden()
  await expect(page.getByLabel('Night reads')).toBeVisible()
  await page.getByLabel('Night reads').check()
  await page.getByLabel('Search custom collections').fill('missing')
  await expect(page.getByText('No matching collections.')).toBeVisible()
  await page.getByLabel('Search custom collections').fill('')
  await expect(page.getByLabel('Weekend reads')).toBeChecked()
  await expect(page.getByText('Custom collections', { exact: true })).toHaveCSS('font-size', await page.getByLabel('Reading status', { exact: true }).evaluate(element => getComputedStyle(element.parentElement!).fontSize))
  await page.getByText('Add to custom collection', { exact: true }).click()
  await page.screenshot({ path: `test-results/userscript-editor-${page.viewportSize()!.width}.png`, fullPage: true })
  await page.getByLabel('Private notes', { exact: true }).fill('Keep these notes after a network failure')
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('Private notes', { exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Add to Library', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('Private notes', { exact: true })).toHaveValue('Keep these notes after a network failure')
  await page.getByRole('button', { name: 'Connection', exact: true }).click()
  await page.getByLabel('One-time pairing code').fill('partially-filled-pairing-code')
  await page.getByRole('button', { name: 'Connection', exact: true }).click()
  await expect(page.getByLabel('One-time pairing code')).toBeHidden()
  await page.getByRole('button', { name: 'Connection', exact: true }).click()
  await expect(page.getByLabel('One-time pairing code')).toHaveValue('partially-filled-pairing-code')
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('One-time pairing code')).toBeHidden()
  await expect(page.getByLabel('Private notes', { exact: true })).toHaveValue('Keep these notes after a network failure')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Could not save')
  await expect(page.getByLabel('Private notes', { exact: true })).toHaveValue('Keep these notes after a network failure')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  const top = page.locator('#ao3-library-companion')
  const bottom = page.locator('#ao3-library-progress')
  expect(await page.locator('#kudos').evaluate(element => element.previousElementSibling?.id)).toBe('ao3-library-progress')
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 3 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByRole('button', { name: '✓ Through Ch. 4', exact: true })).toBeVisible()
  }
  await top.screenshot({ path: `test-results/userscript-top-toolbar-${page.viewportSize()!.width}.png` })
  await bottom.screenshot({ path: `test-results/userscript-bottom-toolbar-${page.viewportSize()!.width}.png` })
  await expect(bottom.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  await expect(bottom.getByRole('button', { name: 'Connection', exact: true })).toHaveCount(0)
  await bottom.getByRole('button', { name: '✓ Through Ch. 4', exact: true }).click()
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 4 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByText('Read through Ch. 4', { exact: true })).toBeVisible()
   await expect(surface.getByRole('button', { name: /Through Ch/ })).toHaveCount(0)
  }
  expect(page.url()).toBe('https://archiveofourown.org/works/123/chapters/104')
  await expect(page.getByText(/AO3 Library v/)).toBeHidden()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const reloadEntry = page.getByRole('button', { name: 'Reload saved entry' })
  await expect(reloadEntry).toBeVisible()
  const actionsBounds = await page.locator('.editor-actions').boundingBox()
  const reloadBounds = await reloadEntry.boundingBox()
  expect(Math.abs(actionsBounds!.x + actionsBounds!.width - reloadBounds!.x - reloadBounds!.width)).toBeLessThan(1)
  await expect(page.getByLabel('Private notes', { exact: true })).toHaveValue('Keep these notes after a network failure')
  await page.getByLabel('Private notes', { exact: true }).fill('Unsaved notes stay while changing chapters')
  await page.getByRole('button', { name: 'Connection', exact: true }).click()
  for (let progress = 5; progress <= 9; progress++) {
   await page.getByRole('button', { name: 'Next chapter', exact: true }).click()
   for (const surface of [top, bottom]) await expect(surface.getByText(`Ch. ${progress} / 10`, { exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Mark all chapters read and finish work' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark all chapters read and finish work' }).click()
  await expect(page.getByLabel('Reading status', { exact: true })).toHaveValue('finished')
  await page.getByRole('button', { name: 'Reread?', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Reading status', { exact: true })).toHaveValue('re_reading')
  await expect(page.getByLabel('Current chapter', { exact: true })).toHaveValue('1')
  await expect(page.getByLabel('Private notes', { exact: true })).toHaveValue('Unsaved notes stay while changing chapters')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await bottom.getByRole('button', { name: '✓ Through Ch. 4', exact: true }).click()
  for (const surface of [top, bottom]) await expect(surface.getByText('Ch. 4 / 10', { exact: true })).toBeVisible()
  await page.evaluate(() => {
   document.getElementById('ao3-library-companion')!.remove()
   history.replaceState(null, '', '/works/123/chapters/110')
  })
  await page.addScriptTag({ content: script })
  await expect(bottom.getByRole('button', { name: '✓ Finish Fic', exact: true })).toBeVisible()
  await bottom.getByRole('button', { name: '✓ Finish Fic', exact: true }).click()
  await expect(top.getByText('Finished', { exact: true })).toBeVisible()
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Ch. 10 / 10', { exact: true })).toBeVisible()
   await expect(surface.getByText('Read through Ch. 10', { exact: true })).toBeVisible()
  }
  await page.evaluate(() => {
   document.getElementById('ao3-library-companion')!.remove()
   history.replaceState(null, '', '/works/123/chapters/104')
  })
  await page.addScriptTag({ content: script })
  for (const surface of [top, bottom]) {
   await expect(surface.getByText('Read through Ch. 4', { exact: true })).toBeVisible()
   await expect(surface.getByRole('button', { name: /Through Ch|Finish Fic/ })).toHaveCount(0)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
 } finally { await rm(directory, { recursive: true, force: true }) }
})
