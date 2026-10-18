// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { parseSeries, retrieveSeries } from './series'
import { seriesHandler } from './series-handler'
const html = readFileSync(new URL('./fixtures/series.html', import.meta.url), 'utf8')
const url = 'https://archiveofourown.org/series/77'
it('extracts ordered work previews with original positions, summaries, tags and zero-word art', () => {
 const preview = parseSeries(html, url)
 expect(preview).toMatchObject({ seriesId: 77, title: 'A & B', description: 'Stories and extras.' })
 expect(preview.works).toHaveLength(2)
 expect(preview.works[0]).toMatchObject({ workId: 101, position: 1, authors: ['One'], wordCount: 12345, chapters: '2/2', complete: true, summary: 'A beginning.', tags: ['Fandom', 'Adventure'] })
 expect(preview.works[1]).toMatchObject({ workId: 102, position: 4, wordCount: 0, complete: false, tags: ['Fanart'] })
})
it('rejects unavailable, different, and paginated listings rather than returning misleading previews', () => {
 expect(() => parseSeries('<h2 class="heading">Sign in</h2>', url)).toThrow('Series preview is unavailable')
 expect(() => parseSeries(html, 'https://archiveofourown.org/series/78')).toThrow('different series')
 expect(() => parseSeries(html + '<ol class="pagination"><li class="next"><a>Next</a></li></ol>', url)).toThrow('more pages')
})
it('fetches only the normalized listing, never follows redirects or loads its works', async () => {
 const fetcher = vi.fn().mockResolvedValue(new Response(html, { headers: { 'content-type': 'text/html' } }))
 expect((await retrieveSeries(url + '?x=1', fetcher)).preview?.works).toHaveLength(2)
 expect(fetcher).toHaveBeenCalledTimes(1)
 expect(fetcher.mock.calls[0][0]).toBe(url)
 fetcher.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://evil.example' } }))
 expect((await retrieveSeries(url, fetcher)).failure?.category).toBe('redirect')
 expect(fetcher).toHaveBeenCalledTimes(2)
})
function setup() {
 const deps = { authenticate: vi.fn().mockResolvedValue(true), reserve: vi.fn().mockResolvedValue(true), pause: vi.fn().mockResolvedValue(undefined), retrieve: vi.fn().mockResolvedValue({ preview: parseSeries(html, url), failure: null }) }
 return { deps, handler: seriesHandler(deps) }
}
function request(body: object, token = 'session') { return new Request('https://library.example/series-preview', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }) }
it('authenticates and validates URLs before fetching; respects hosted pacing', async () => {
 const { deps, handler } = setup()
 deps.authenticate.mockResolvedValueOnce(false)
 expect((await handler(request({ url }))).status).toBe(401)
 expect(deps.reserve).not.toHaveBeenCalled()
 expect((await handler(request({ url: 'https://evil.example/series/77' }))).status).toBe(400)
 deps.reserve.mockResolvedValue(false)
 expect((await handler(request({ url }))).status).toBe(429)
 expect(deps.retrieve).not.toHaveBeenCalled()
})
it('parses authenticated browser snapshots without hosted AO3 traffic, and bounds input', async () => {
 const { deps, handler } = setup()
 expect(await (await handler(request({ url, html }))).json()).toMatchObject({ preview: { seriesId: 77 } })
 expect(deps.reserve).not.toHaveBeenCalled()
 expect(deps.retrieve).not.toHaveBeenCalled()
 expect((await handler(request({ url, html: 'x'.repeat(1_000_001) }))).status).toBe(413)
})
it('propagates AO3 rate limits into the shared worker pause', async () => {
 const { deps, handler } = setup()
 deps.retrieve.mockResolvedValue({ preview: null, failure: { pauseSeconds: 3600, category: 'rate_limited' } } as never)
 expect((await handler(request({ url }))).status).toBe(422)
 expect(deps.pause).toHaveBeenCalledWith(3600, 'rate_limited')
})
