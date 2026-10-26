import { afterEach, expect, it, vi } from 'vitest'
import { fetchWithLayout } from './layout-fetch'

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
