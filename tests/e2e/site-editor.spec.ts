import { chromium, expect, test, type Frame, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { browserTestEnv } from '../../scripts/playwright-env'
import { localExtensionId } from '../../src/features/imports/extension-config'
import { blankMetadata } from '../../src/features/library/model'
import { makeSiteRequest } from '../../src/features/imports/site-mapping'

test('the installed companion gates extraction, edits an unknown story and tears down on a same-document route change', async ({ browserName }, info) => {
 test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'Unpacked desktop Chromium companion.')
 test.setTimeout(120000)
 const profile = await mkdtemp(join(tmpdir(), 'bta-site-editor-'))
 const sourceUrl = 'https://fiction.example/stories/one'
 const owner = '82a00000-0000-4000-8000-000000000001', entry = '82a00000-0000-4000-8000-000000000002'
 const bulkUrl = 'https://fiction.example/stories/bulk', indexUrl = 'https://fiction.example/catalog'
 const bulkBatch = '82a00000-0000-4000-8000-000000000003'
 const bulkWrites: Record<string, unknown>[] = []
 let claimed = false
 const writes: Record<string, unknown>[] = []
 const mappings: { rule: unknown }[] = []
 const server = createServer(async (request, response) => {
  const path = new URL(request.url!, 'http://127.0.0.1').pathname
  // Serve the handoff directly because Chromium can navigate an extension-created tab before Playwright attaches its routes.
  if (path === '/extension-fixture' || path === '/add') {
   const title = path === '/add' ? 'Library Draft Test' : 'Library Test App'
   response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><title>${title}</title>`)
   return
  }
  let body: unknown
  if (path === '/auth/v1/user') body = { id: owner }
  else if (path === '/rest/v1/rpc/claim_extension_job') body = null
  else if (path === '/rest/v1/rpc/site_import_origins') body = [{ url: bulkUrl }]
  else if (path === '/rest/v1/rpc/claim_site_import') {
   body = claimed ? null : { id: 'item', token: 'lease', url: bulkUrl, recognized: false, expiresAt: new Date(Date.now() + 90000).toISOString() }
   claimed = true
  } else if (path === '/rest/v1/rpc/finish_site_import') {
   let data = ''
   for await (const part of request) data += part
   bulkWrites.push(JSON.parse(data)); body = true
  } else if (path === '/rest/v1/rpc/tag_classification_revision') body = '1:fixture'
  else if (path === '/rest/v1/tag_classification_rules') body = [{
   id: 'rule', label: 'Fixture Tag', scope: 'site', site: 'https://fiction.example', category: 'character', enabled: true, priority: null,
  }]
  else if (path === '/rest/v1/site_mappings') body = mappings
  else if (path === '/rest/v1/collections') body = []
  else if (path === '/rest/v1/library_entries') body = writes.length ? [{ id: entry }] : []
  else if (path === '/rest/v1/rpc/library_story_details') body = [{
   id: entry, source_url: sourceUrl, metadata: { ...blankMetadata, title: 'Preserved Draft', published_chapters: 12 },
   metadata_overrides: { title: 'Preserved Draft', published_chapters: 12 }, collectionIds: [], personalTags: ['Private Tag'],
   notes: 'Saved Private Note', reading_status: 'reading', last_read_chapter: 3, personal_rating: 4,
  }]
  else if (path === '/rest/v1/rpc/write_site_mapping') {
   let data = ''
   for await (const part of request) data += part
   mappings.push({ rule: JSON.parse(data).p_rule }); body = true
  } else if (path === '/rest/v1/rpc/save_companion_story') {
   let data = ''
   for await (const part of request) data += part
   writes.push(JSON.parse(data)); body = entry
  } else { response.writeHead(404).end(); return }
  response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
 })
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
 const address = server.address()
 if (!address || typeof address === 'string') throw new Error('Companion fixture server unavailable.')
 const ext = join(profile, 'extension'), appOrigin = `http://127.0.0.1:${address.port}`
 let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined
 try {
  execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-extension.mjs', '--local', '--outDir', ext], {
   env: { ...process.env, ...browserTestEnv, VITE_ORGANIZER_URL: appOrigin, EXTENSION_LOCAL_APP_ORIGIN: appOrigin, EXTENSION_LOCAL_SUPABASE_URL: browserTestEnv.VITE_SUPABASE_URL, EXTENSION_LOCAL_SUPABASE_PUBLISHABLE_KEY: browserTestEnv.VITE_SUPABASE_PUBLISHABLE_KEY }, stdio: 'pipe',
  })
  const backgroundPath = join(ext, 'background.js'), manifestPath = join(ext, 'manifest.json')
  const background = (await readFile(backgroundPath, 'utf8')).replaceAll(browserTestEnv.VITE_SUPABASE_URL, appOrigin)
  // Headless Chromium cannot click browser chrome. Invoke the same controller
  // using a fixture host grant and keep a second fixture without a grant.
  expect(background).toContain('chrome.action.onClicked.addListener')
  await writeFile(backgroundPath, background.replace('chrome.action.onClicked.addListener', 'globalThis.testSiteOpen = (tab) => site.open(tab); globalThis.testBulkAuthorize = (tab) => siteBulk.authorize(tab);\nchrome.action.onClicked.addListener'))
  const manifest = JSON.parse((await readFile(manifestPath, 'utf8')).replaceAll(browserTestEnv.VITE_SUPABASE_URL, appOrigin))
  expect(manifest.permissions).toContain('activeTab')
  expect(manifest.host_permissions).not.toContain('https://*/*')
  manifest.host_permissions.push('https://fiction.example/*')
  await writeFile(manifestPath, JSON.stringify(manifest))
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-proxy-server'] })
  context.setDefaultTimeout(20000)
  await context.route('https://*.example/**', route => {
   if (route.request().url() === indexUrl) return route.fulfill({ contentType: 'text/html', body: '<a href="/stories/bulk">Bulk</a><a href="javascript:void(0)">Restricted</a>' })
   if (route.request().url() === bulkUrl) return route.fulfill({ contentType: 'text/html', body: '<main><h1>Bulk Story</h1><script type="application/ld+json">{"@type":"Novel","name":"Bulk Story","keywords":"Fixture Tag"}</script></main>' })
   return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Unknown Story</title>
   <main style="width:350px"><h1 itemprop="headline">Actual Story</h1><p class="byline">Written by: A. Writer</p>
    <p class="fandom">Original Work</p><p class="chapters" data-published-chapters>12</p><button id="page-control" onclick="this.textContent='Expanded'">Expand</button>
    <p id="old-summary">An actual summary.</p></main>` })
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const app = await context.newPage()
  await app.goto(`${appOrigin}/extension-fixture`)
  const message = (payload: object, page = app) => page.evaluate(async ({ id, payload }) => new Promise(resolve => {
   const runtime = (window as Window & { chrome: { runtime: { sendMessage(id: string, payload: object, callback: (reply: unknown) => void): void } } }).chrome.runtime
   runtime.sendMessage(id, payload, resolve)
  }), { id: localExtensionId, payload })
  const open = (url: string) => worker.evaluate(async url => {
   const extension = globalThis as unknown as { chrome: { tabs: { query(query: object): Promise<object[]> } }; testSiteOpen(tab: object): Promise<boolean> }
   const [tab] = await extension.chrome.tabs.query({ active: true, lastFocusedWindow: true })
   return extension.testSiteOpen({ ...tab, url }).then(opened => opened ? 'opened' : 'unsupported', () => 'denied')
  }, url)
  const source = await context.newPage()
  const panel = async (page: Page = source): Promise<Frame> => {
   const frame = page.frames().find(frame => frame.url().includes('site-panel.html#'))
   if (frame) return frame
   return page.waitForEvent('framenavigated', { predicate: frame => frame.url().includes('site-panel.html#') })
  }
  await source.goto('https://ungranted.example/stories/one')
  await source.bringToFront()
  expect(await open('https://ungranted.example/stories/one')).toBe('denied')
  await source.goto(sourceUrl)
  expect(await open(sourceUrl)).toBe('opened')
  let editor = await panel()
  await expect(editor.getByRole('button', { name: 'Connect Library' })).toBeVisible()
  await editor.getByLabel('Title', { exact: true }).fill('Preserved Draft')
  await editor.getByRole('button', { name: 'Close', exact: true }).click()
  await expect.poll(() => source.frames().filter(frame => frame.url().includes('site-panel')).length).toBe(0)
  expect(await message({ type: 'AO3_LIBRARY_CONNECT', token: 'fixture-token', expiresAt: Date.now()/1000 + 3600 })).toEqual({ ok: true })
  expect(await open(sourceUrl)).toBe('opened')
  editor = await panel()
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Preserved Draft')
  await expect(editor.getByText('Page Element\nActual Story')).toBeVisible()
  await expect(editor.getByLabel('Published Chapters', { exact: true })).toHaveValue('12')
  await editor.getByRole('button', { name: 'Teach Where to Find Authors' }).press('Enter')
  await expect(editor.getByLabel('Map Field')).toBeFocused()
  await editor.getByRole('button', { name: 'Pause Selection' }).click()
  await expect(editor.getByRole('button', { name: 'Resume Selection' })).toBeVisible()
  await source.getByRole('button', { name: 'Expand' }).click()
  await expect(source.getByRole('button', { name: 'Expanded' })).toBeVisible()
  await editor.getByRole('button', { name: 'Resume Selection' }).click()
  await expect(editor.getByRole('button', { name: 'Pause Selection' })).toBeVisible()
  await source.getByText('Written by: A. Writer').click()
  await editor.getByLabel('Remove Text Prefix').fill('Written by: ')
  await expect(editor.locator('output')).toContainText('A. Writer')
  await editor.getByRole('button', { name: 'Use Once' }).click()
  await expect(editor.getByLabel('Authors', { exact: true })).toHaveValue('A. Writer')
  await editor.getByRole('button', { name: 'Map Page Elements' }).press('Enter')
  await expect(editor.getByLabel('Map Field')).toBeFocused()
  await source.getByText('An actual summary.').click()
  await editor.getByLabel('Map Field').selectOption('summary')
  await expect(editor.locator('output')).toContainText('An actual summary.')
  await editor.getByLabel('Map Field').press('Escape')
  await expect(editor.getByRole('heading', { name: 'Map Page Elements' })).toBeHidden()
  await editor.getByRole('button', { name: 'Teach Where to Find Fandoms' }).press('Enter')
  await expect(editor.getByLabel('Map Field')).toBeFocused()
  await source.getByText('Original Work', { exact: true }).click()
  await editor.getByLabel('Mapping Scope').selectOption('matching')
  await editor.getByRole('button', { name: 'Save for Matching Story Pages' }).click()
  await expect(editor.locator('#notice')).toHaveText('Confirm the broader URL scope before saving.')
  expect(mappings).toHaveLength(0)
  await editor.getByLabel('Mapping Scope').selectOption('exact')
  await editor.getByRole('button', { name: 'Save for Exact URL' }).click()
  await expect(editor.locator('#notice')).toHaveText('Mapping saved. Your story draft is available separately.')
  expect(mappings).toEqual([{ rule: expect.objectContaining({ field: 'fandoms', scope: 'exact', previous: 'Original Work' }) }])
  await expect(editor.getByLabel('Fandoms', { exact: true })).toHaveValue('')
  await editor.getByRole('button', { name: 'Save Story' }).click()
  await expect(editor.getByRole('heading', { name: 'Story Saved' })).toBeVisible()
  expect(writes).toEqual([expect.objectContaining({
   p_url: sourceUrl, p_input: expect.objectContaining({ metadata: expect.objectContaining({ title: 'Preserved Draft', authors: ['A. Writer'], published_chapters: 12 }) }),
   p_observations: expect.objectContaining({ title: { text: 'Actual Story', via: 'Page Element' } }),
  })])
  await source.evaluate(() => history.pushState(null, '', '/stories/two'))
  await expect.poll(() => source.frames().filter(frame => frame.url().includes('site-panel')).length).toBe(0)
  await source.close()
  await app.bringToFront()
  const request = makeSiteRequest(owner, sourceUrl, 'extract', crypto.randomUUID())
  const [requested, result] = await Promise.all([
   context.waitForEvent('page'),
   message({ type: 'BTA_SITE_REQUEST', action: 'begin', request }),
  ])
  expect(result).toMatchObject({ ok: true, result: { code: 'PERMISSION_REQUIRED' } })
  await requested.waitForURL(sourceUrl)
  const other = await context.newPage()
  await other.goto(`${appOrigin}/extension-fixture`)
  expect(await message({ type: 'BTA_SITE_REQUEST', action: 'read', request }, other)).toMatchObject({ ok: false, code: 'STALE' })
  await requested.bringToFront()
  expect(await open(sourceUrl)).toBe('opened')
  const requestedEditor = await panel(requested)
  await requestedEditor.getByRole('button', { name: 'Return to Draft' }).press('Enter')
  await expect.poll(() => requestedEditor.isDetached()).toBe(true)
  expect(await message({ type: 'BTA_SITE_REQUEST', action: 'read', request })).toMatchObject({ ok: true, result: { code: 'OK', observations: { title: { text: 'Actual Story' } } } })
  expect(await message({ type: 'BTA_SITE_REQUEST', action: 'read', request })).toMatchObject({ ok: false, code: 'STALE' })
  await requested.bringToFront()
  expect(await open(sourceUrl)).toBe('opened')
  const savedEditor = await panel(requested)
  await expect(savedEditor.getByRole('heading', { name: 'Edit Saved Story' })).toBeVisible()
  await expect(savedEditor.getByLabel('Title', { exact: true })).toHaveValue('Preserved Draft')
  await expect(savedEditor.getByLabel('Notes', { exact: true })).toHaveValue('Saved Private Note')
  await expect(savedEditor.getByText('Page Element\nActual Story')).toBeVisible()
  await savedEditor.getByLabel('Notes', { exact: true }).fill('Edited in the panel')
  const [transfer] = await Promise.all([
   context.waitForEvent('page'),
   savedEditor.getByRole('button', { name: 'Continue in App' }).press('Enter'),
  ])
  await transfer.waitForURL(/companion=/)
  await expect(transfer).toHaveTitle('Library Draft Test')
  const id = new URL(transfer.url()).searchParams.get('companion')
  expect(await message({ type: 'BTA_SITE_DRAFT', id }, transfer)).toMatchObject({
   ok: true, url: sourceUrl, base: { notes: 'Saved Private Note', progress: 3 },
   draft: { storyId: entry, story: { notes: 'Edited in the panel' } },
  })
  expect(writes).toHaveLength(1)
  await expect.poll(() => savedEditor.isDetached()).toBe(true)
  expect(await message({ type: 'AO3_LIBRARY_DISCONNECT' })).toEqual({ ok: true })
  await requested.bringToFront()
  expect(await open(sourceUrl)).toBe('opened')
  const disconnectedEditor = await panel(requested)
  await expect(disconnectedEditor.locator('#notice')).toHaveText('Connect your library to save or transfer your draft.')
  await disconnectedEditor.getByLabel('Title', { exact: true }).fill('A Disconnected Correction')
  await disconnectedEditor.getByRole('button', { name: 'Close', exact: true }).press('Enter')
  await expect.poll(() => disconnectedEditor.isDetached()).toBe(true)
  expect(await message({ type: 'AO3_LIBRARY_CONNECT', token: 'fixture-token', expiresAt: Date.now()/1000 + 3600 })).toEqual({ ok: true })
  expect(await open(sourceUrl)).toBe('opened')
  const restoredEditor = await panel(requested)
  await expect(restoredEditor.getByLabel('Title', { exact: true })).toHaveValue('Preserved Draft')
  await restoredEditor.getByRole('button', { name: 'Restore Disconnected Draft' }).press('Enter')
  await expect(restoredEditor.getByLabel('Title', { exact: true })).toHaveValue('A Disconnected Correction')
  await expect(restoredEditor.getByLabel('Notes', { exact: true })).toHaveValue('Edited in the panel')
  await app.bringToFront()
  const discovery = makeSiteRequest(owner, indexUrl, 'discover')
  const [listing, started] = await Promise.all([
   context.waitForEvent('page'),
   message({ type: 'BTA_SITE_REQUEST', action: 'begin', request: discovery }),
  ])
  expect(started).toMatchObject({ ok: true, result: { code: 'PERMISSION_REQUIRED' } })
  await listing.waitForURL(indexUrl)
  await listing.bringToFront()
  expect(await open(indexUrl)).toBe('opened')
  expect(await message({ type: 'BTA_SITE_REQUEST', action: 'read', request: discovery })).toMatchObject({
   ok: true, result: { code: 'OK', links: [bulkUrl, 'about:invalid'] },
  })
  await app.bringToFront()
  const [bulkTab, opened] = await Promise.all([
   context.waitForEvent('page'), message({ type: 'BTA_SITE_BULK', batch: bulkBatch, url: bulkUrl }),
  ])
  expect(opened).toEqual({ ok: true })
  await bulkTab.waitForURL(bulkUrl)
  await bulkTab.bringToFront()
  expect(bulkWrites).toHaveLength(0)
  expect(await worker.evaluate(async () => {
   const extension = globalThis as unknown as { chrome: { tabs: { query(query: object): Promise<object[]> } }; testBulkAuthorize(tab: object): Promise<boolean> }
   const [tab] = await extension.chrome.tabs.query({ active: true, lastFocusedWindow: true })
   return extension.testBulkAuthorize(tab)
  })).toBe(true)
  await expect.poll(() => bulkWrites).toEqual([expect.objectContaining({
   p_batch: bulkBatch, p_item: 'item', p_token: 'lease',
   p_metadata: expect.objectContaining({ title: 'Bulk Story', character_tags: ['Fixture Tag'] }),
   p_observations: expect.objectContaining({ ao3_tags: { text: 'Fixture Tag', via: 'Structured Data' } }),
  })])
 } finally {
  await context?.close()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(profile, { recursive: true, force: true })
 }
})
