import { chromium, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
 // Use real HTTP for extension-worker fetches. Browser route interception can
 // delay delivery until the worker's next alarm, obscuring the actual flow.
 const server = createServer(async (request, response) => {
  const path = new URL(request.url!, 'http://127.0.0.1').pathname
  let body: unknown
  if (path === '/auth/v1/user') body = { id: 'alice' }
  else if (path === '/rest/v1/rpc/claim_extension_job') {
   body = queued && !claimed ? { id: 'requested-job', token: 'requested-lease', workId, expiresAt: new Date(Date.now() + 300000).toISOString() } : null
   if (body) claimed = true
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
 execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-extension.mjs', '--outDir', extension, ...(local ? ['--local'] : [])], { env: { ...process.env, EXTENSION_APP_ORIGIN: appOrigin, EXTENSION_LOCAL_APP_ORIGIN: appOrigin, VITE_SUPABASE_URL: backend, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_a_real_key' }, stdio: 'pipe' })
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
  const fixture = (await readFile('server/ao3/fixtures/work.html', 'utf8')).replace('<dl>', '<dl class="work meta">')
  await context.route(`${appOrigin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<html><body>Hosted library test</body></html>' }))
  let slowImage = new Promise<void>(resolve => { releaseImage = resolve })
  await context.route('https://archiveofourown.org/**', async route => {
   if (route.request().url().includes('/slow-image-')) {
    await slowImage
    await route.fulfill({ status: 204 })
   } else await route.fulfill({ contentType: 'text/html', body: loaded ? fixture.replaceAll('/works/123', `/works/${workId}`).replace('</body>', `<img src="/slow-image-${workId}.png"></body>`) : '<html><body>This work could have adult content. Confirm in your browser.</body></html>' })
  })
  const ao3 = await context.newPage()
  await ao3.goto('https://archiveofourown.org/works/123')
  expect(uploads).toHaveLength(0)
  const app = await context.newPage()
  await app.goto(`${appOrigin}/imports`)
  queued = true // Represents the hosted website saving an explicit import/refresh request.
  const connect = () => app.evaluate(id => new Promise(resolve => {
   const api = (window as Window & { chrome?: { runtime: { sendMessage(id: string, body: object, callback: (result: unknown) => void): void } } }).chrome
   api?.runtime.sendMessage(id, { type: 'AO3_LIBRARY_CONNECT', token: 'test-user-session', expiresAt: Math.floor(Date.now() / 1000) + 3600 }, resolve)
  }), extensionId)
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
  const seriesFixture = await readFile('server/ao3/fixtures/series.html', 'utf8')
  await context.route(seriesUrl, route => route.fulfill({ contentType: 'text/html', body: seriesFixture }))
  const series = await context.newPage()
  await series.goto(seriesUrl)
  const preview = await app.evaluate(({ id, url }) => new Promise(resolve => {
   const api = (window as Window & { chrome?: { runtime: { sendMessage(id: string, body: object, callback: (result: unknown) => void): void } } }).chrome
   api?.runtime.sendMessage(id, { type: 'AO3_LIBRARY_PREVIEW_SERIES', url }, resolve)
  }), { id: extensionId, url: seriesUrl })
  expect(preview).toMatchObject({ ok: true, page: { url: seriesUrl } })
  expect((preview as { page: { html: string } }).page.html).toContain('The first story')
  expect(uploads).toHaveLength(2)
  if (local) {
   // Sample listing scans authenticate only with the local website boundary.
   queued = false
   type SyncReply = { ok: boolean; error?: string; state?: { status: string; pages: number; startPage: number; endPage: number; limited: boolean }; rows?: { title: string }[] }
   const command = (body: object) => app.evaluate(({ id, body }) => new Promise<SyncReply>(resolve => {
    const api = (window as Window & { chrome: { runtime: { sendMessage(id: string, body: object, callback: (reply: SyncReply) => void): void } } }).chrome
    api.runtime.sendMessage(id, body, resolve)
   }), { id: extensionId, body })
   expect(await command({ type: 'AO3_LIBRARY_SAMPLE_CONNECT' })).toEqual({ ok: true })
   expect(await command({ type: 'AO3_LIBRARY_CAPTURE_WORK', url: 'https://archiveofourown.org/works/123' })).toMatchObject({ ok: true, page: { url: 'https://archiveofourown.org/works/123' } })
   const listing = 'https://archiveofourown.org/users/alice/bookmarks'
   await context.route('https://archiveofourown.org/users/alice/bookmarks*', route => route.fulfill({ contentType: 'text/html', body: '<div id="main" class="bookmarks-index"><ol class="bookmark index"><li class="bookmark" id="bookmark_987"><h4 class="heading"><a href="/works/789">Sample scanned work</a></h4></li><li class="bookmark blurb group" id="bookmark_988"><p class="message">This has been deleted, sorry!</p><div class="user"><div class="notes"><p>Keep this bookmark note</p></div></div></li></ol><ol class="pagination"><li><a href="?page=3">Next</a></li></ol></div>' }))
   const openedScan = context.waitForEvent('page', { timeout: 45000 })
   const started = await command({ type: 'AO3_LIBRARY_SYNC', action: 'start', url: listing, mode: 'full', startPage: 2, endPage: 2 })
   expect(started).toMatchObject({ ok: true, state: { startPage: 2, endPage: 2, limited: true } })
   const scan = await openedScan
   const scanUrl = new URL(listing)
   scanUrl.searchParams.set('bookmark_search[sort_column]', 'created_at'); scanUrl.searchParams.set('bookmark_search[sort_direction]', 'desc'); scanUrl.searchParams.set('page', '2')
   await scan.goto(scanUrl.href)
   // The initial extension-created navigation can precede fixture interception
   // and hit the intentionally blocked live host. Resume through the same tab
   // once Playwright has attached, as a user would after resolving an outage.
   const captured = await command({ type: 'AO3_LIBRARY_SYNC', action: 'status' })
   if (captured.state?.status === 'paused') expect((await command({ type: 'AO3_LIBRARY_SYNC', action: 'resume' })).ok).toBe(true)
   await expect.poll(async () => (await command({ type: 'AO3_LIBRARY_SYNC', action: 'status' })).state?.status, { timeout: 40000 }).toBe('ready')
   expect((await command({ type: 'AO3_LIBRARY_SYNC', action: 'page', page: 2 })).rows).toEqual([expect.objectContaining({ title: 'Sample scanned work', work_status: 'available' }), expect.objectContaining({ work_status: 'deleted', title: '', link: 'https://archiveofourown.org/bookmarks/988', 'bookmark id': '988', 'bookmark notes': 'Keep this bookmark note' })])
   expect(scan.url()).toContain('page=2')
   expect((await command({ type: 'AO3_LIBRARY_SYNC', action: 'open-tab' })).ok).toBe(true)
   expect((await command({ type: 'AO3_LIBRARY_SYNC', action: 'finish' })).ok).toBe(true)
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
