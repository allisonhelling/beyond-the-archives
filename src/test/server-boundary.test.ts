// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { accountHandler } from '../../supabase/functions/_shared/account-handler'
// @ts-expect-error Server operator utility is intentionally Node-only JavaScript.
import { inviteUser } from '../../server/invite-user.mjs'

describe('server authentication boundary', () => {
  const origin = 'https://library.example'
  it('rejects missing, malformed, invalid, and expired credentials', async () => {
    const verify = vi.fn().mockResolvedValue(null)
    const handle = accountHandler(verify, origin)
    for (const authorization of ['', 'Basic token', 'Bearer invalid', 'Bearer expired']) {
      const response = await handle(new Request(origin, { headers: { authorization } }))
      expect(response.status).toBe(401)
      expect(await response.text()).not.toContain('user_id')
    }
    expect(verify).toHaveBeenCalledTimes(2)
  })
  it('returns only the authenticated identity with no-store headers', async () => {
    const verify = vi.fn().mockResolvedValue({ id: 'verified-user', sensitive: 'hidden' })
    const response = await accountHandler(verify, origin)(new Request(origin, { headers: { authorization: 'Bearer verified', origin } }))
    expect(await response.json()).toEqual({ user_id: 'verified-user', schema_version: 1 })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  })
  it('does not trust a user ID supplied in request data', async () => {
    const response = await accountHandler(async () => ({ id: 'actual-user' }), origin)(new Request(`${origin}?user_id=victim`, { method: 'POST', headers: { authorization: 'Bearer real-token' }, body: '{"user_id":"victim"}' }))
    expect(await response.json()).toEqual({ user_id: 'actual-user', schema_version: 1 })
  })
  it('rejects unrelated origins and supports preflight only for the configured origin', async () => {
    const handler = accountHandler(async () => null, origin)
    expect((await handler(new Request(origin, { headers: { origin: 'https://attacker.example' } }))).status).toBe(403)
    expect((await handler(new Request(origin, { method: 'OPTIONS', headers: { origin } }))).status).toBe(204)
  })
  it('fails safely on Auth outages and rejects unsupported methods', async () => {
    const handler = accountHandler(async () => { throw new Error('secret details') }, origin)
    const response = await handler(new Request(origin, { headers: { authorization: 'Bearer token' } }))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret details')
    expect((await handler(new Request(origin, { method: 'DELETE' }))).status).toBe(405)
  })
  it('keeps invitation administration on the server and disables token persistence', async () => {
    const invite = vi.fn().mockResolvedValue({ error: null })
    const factory = vi.fn().mockReturnValue({ auth: { admin: { inviteUserByEmail: invite } } })
    await inviteUser({ url: 'http://127.0.0.1:54321', secret: 'server-only-test-secret', email: 'reader@example.test', redirectTo: 'http://127.0.0.1:5173' }, factory, async () => ({url:'http://127.0.0.1:54321',secretKey:'server-only-test-secret'}))
    expect(factory).toHaveBeenCalledWith('http://127.0.0.1:54321', 'server-only-test-secret', { auth: { persistSession: false, autoRefreshToken: false } })
    expect(invite).toHaveBeenCalledWith('reader@example.test', { redirectTo: 'http://127.0.0.1:5173/auth/callback' })
  })
})
