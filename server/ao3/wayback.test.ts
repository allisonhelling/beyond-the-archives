// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { classifyCapture, findWaybackSnapshot, waybackHandler, type WaybackResult } from './wayback'
const base = 'https://archiveofourown.org/works/123'
const replay = (date: string, url = base) => `https://web.archive.org/web/${date}/${url}`
const work = readFileSync(new URL('./fixtures/work.html', import.meta.url), 'utf8')
const login = readFileSync(new URL('./fixtures/restricted.html', import.meta.url), 'utf8')
const warning = `<div id="main"><p>This work could have adult content.</p><a href="${base}?view_adult=true">Proceed</a></div>`
const indexResponse = (rows: string[][]) => Response.json([['timestamp', 'original', 'statuscode', 'mimetype'], ...rows])
const row = (date: string, url = base) => [date, url, '200', 'text/html']
it('accepts work pages with normal header login forms and adult warnings only for the same work', () => {
 expect(classifyCapture(work, 123, replay('20260101000000'))).toBe('work')
 expect(classifyCapture(warning, 123, replay('20260101000000'))).toBe('adult_warning')
 for (const html of [login, '<h1>Wayback unavailable</h1>', warning.replace('/works/123?', '/works/456?'), work.replaceAll('/works/123', '/works/456')]) expect(classifyCapture(html, 123, replay('20260101000000'))).toBeNull()
})
it('checks captures newest first, skips login-only captures, and returns an older verified page', async () => {
 const checked: string[] = []
 const fetcher = vi.fn(async (input: string | URL | Request) => {
  const url = String(input)
  if (url.includes('/cdx/')) return indexResponse([row('20260101000000'), row('20260201000000')])
  checked.push(url)
  return new Response(url.includes('202602') ? login : work)
 })
 expect(await findWaybackSnapshot(base, fetcher)).toEqual({ url: replay('20260101000000'), kind: 'work', checked: 2 })
 expect(checked[0]).toContain('20260201000000id_')
 expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('https://web.archive.org/'))).toBe(true)
})
it('finds an adult-confirmed variant without changing archive URLs to live AO3', async () => {
 const variant = `${base}?view_full_work=true&view_adult=true`
 const fetcher = vi.fn(async (input: string | URL | Request) => String(input).includes('/cdx/') ? indexResponse(new URL(String(input)).searchParams.get('url') === variant ? [row('20260201000000', variant)] : []) : new Response(warning))
 expect(await findWaybackSnapshot(base, fetcher)).toMatchObject({ url: replay('20260201000000', variant), kind: 'adult_warning' })
})
it('rejects foreign identities and redirects outside the archive without fetching their destinations', async () => {
 const fetcher = vi.fn(async (input: string | URL | Request) => String(input).includes('/cdx/') ? indexResponse([row('20260201000000', 'https://evil.test/works/123'), row('20260101000000')]) : new Response(null, { status: 302, headers: { location: base } }))
 expect(await findWaybackSnapshot(base, fetcher)).toMatchObject({ kind: 'calendar', reason: 'unverified' })
 expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('https://web.archive.org/'))).toBe(true)
 await expect(findWaybackSnapshot('https://evil.test/works/123', fetcher)).rejects.toThrow()
})
it('follows only fixed captures of the same work and validates the final page', async () => {
 let redirected = false
 const next = replay('20250101000000')
 const fetcher = vi.fn(async (input: string | URL | Request) => {
  if (String(input).includes('/cdx/')) return indexResponse([row('20260101000000')])
  if (!redirected) { redirected = true; return new Response(null, { status: 302, headers: { location: next } }) }
  return new Response(work)
 })
 expect(await findWaybackSnapshot(base, fetcher)).toMatchObject({ url: next, kind: 'work' })
})
it('distinguishes empty indexes, unreadable captures, and unavailable archive services', async () => {
 expect(await findWaybackSnapshot(base, vi.fn(async () => Response.json([])))).toMatchObject({ kind: 'calendar', reason: 'not_found', checked: 0 })
 expect(await findWaybackSnapshot(base, vi.fn(async input => String(input).includes('/cdx/') ? indexResponse([row('20260101000000')]) : new Response(login)))).toMatchObject({ kind: 'calendar', reason: 'unverified', checked: 1 })
 const limited = vi.fn(async () => new Response(null, { status: 429 }))
 expect(await findWaybackSnapshot(base, limited)).toMatchObject({ kind: 'calendar', reason: 'unavailable', checked: 0 })
 expect(limited).toHaveBeenCalledTimes(2)
})
it('bounds verification attempts and handles malformed indexes and oversized pages', async () => {
 const checked = new Set<string>()
 const fetcher = vi.fn(async (input: string | URL | Request) => {
  const url = String(input)
  if (url.includes('/cdx/')) { const original = new URL(url).searchParams.get('url')!; return indexResponse(Array.from({ length: 5 }, (_, index) => row(`2026010${index + 1}000000`, original))) }
  checked.add(url); return new Response(login)
 })
 expect(await findWaybackSnapshot(base, fetcher)).toMatchObject({ kind: 'calendar', checked: 8 })
 expect(checked.size).toBe(8)
 expect(await findWaybackSnapshot(base, vi.fn(async () => Response.json({ broken: true })))).toMatchObject({ reason: 'unavailable' })
 expect(await findWaybackSnapshot(base, vi.fn(async input => String(input).includes('/cdx/') ? indexResponse([row('20260101000000')]) : new Response('x'.repeat(4_000_001))))).toMatchObject({ reason: 'unavailable' })
})
function request(url = base, token = 'valid') { return new Request('https://backend.test', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ url }) }) }
it('authenticates before lookup and rejects invalid inputs and methods', async () => {
 const lookup = vi.fn().mockResolvedValue({ url: replay('20260101000000'), kind: 'work', checked: 1 })
 const handler = waybackHandler({ authenticate: async token => token === 'valid', lookup })
 expect((await handler(request(base, 'invalid'))).status).toBe(401)
 expect((await handler(request('https://evil.test/works/123'))).status).toBe(400)
 expect((await handler(new Request('https://backend.test'))).status).toBe(405)
 expect((await handler(new Request('https://backend.test', { method: 'OPTIONS' }))).status).toBe(204)
 expect(lookup).not.toHaveBeenCalled()
 expect((await handler(request())).status).toBe(200)
 expect((await handler(request())).status).toBe(200)
 expect(lookup).toHaveBeenCalledOnce()
})
it('coalesces repeated work lookups, caps concurrency, and does not cache archive outages', async () => {
 const releases: ((result: WaybackResult) => void)[] = []
 const lookup = vi.fn(() => new Promise<WaybackResult>(done => { releases.push(done) }))
 const handler = waybackHandler({ authenticate: async () => true, lookup })
 const first = handler(request()), same = handler(request())
 await vi.waitFor(() => expect(lookup).toHaveBeenCalledOnce())
 const other = handler(request('https://archiveofourown.org/works/456'))
 await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(2))
 expect((await handler(request('https://archiveofourown.org/works/789'))).status).toBe(429)
 const outage: WaybackResult = { url: `https://web.archive.org/web/*/${base}`, kind: 'calendar', checked: 0, reason: 'unavailable' }
 releases.forEach(done => done(outage))
 await Promise.all([first, same, other])
 const retry = handler(request())
 await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(3))
 releases[2](outage)
 expect((await retry).status).toBe(200)
})

it('also verifies an already saved fixed snapshot if indexes no longer list it', async () => {
 const saved = replay('20250101000000')
 const fetcher = vi.fn(async input => String(input).includes('/cdx/') ? Response.json([]) : new Response(work))
 expect(await findWaybackSnapshot(saved, fetcher)).toMatchObject({ kind: 'work', url: saved, checked: 1 })
})
