import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('built userscript saves inline, recovers failed notes and fits a mobile viewport', async ({ page }) => {
 const directory = await mkdtemp(join(tmpdir(), 'ao3-userscript-browser-'))
 try {
  execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-userscript.mjs', '--outDir', join(directory, 'dist')], { env: { ...process.env, VITE_SUPABASE_URL: 'https://userscript-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', EXTENSION_APP_ORIGIN: 'https://library-test.example' }, stdio: 'pipe' })
  const script = await readFile(join(directory, 'dist/ao3-library.user.js'), 'utf8')
  await page.route('https://archiveofourown.org/**', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="main"><div id="workskin"><h2 class="title">Test story</h2><dl class="work meta"><dd class="chapters">10/10</dd></dl><select id="selected_id"><option value="101">1. First</option><option value="102">2. Second</option><option value="103">3. Third</option><option value="104" selected>4. Fourth</option></select></div></main></body></html>' }))
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
     return { status: 200, responseText: JSON.stringify({ entry: state.entry, collections: [] }) }
    },
   } })
  })
  await page.addScriptTag({ content: script })
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await expect(page.getByLabel('Current chapter', { exact: true })).toHaveValue('4')
  await expect(page.getByLabel('Reading status')).toHaveValue('reading')
  await page.getByLabel('Private notes').fill('Keep these notes after a network failure')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Could not save')
  await expect(page.getByLabel('Private notes')).toHaveValue('Keep these notes after a network failure')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await expect(page.getByText('Ch. 3 / 10', { exact: true })).toBeVisible()
  await expect(page.getByText('Keep these notes after a network failure', { exact: true })).toBeVisible()
  expect(page.url()).toBe('https://archiveofourown.org/works/123/chapters/104')
 } finally { await rm(directory, { recursive: true, force: true }) }
})
