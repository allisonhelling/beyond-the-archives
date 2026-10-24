import { chromium, expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { localExtensionId } from '../../src/features/imports/extension-config'

for (const local of [false, true]) {
test(`built ${local ? 'local' : 'hosted'} extension captures requested metadata before full load without duplicate uploads`, async ({ browserName }, info) => {
 test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'Chrome/Edge extension; separate persistent Chromium context.')
 test.setTimeout(90000) // Cold persistent Chromium startup plus service-worker wake-up.
 const appOrigin = local ? 'http://127.0.0.1:5173' : 'https://library-extension-test.example'
 let queued = false, claimed = false, loaded = false, workId = 123
 const uploads: { jobId: string; html: string; url: string }[] = []
 const authentications: { host: string; authorization: string }[] = []
 const barRequests: { p_action: string; p_work: number; p_input: Record<string, unknown> }[] = []
 const barEntries = new Map<number, Record<string, unknown>>()
 const localBarEntries = new Map<number, Record<string, unknown>>()
 // Use real HTTP for extension-worker fetches. Browser route interception can
 // delay delivery until the worker's next alarm, obscuring the actual flow.
 const server = createServer(async (request, response) => {
  const path = new URL(request.url!, 'http://127.0.0.1').pathname
  let body: unknown
  if (path === '/auth/v1/user') { authentications.push({ host: request.headers.host ?? '', authorization: request.headers.authorization ?? '' }); body = { id: 'alice' } }
  else if (path === '/rest/v1/rpc/claim_extension_job') {
   body = queued && !claimed ? { id: 'requested-job', token: 'requested-lease', workId, expiresAt: new Date(Date.now() + 300000).toISOString() } : null
   if (body) claimed = true
  } else if (path === '/rest/v1/rpc/userscript_library') {
   let data = ''
   for await (const part of request) data += part
   const requestBody = JSON.parse(data)
   barRequests.push(requestBody)
   const entries = request.headers.host?.startsWith('localhost:') ? localBarEntries : barEntries
   if (requestBody.p_action === 'claim') body = { secret: 'paired-chrome-secret', userId: 'alice' }
   else {
    if (['save', 'progress'].includes(requestBody.p_action)) {
     entries.set(requestBody.p_work, { ...entries.get(requestBody.p_work), ...requestBody.p_input, id: `bar-${requestBody.p_work}`, version: String(barRequests.length) })
    }
    body = { entry: entries.get(requestBody.p_work) ?? null, collections: [], savedWorks: [] }
   }
  } else if (path === '/rest/v1/metadata_jobs') body = [{ status: 'processing', lease_token: 'requested-lease' }]
  else if (path === '/functions/v1/extension-metadata') {
   let data = ''
   for await (const part of request) data += part
   uploads.push(JSON.parse(data)); body = { committed: true }
  } else { response.writeHead(404).end(); return }
  response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
 })
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
 const address = server.address()
 if (!address || typeof address === 'string') throw new Error('Test backend did not start.')
 const backend = `http://127.0.0.1:${address.port}`
 const profile = await mkdtemp(join(tmpdir(), 'ao3-extension-test-'))
 const extension = join(profile, 'extension')
 const buildBackend = local ? backend : 'https://extension-test.supabase.co'
 execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-extension.mjs', '--outDir', extension, ...(local ? ['--local'] : [])], { env: { ...process.env, EXTENSION_APP_ORIGIN: appOrigin, EXTENSION_LOCAL_APP_ORIGIN: 'http://127.0.0.1:5173', EXTENSION_LOCAL_SUPABASE_URL: local ? backend : `http://localhost:${address.port}`, EXTENSION_LOCAL_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test', VITE_SUPABASE_URL: buildBackend, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_a_real_key' }, stdio: 'pipe' })
 // Only temporary test artifacts use the HTTP fixture backend. Hosted builds
 // reject local backends so deployed pairing codes cannot target the wrong DB.
 for (const file of ['background.js', 'content.js', 'manifest.json']) {
  const path = join(extension, file)
  await writeFile(path, (await readFile(path, 'utf8')).replaceAll(buildBackend, backend))
 }
 // Only this temporary test artifact opens the shadow roots for Playwright.
 // The installed artifact keeps the same closed roots as the Safari companion.
 const contentPath = join(extension, 'content.js'), content = await readFile(contentPath, 'utf8')
 expect(content).toContain('mode: "closed"')
 await writeFile(contentPath, content.replaceAll('mode: "closed"', 'mode: "open"'))
 const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'))
 expect(manifest.content_scripts).toEqual([{ matches: ['https://archiveofourown.org/works/*', 'https://archiveofourown.org/series/*'], js: ['content.js'], run_at: 'document_end', all_frames: false }])
 const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [
  `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
  // Extension-created tabs can navigate before Playwright attaches its routes.
  // Fail those unmocked AO3 requests immediately so the page event cannot hang
  // on the live site; the explicit navigation below uses the fixture route.
  '--host-resolver-rules=MAP archiveofourown.org ~NOTFOUND', '--no-proxy-server',
 ] })
 let releaseImage: (() => void) | undefined
 try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const extensionId = new URL(worker.url()).host
  if (local) expect(extensionId).toBe(localExtensionId)
  const fixture = (await readFile('server/ao3/fixtures/work.html', 'utf8')).replace('<dl>', '<dl class="work meta">').replace('</head>', '<style>.summary blockquote { font-size: 14px; }</style></head>').replace('<h2 class="title heading">', '<main id="main"><div id="workskin"><h2 class="title heading">').replace('</body>', '</div><div id="kudos">Kudos</div></main></body>')
  await context.route(`${appOrigin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<html><body>Hosted library test</body></html>' }))
  let slowImage = new Promise<void>(resolve => { releaseImage = resolve })
  await context.route('https://archiveofourown.org/**', async route => {
   if (route.request().url().includes('/slow-image-')) {
    await slowImage
    await route.fulfill({ status: 204 })
   } else {
    let body = loaded ? fixture.replaceAll('/works/123', `/works/${workId}`).replace('</body>', `<img src="/slow-image-${workId}.png"></body>`) : '<html><body>This work could have adult content. Confirm in your browser.</body></html>'
    if (route.request().url().includes('/chapters/940')) body = body.replace(/<div class="summary module">[\s\S]*?<\/div>/, '<div id="chapters"><div class="chapter"><div class="summary module"><blockquote>CHAPTER SUMMARY ONLY</blockquote></div>PRIVATE CHAPTER TEXT</div></div>')
    await route.fulfill({ contentType: 'text/html', body })
   }
  })
  const ao3 = await context.newPage()
  await ao3.goto('https://archiveofourown.org/works/123')
  expect(uploads).toHaveLength(0)
  const app = await context.newPage()
  await app.goto(`${appOrigin}/imports`)
  queued = true // Represents the hosted website saving an explicit import/refresh request.
  const connectFrom = (page: Page, token = 'test-user-session') => page.evaluate(({ id, token }) => new Promise(resolve => {
   const api = (window as Window & { chrome?: { runtime: { sendMessage(id: string, body: object, callback: (result: unknown) => void): void } } }).chrome
   api?.runtime.sendMessage(id, { type: 'AO3_LIBRARY_CONNECT', token, expiresAt: Math.floor(Date.now() / 1000) + 3600 }, resolve)
  }), { id: extensionId, token })
  const connect = () => connectFrom(app)
  expect(await connect()).toEqual({ ok: true })
  await expect.poll(() => claimed).toBe(true)
  expect(uploads).toHaveLength(0) // Confirmation page is never uploaded.
  expect(context.pages().filter(page => page.url().startsWith('https://archiveofourown.org'))).toHaveLength(1)
  loaded = true
  await ao3.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => uploads.length, { timeout: 15000 }).toBe(1)
  expect(await ao3.evaluate(() => document.readyState)).toBe('interactive')
  releaseImage!()
  await ao3.waitForLoadState('load')
  expect(uploads[0]).toMatchObject({ jobId: 'requested-job', url: 'https://archiveofourown.org/works/123' })
  expect(uploads[0].html).toContain('A &amp; B')
  expect(uploads[0].html).toContain('12,345')
  expect(uploads[0].html).not.toContain('user[login]')
  await ao3.reload()
  expect(uploads).toHaveLength(1)
  // The native content script uses the real worker bridge and shared editor.
  expect(barRequests).toHaveLength(0) // Unpaired browsing never requests private library data.
  const bar = ao3.locator('#ao3-library-companion')
  const instructions = bar.locator('.toolbar-progress .inline-instructions')
  await expect(instructions).toBeVisible()
  const instructionBox = (await instructions.boundingBox())!, centerBox = (await bar.locator('.toolbar-progress').boundingBox())!
  const connectButton = bar.getByRole('button', { name: 'Connect Library', exact: true })
  const connectBox = (await connectButton.boundingBox())!
  expect(instructionBox.x + instructionBox.width / 2).toBeCloseTo(centerBox.x + centerBox.width / 2, 0)
  expect(instructionBox.y + instructionBox.height / 2).toBeCloseTo(connectBox.y + connectBox.height / 2, 0)
  await expect(connectButton).toHaveCSS('min-height', '32px')
  expect(connectBox.height).toBeLessThan(48)
  await expect(bar.locator('.brand-icon svg')).toHaveCSS('width', '18px')
  await connectButton.click()
  await expect(bar.locator('.inline-instructions')).toHaveCount(0)
  await bar.getByLabel('One-Time Pairing Code', { exact: true }).fill('one-time-code')
  await bar.getByRole('button', { name: 'Connect', exact: true }).click()
  await bar.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await bar.getByLabel('Private Notes', { exact: true }).fill('Saved directly from Chrome')
  await bar.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(bar.getByRole('status')).toHaveText('Saved')
  expect(barEntries.get(123)).toMatchObject({ notes: 'Saved directly from Chrome', metadata: { summary: 'A summary & more.', summary_html: '<p>A summary &amp; more.</p>', categories: ['M/M'], word_count: 12345 } })
  await expect(bar.locator('.library-link')).toHaveText('')
  await expect(bar.getByText('Ch. 0 / 6', { exact: true })).toBeVisible()
  const summaryFont = await ao3.locator('#workskin .summary blockquote').evaluate(element => getComputedStyle(element).fontSize)
  expect(summaryFont).toBe('14px')
  for (const surface of [bar, ao3.locator('#ao3-library-progress')]) {
   await expect(surface.locator('.reading-summary strong')).toHaveCSS('font-size', summaryFont)
  }
  await expect(bar.getByRole('button', { name: 'Edit', exact: true })).toHaveCSS('font-size', summaryFont)
  await expect(bar.locator('.settings-button')).toHaveCSS('width', '32px')
  await expect(bar.locator('.edit-button svg')).toHaveCSS('width', '18px')
  await expect(bar.locator('small a')).toHaveAttribute('href', `${appOrigin}/settings#ao3-browser-bar`)
  await ao3.reload()
  await bar.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(bar.getByLabel('Private Notes', { exact: true })).toHaveValue('Saved directly from Chrome')
  await bar.getByLabel('Private Notes', { exact: true }).fill('Edited directly from Chrome')
  await bar.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(bar.getByRole('status')).toHaveText('Saved')
  await ao3.locator('#ao3-library-progress').getByRole('button', { name: 'Mark through chapter 1 as read', exact: true }).click()
  await expect(bar.getByText('Ch. 1 / 6', { exact: true })).toBeVisible()
  expect(barEntries.get(123)).toMatchObject({ notes: 'Edited directly from Chrome', status: 'reading', progress: 1 })
  expect(await ao3.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
  expect(await ao3.evaluate(() => document.body.textContent)).not.toContain('paired-chrome-secret')
  // Saving from a later chapter retrieves the work summary from the first page.
  barEntries.delete(123)
  await ao3.goto('https://archiveofourown.org/works/123/chapters/940')
  await bar.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await bar.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(bar.getByRole('status')).toHaveText('Saved')
  expect(barEntries.get(123)).toMatchObject({ progress: 3, metadata: { summary: 'A summary & more.', categories: ['M/M'], word_count: 12345 } })
  expect(JSON.stringify(barEntries.get(123))).not.toMatch(/CHAPTER SUMMARY ONLY|PRIVATE CHAPTER TEXT/)
  // A newly opened work also captures early, not just an existing tab reload.
  workId = 456
  claimed = false
  slowImage = new Promise<void>(resolve => { releaseImage = resolve })
  const opened = context.waitForEvent('page')
  expect(await connect()).toEqual({ ok: true })
  const nextWork = await opened
  // Route the requested document through Playwright after the extension-created
  // target attaches; its initial navigation can precede route interception.
  await nextWork.goto('https://archiveofourown.org/works/456', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => uploads.length, { timeout: 15000 }).toBe(2)
  expect(uploads[1].url).toBe('https://archiveofourown.org/works/456')
  expect(await nextWork.evaluate(() => document.readyState)).toBe('interactive')
  releaseImage!()
  await nextWork.waitForLoadState('load')
  expect(uploads).toHaveLength(2)
  // Series previews reuse the same explicit-request boundary and never queue works.
  const seriesUrl = 'https://archiveofourown.org/series/77'
  const seriesFixture = (await readFile('server/ao3/fixtures/series.html', 'utf8')).replace('<dl class="stats"><dd', '<dl class="stats"><dd class="kudos">42</dd><dd')
  slowImage = new Promise<void>(resolve => { releaseImage = resolve })
  await context.route(seriesUrl, route => route.fulfill({ contentType: 'text/html', body: `<html><body>${seriesFixture}<img src="/slow-image-series.png"></body></html>` }))
  const series = await context.newPage()
  await series.goto(seriesUrl, { waitUntil: 'domcontentloaded' })
  await series.addStyleTag({ content: '.work.blurb { border: 1px solid #ccc; padding: 8px; } .work.blurb > dl.stats { float: right; margin: 0; }' })
  const preview = await app.evaluate(({ id, url }) => new Promise(resolve => {
   const api = (window as Window & { chrome?: { runtime: { sendMessage(id: string, body: object, callback: (result: unknown) => void): void } } }).chrome
   api?.runtime.sendMessage(id, { type: 'AO3_LIBRARY_PREVIEW_SERIES', url }, resolve)
  }), { id: extensionId, url: seriesUrl })
  expect(preview).toMatchObject({ ok: true, page: { url: seriesUrl } })
  expect((preview as { page: { html: string } }).page.html).toContain('The first story')
  expect(await series.evaluate(() => document.readyState)).toBe('interactive')
  releaseImage!()
  await series.waitForLoadState('load')
  expect(uploads).toHaveLength(2)
  await expect(series.locator('#ao3-library-companion').getByRole('button', { name: 'Add to Library', exact: true })).toBeVisible()
  expect(await series.locator('#series-stats').evaluate(element => element.nextElementSibling?.id)).toBe('ao3-library-companion')
  expect(await series.locator('.series.work.index').evaluate(element => element.previousElementSibling?.id)).toBe('ao3-library-companion')
  await expect(series.locator('#ao3-library-progress')).toHaveCount(0)
  for (const work of [101, 102]) {
   const tile = series.locator(`#ao3-library-work-${work}`)
   await expect(tile.getByRole('button', { name: 'Add to Library', exact: true })).toBeVisible()
   expect(await tile.evaluate(element => element.parentElement?.lastElementChild === element && element.previousElementSibling?.matches('dl.stats'))).toBe(true)
   await expect(tile.locator('..').locator('[id^="ao3-library-"]')).toHaveCount(1)
   const hostBox = (await tile.boundingBox())!, panelBox = (await tile.locator('section').first().boundingBox())!
   const statsBox = (await tile.locator('..').locator('dl.stats').boundingBox())!
   expect(panelBox.y - statsBox.y - statsBox.height).toBeCloseTo(20, 0)
   expect(hostBox.y + hostBox.height - panelBox.y - panelBox.height).toBeCloseTo(4, 0)
  }
  const tile = series.locator('#ao3-library-work-101')
  await tile.getByRole('button', { name: 'Add to Library', exact: true }).click()
  await tile.getByLabel('Private Notes', { exact: true }).fill('Saved from a series tile')
  await tile.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(tile.getByRole('status')).toHaveText('Saved')
  expect(barEntries.get(101)).toMatchObject({ notes: 'Saved from a series tile' })
  expect(barRequests.some(request => request.p_action === 'series_get' && request.p_work === 77)).toBe(true)
  if (!local) {
   queued = false
   await bar.getByRole('button', { name: 'Edit', exact: true }).click()
   await bar.getByLabel('Private Notes', { exact: true }).fill('Hosted draft retained')
   await expect(bar.getByLabel('Library environment: Hosted')).toBeVisible()
   const options = await context.newPage()
   await options.goto(`chrome-extension://${extensionId}/options.html`)
   await expect(options.getByLabel('Library environment')).toHaveValue('hosted')
   const localOrigin = 'http://127.0.0.1:5173'
   await context.route(`${localOrigin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<html><body>Local library test</body></html>' }))
   const localApp = await context.newPage()
   await localApp.goto(`${localOrigin}/settings`)
   const authCount = authentications.length
   expect(await connectFrom(localApp, 'test-local-session')).toMatchObject({ ok: false, error: expect.stringContaining('Select the matching') })
   expect(authentications).toHaveLength(authCount)

   async function switchTo(environment: string) {
    await options.getByLabel('Library environment').selectOption(environment)
    await options.getByRole('button', { name: 'Switch environment' }).click()
    await expect(options.getByRole('status')).toContainText('Environment saved.')
   }
   await options.evaluate(async () => {
    const api = (window as Window & { chrome: { storage: { local: { set(values: object): Promise<void> } } } }).chrome
    await api.storage.local.set({ librarySync: { id: 'hosted-paused-scan', userId: 'alice', status: 'running' } })
   })
   await options.getByLabel('Library environment').selectOption('local')
   await options.getByRole('button', { name: 'Switch environment' }).click()
   await expect(options.getByRole('status')).toContainText('Pause the running scan')
   await options.evaluate(async () => {
    const api = (window as Window & { chrome: { storage: { local: { set(values: object): Promise<void> } } } }).chrome
    await api.storage.local.set({ librarySync: { id: 'hosted-paused-scan', userId: 'alice', status: 'paused' } })
   })
   await switchTo('local')
   expect(await connectFrom(localApp, 'test-local-session')).toMatchObject({ ok: true })
   expect(authentications.at(-1)).toEqual({ host: `localhost:${address.port}`, authorization: 'Bearer test-local-session' })
   await expect(bar.getByRole('status')).toContainText('Environment changed to Local')
   const beforeStaleSave = barRequests.length
   await bar.getByRole('button', { name: 'Save', exact: true }).click()
   await expect(bar.getByRole('status')).toContainText('Environment changed.')
   expect(barRequests.length).toBe(beforeStaleSave)
   await ao3.reload()
   await expect(bar.getByLabel('Library environment: Local')).toBeVisible()
   await bar.getByRole('button', { name: 'Connect Library', exact: true }).click()
   await bar.getByLabel('One-Time Pairing Code', { exact: true }).fill('local-pairing-code')
   await bar.getByRole('button', { name: 'Connect', exact: true }).click()
   await bar.getByRole('button', { name: 'Add to Library', exact: true }).click()
   await bar.getByLabel('Private Notes', { exact: true }).fill('Local draft retained')
   const claims = barRequests.filter(request => request.p_action === 'claim').length
   await switchTo('hosted')
   const retainedImport = await app.evaluate(({ id, url }) => new Promise(resolve => {
    const api = (window as Window & { chrome: { runtime: { sendMessage(id: string, body: object, callback: (reply: unknown) => void): void } } }).chrome
    api.runtime.sendMessage(id, { type: 'AO3_LIBRARY_PREVIEW_SERIES', url }, resolve)
   }), { id: extensionId, url: seriesUrl })
   expect(retainedImport).toMatchObject({ ok: true })
   await ao3.reload()
   await bar.getByRole('button', { name: 'Edit', exact: true }).click()
   await expect(bar.getByLabel('Private Notes', { exact: true })).toHaveValue('Hosted draft retained')
   await switchTo('local')
   await ao3.reload()
   await bar.getByRole('button', { name: 'Add to Library', exact: true }).click()
   await expect(bar.getByLabel('Private Notes', { exact: true })).toHaveValue('Local draft retained')
   expect(barRequests.filter(request => request.p_action === 'claim')).toHaveLength(claims)
   await options.reload()
   await expect(options.getByLabel('Library environment')).toHaveValue('local')
  }
  if (local) {
   // Sample listing scans authenticate only with the local website boundary.
   queued = false
   type SyncReply = { ok: boolean; error?: string; state?: { status: string; pages: number; startPage: number; endPage: number; limited: boolean }; rows?: { title: string }[] }
   const command = (body: object) => app.evaluate(({ id, body }) => new Promise<SyncReply>(resolve => {
    const api = (window as Window & { chrome: { runtime: { sendMessage(id: string, body: object, callback: (reply: SyncReply) => void): void } } }).chrome
    api.runtime.sendMessage(id, body, resolve)
   }), { id: extensionId, body })
   await expect.poll(() => command({ type: 'AO3_LIBRARY_SAMPLE_CONNECT' })).toEqual({ ok: true })
   expect(await command({ type: 'AO3_LIBRARY_CAPTURE_WORK', url: 'https://archiveofourown.org/works/123' })).toMatchObject({ ok: true, page: { url: expect.stringMatching(/^https:\/\/archiveofourown\.org\/works\/123(?:\/chapters\/[1-9]\d*)?(?:[?#].*)?$/) } })
   const listing = 'https://archiveofourown.org/users/alice/bookmarks'
   slowImage = new Promise<void>(resolve => { releaseImage = resolve })
   await context.route('https://archiveofourown.org/users/alice/bookmarks*', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="main" class="bookmarks-index"><ol class="bookmark index"><li class="bookmark" id="bookmark_987"><h4 class="heading"><a href="/works/789">Sample scanned work</a></h4></li><li class="bookmark blurb group" id="bookmark_988"><p class="message">This has been deleted, sorry!</p><div class="user"><div class="notes"><p>Keep this bookmark note</p></div></div></li></ol><ol class="pagination"><li><a href="?page=3">Next</a></li></ol></div><img src="/slow-image-listing.png"></body></html>' }))
   const openedScan = context.waitForEvent('page', { timeout: 45000 })
   const started = await command({ type: 'AO3_LIBRARY_SYNC', action: 'start', url: listing, mode: 'full', startPage: 2, endPage: 2 })
   expect(started).toMatchObject({ ok: true, state: { startPage: 2, endPage: 2, limited: true } })
   const scan = await openedScan
   const scanUrl = new URL(listing)
   scanUrl.searchParams.set('bookmark_search[sort_column]', 'created_at'); scanUrl.searchParams.set('bookmark_search[sort_direction]', 'desc'); scanUrl.searchParams.set('page', '2')
   await scan.goto(scanUrl.href, { waitUntil: 'domcontentloaded' })
   // The initial extension-created navigation can precede fixture interception
   // and hit the intentionally blocked live host. Resume through the same tab
   // once Playwright has attached, as a user would after resolving an outage.
   const captured = await command({ type: 'AO3_LIBRARY_SYNC', action: 'status' })
   if (captured.state?.status === 'paused') expect((await command({ type: 'AO3_LIBRARY_SYNC', action: 'resume' })).ok).toBe(true)
   await expect.poll(async () => (await command({ type: 'AO3_LIBRARY_SYNC', action: 'status' })).state?.status, { timeout: 40000 }).toBe('ready')
   expect((await command({ type: 'AO3_LIBRARY_SYNC', action: 'page', page: 2 })).rows).toEqual([expect.objectContaining({ title: 'Sample scanned work', work_status: 'available' }), expect.objectContaining({ work_status: 'deleted', title: '', link: 'https://archiveofourown.org/bookmarks/988', 'bookmark id': '988', 'bookmark notes': 'Keep this bookmark note' })])
   expect(await scan.evaluate(() => document.readyState)).toBe('interactive')
   releaseImage!()
   await scan.waitForLoadState('load')
   expect(scan.url()).toContain('page=2')
   expect(await command({ type: 'AO3_LIBRARY_SYNC', action: 'open-tab' })).toMatchObject({ ok: true })
   expect((await command({ type: 'AO3_LIBRARY_SYNC', action: 'finish' })).ok).toBe(true)
   // Exercise the packaged capture function through Chrome's isolated world.
   await scan.locator('h4.heading > a').first().evaluate(element => element.setAttribute('href', 'http://['))
   const backgroundSource = await readFile(join(extension, 'background.js'), 'utf8')
   const captureFunction = backgroundSource.slice(backgroundSource.indexOf('function captureListingPage('), backgroundSource.indexOf('function listingUrl('))
   expect(captureFunction).toContain('AO3 listing capture failed:')
   const failedCapture = await worker.evaluate(`(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://archiveofourown.org/users/alice/bookmarks*' });
    return chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: ${captureFunction}, args: ['bookmarks'] });
   })()`)
   expect(failedCapture).toMatchObject([{ result: { attention: 'page_error', error: expect.stringMatching(/^AO3 listing capture failed:/) } }])
   expect(uploads).toHaveLength(2)
  }


 } finally {
  releaseImage?.()
  await context.close()
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await rm(profile, { recursive: true, force: true })
 }
})
}
