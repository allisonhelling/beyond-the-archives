import { chromium, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'

test('built extension captures requested metadata before full load without duplicate uploads', async ({ browserName }, info) => {
 test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'Chrome/Edge extension; separate persistent Chromium context.')
 test.setTimeout(90000) // Cold persistent Chromium startup plus service-worker wake-up.
 const appOrigin = 'https://library-extension-test.example'
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
 execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-extension.mjs', '--outDir', extension], { env: { ...process.env, EXTENSION_APP_ORIGIN: appOrigin, VITE_SUPABASE_URL: backend, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_a_real_key' }, stdio: 'pipe' })
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

 } finally {
  releaseImage?.()
  await context.close()
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await rm(profile, { recursive: true, force: true })
 }
})
