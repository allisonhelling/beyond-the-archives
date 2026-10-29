import { afterEach, expect, it, vi } from 'vitest'
import { fetchWithLayout } from './layout-fetch'
import { activitySnapshot } from './activity'

afterEach(() => vi.unstubAllGlobals())
it('preserves authentication and SDK headers while tagging each request with its current layout', async () => {
 const request = vi.fn().mockResolvedValue(new Response('{}'))
 vi.stubGlobal('fetch', request)
 for (const [width, layout] of [[390, 'mobile'], [1440, 'desktop']] as const) {
  vi.stubGlobal('innerWidth', width)
  await fetchWithLayout('https://example.test/rest/v1/rpc/submit_import_urls', { method: 'POST', headers: { authorization: 'Bearer test', 'x-client-info': 'supabase-js-web/test' }, body: '{}' })
  const init = request.mock.lastCall![1] as RequestInit
  const headers = new Headers(init.headers)
  expect(headers.get('authorization')).toBe('Bearer test')
  expect(headers.get('x-client-info')).toBe(`supabase-js-web/test ao3-library/${layout}`)
  expect(init.body).toBe('{}')
 }
})
it('preserves headers carried by a Request object', async () => {
 const request = vi.fn().mockResolvedValue(new Response('{}'))
 vi.stubGlobal('fetch', request)
 await fetchWithLayout(new Request('https://example.test/rest/v1/', { headers: { apikey: 'public-test-key' } }))
 expect(new Headers(request.mock.lastCall![1].headers).get('apikey')).toBe('public-test-key')
})
it('keeps overlapping requests visible until success and failure both settle', async () => {
 let resolve!: (response: Response) => void, reject!: (error: Error) => void
 vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done })).mockImplementationOnce(() => new Promise<Response>((_done, fail) => { reject = fail })))
 const first = fetchWithLayout('https://example.test/first'), second = fetchWithLayout('https://example.test/second')
 const failure = expect(second).rejects.toThrow('Network unavailable')
 expect(activitySnapshot()).toBe('Loading…')
 resolve(new Response('{}'))
 await first
 expect(activitySnapshot()).toBe('Loading…')
 reject(new Error('Network unavailable'))
 await failure
 expect(activitySnapshot()).toBe('')
})
it('clears cancelled requests while preserving their cancellation signal', async () => {
 const controller = new AbortController()
 vi.stubGlobal('fetch', vi.fn((_input, init: RequestInit) => new Promise((_resolve, reject) => {
  init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
 })))
 const request = fetchWithLayout('https://example.test/cancelled', { signal: controller.signal })
 const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' })
 controller.abort()
 await assertion
 expect(activitySnapshot()).toBe('')
})
