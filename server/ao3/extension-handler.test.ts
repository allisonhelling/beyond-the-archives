// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeEach, expect, it, vi } from 'vitest'
import { extensionHandler, type ExtensionJob } from './extension-handler'

const html = readFileSync(new URL('./fixtures/work.html', import.meta.url), 'utf8')
const job: ExtensionJob = { id: 'job', userId: 'alice', token: 'lease', workId: 123, expiresAt: new Date(Date.now() + 300000).toISOString(), status: 'processing', mode: 'extension' }
const authenticate = vi.fn(), findJob = vi.fn(), finish = vi.fn()
const handler = extensionHandler({ authenticate, job: findJob, finish })
function request(input: object = {}, token = 'session') {
 return new Request('https://project.supabase.co/functions/v1/extension-metadata', { method: 'POST', headers: { authorization: `Bearer ${token}`, origin: `chrome-extension://${'a'.repeat(32)}` }, body: JSON.stringify({ jobId: job.id, token: job.token, url: 'https://archiveofourown.org/works/123', html, ...input }) })
}
beforeEach(() => { vi.resetAllMocks(); authenticate.mockResolvedValue('alice'); findJob.mockResolvedValue(job); finish.mockResolvedValue(true) })
it('parses snapshots through the existing validated parser and commits only the owned live request', async () => {
 const response = await handler(request())
 expect(await response.json()).toEqual({ committed: true })
 expect(finish).toHaveBeenCalledWith(job, expect.objectContaining({ metadata: expect.objectContaining({ title: 'A & B', authors: ['One', 'Two'] }) }))
 expect(response.headers.get('cache-control')).toBe('no-store')
})
it('rejects missing authentication before looking up jobs or parsing HTML', async () => {
 authenticate.mockResolvedValue(null)
 expect((await handler(request())).status).toBe(401)
 expect(findJob).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled()
})
it.each([
 { userId: 'bob' }, { token: 'other' }, { mode: 'direct' }, { status: 'cancelled' }, { expiresAt: '2020-01-01T00:00:00Z' },
])('rejects unauthorized or stale requests: %j', async changes => {
 findJob.mockResolvedValue({ ...job, ...changes })
 expect((await handler(request())).status).toBe(409)
 expect(finish).not.toHaveBeenCalled()
})
it('waits for login, confirmation, and valid work metadata without committing failure pages', async () => {
 for (const page of ['<h1>Checking your browser</h1>', '<p>This work could have adult content</p>', '<h2 class="title">Missing identity</h2>']) {
  expect(await (await handler(request({ html: page }))).json()).toMatchObject({ waiting: true })
 }
 expect(finish).not.toHaveBeenCalled()
 expect((await handler(request({ url: 'https://archiveofourown.org/works/456' }))).status).toBe(400)
})
it('finishes an explicit AO3 404 so the app can ask the owner before marking deletion', async () => {
 expect(await (await handler(request({ html: '<div id="main"><h2>Error 404</h2><p>The page you were looking for doesn\'t exist.</p></div>' }))).json()).toEqual({ committed: true })
 expect(finish).toHaveBeenCalledWith(job, expect.objectContaining({ category: 'not_found', metadata: null, retryable: false }))
})
it('bounds input, supports preflight, and finishes timeout as an explicit retry', async () => {
 expect((await handler(request({ html: 'x'.repeat(1000001) }))).status).toBe(413)
 expect(finish).not.toHaveBeenCalled()
 expect((await handler(new Request('https://project.supabase.co', { method: 'OPTIONS' }))).status).toBe(204)
 await handler(request({ timedOut: true }))
 expect(finish).toHaveBeenCalledWith(job, expect.objectContaining({ metadata: null, category: 'extension_waiting', retryable: true }))
 finish.mockResolvedValue(false)
 expect((await handler(request())).status).toBe(409)
})

it('requires a matching chapter index for bookmark dates and reports missing release dates', async () => {
 findJob.mockResolvedValue({ ...job, chapterDates: true })
 await handler(request())
 expect(finish).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ category: 'chapter_dates_unavailable', retryable: true }))
 expect((await handler(request({ navigationUrl: 'https://archiveofourown.org/works/999/navigate', navigationHtml: '<ol></ol>' }))).status).toBe(400)
 const navigationHtml = `<ol>${Array.from({ length: 6 }, (_, i) => `<li><a href="/works/123/chapters/${910 + i}">${i + 1}. Chapter</a><span class="datetime">(2024-01-01)</span></li>`).join('')}</ol>`
 await handler(request({ navigationUrl: 'https://archiveofourown.org/works/123/navigate', navigationHtml }))
 expect(finish).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ metadata: expect.objectContaining({ chapter_dates: expect.objectContaining({ '6': '2024-01-01' }) }) }))
})

it('accepts archived snapshots only for a matching archived job and never substitutes the live page', async () => {
 const sourceUrl = 'https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/123'
 expect((await handler(request({ url: sourceUrl }))).status).toBe(400)
 findJob.mockResolvedValue({ ...job, sourceUrl })
 expect((await handler(request())).status).toBe(400)
 expect(await (await handler(request({ url: sourceUrl }))).json()).toEqual({ committed: true })
 expect(finish).toHaveBeenCalledWith(expect.objectContaining({ sourceUrl }), expect.objectContaining({ metadata: expect.objectContaining({ title: 'A & B' }) }))
})
