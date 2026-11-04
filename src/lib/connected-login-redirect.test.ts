import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { completeConnectedLoginRedirect, connectedLoginRedirect, loginAuthorization, loginAuthorizationReturn } from './connected-login-redirect'
import { issueHandoff } from './connected-login'

const key = 'connected-login-redirect:v1', secret = 'a'.repeat(64), state = 'b'.repeat(64)
const source = 'https://reader.example', originalLocation = window.location
const getSession = vi.fn(), invoke = vi.fn(), setSession = vi.fn(), assign = vi.fn()
let client: SupabaseClient
beforeEach(() => {
 vi.stubGlobal('crypto', webcrypto)
 vi.stubGlobal('location', { get origin() { return originalLocation.origin }, get href() { return originalLocation.href }, get pathname() { return originalLocation.pathname }, get search() { return originalLocation.search }, get hash() { return originalLocation.hash }, assign })
 history.replaceState(null, '', '/library?shelf=my-collection#saved')
 sessionStorage.clear(); vi.clearAllMocks()
 getSession.mockResolvedValue({ data: { session: null }, error: null })
 invoke.mockResolvedValue({ data: { access_token: 'independent-access', refresh_token: 'independent-refresh' }, error: null })
 setSession.mockResolvedValue({ error: null })
 client = { auth: { getSession, setSession }, functions: { invoke } } as unknown as SupabaseClient
})
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', '/'); sessionStorage.clear() })
function callback(changes = {}, hash = `code=${secret}&state=${state}`) {
 sessionStorage.setItem(key, JSON.stringify({ verifier: secret, state, createdAt: Date.now(), returnTo: '/library?shelf=my-collection#saved', ...changes }))
 history.replaceState(null, '', `/auth/connected#${hash}`)
}

it('navigates this tab with only a challenge and state while retaining the verifier and destination', async () => {
 await connectedLoginRedirect(source)
 const url = new URL(assign.mock.calls[0][0]), saved = JSON.parse(sessionStorage.getItem(key)!)
 expect(url.origin + url.pathname).toBe(`${source}/auth/authorize`)
 expect(url.searchParams.get('target')).toBe(location.origin)
 expect(url.searchParams.get('challenge')).toMatch(/^[a-f0-9]{64}$/)
 expect(url.searchParams.get('state')).toBe(saved.state)
 expect(saved.returnTo).toBe('/library?shelf=my-collection#saved')
 expect(url.href).not.toContain(saved.verifier)
})
it('validates the configured target and creates a fixed callback without Auth tokens', () => {
 history.replaceState(null, '', `/auth/authorize?target=${encodeURIComponent(source)}&challenge=${secret}&state=${state}`)
 const request = loginAuthorization(source)!
 expect(request).toEqual({ target: source, challenge: secret, state })
 expect(loginAuthorization('https://attacker.example')).toBeNull()
 expect(loginAuthorizationReturn(request, { code: secret })).toBe(`${source}/auth/connected#code=${secret}&state=${state}`)
 history.replaceState(null, '', '/auth/authorize?target=javascript:alert(1)&challenge=x&state=y')
 expect(loginAuthorization(source)).toBeNull()
})
it('redeems a matching code once, installs an independent session, and restores the whole destination', async () => {
 callback(); sessionStorage.setItem('connected-login-signed-out', '1')
 const first = completeConnectedLoginRedirect(client), repeated = completeConnectedLoginRedirect(client)
 expect(repeated).toBe(first)
 expect(location.href).not.toContain(secret)
 expect(sessionStorage.getItem(key)).toBeNull()
 expect(await first).toBe('/library?shelf=my-collection#saved')
 expect(invoke).toHaveBeenCalledExactlyOnceWith('app-login', { body: { action: 'redeem', code: secret, verifier: secret } })
 expect(setSession).toHaveBeenCalledWith({ access_token: 'independent-access', refresh_token: 'independent-refresh' })
 expect(sessionStorage.getItem('connected-login-signed-out')).toBeNull()
})
it.each([{ state: 'c'.repeat(64) }, { createdAt: Date.now() - 16 * 60 * 1000 }, { verifier: 'bad' }])('rejects mismatched or expired attempts before redemption: %j', async changes => {
 callback(changes)
 await expect(completeConnectedLoginRedirect(client)).rejects.toThrow('missing or expired')
 expect(invoke).not.toHaveBeenCalled(); expect(setSession).not.toHaveBeenCalled()
 expect(location.hash).toBe('#saved'); expect(sessionStorage.getItem(key)).toBeNull()
})
it('scrubs replayed callbacks and rejects callbacks without a pending verifier', async () => {
 callback(); sessionStorage.removeItem(key)
 await expect(completeConnectedLoginRedirect(client)).rejects.toThrow('missing or expired')
 expect(location.pathname).toBe('/reading'); expect(location.hash).toBe('')
 expect(invoke).not.toHaveBeenCalled()
})
it('returns cancelled requests to the intended page without signing in', async () => {
 callback({}, `error=cancelled&state=${state}`)
 expect(await completeConnectedLoginRedirect(client)).toBe('/library?shelf=my-collection#saved')
 expect(invoke).not.toHaveBeenCalled(); expect(setSession).not.toHaveBeenCalled()
})
it('rejects failed code exchange, removes its URL fragment, and keeps password sign-in available', async () => {
 callback(); invoke.mockResolvedValue({ error: new Error('Already consumed') })
 await expect(completeConnectedLoginRedirect(client)).rejects.toThrow('expired or could not be exchanged')
 expect(setSession).not.toHaveBeenCalled(); expect(location.hash).toBe('#saved')
})
it('never restores an external destination or replaces a newer organizer session', async () => {
 callback({ returnTo: 'https://attacker.example/steal' })
 getSession.mockResolvedValue({ data: { session: { user: { id: 'another-account' } } } })
 expect(await completeConnectedLoginRedirect(client)).toBe('/reading')
 expect(invoke).not.toHaveBeenCalled(); expect(setSession).not.toHaveBeenCalled()
})
it('issues the handoff only for the visibly confirmed account and uses that session token', async () => {
 getSession.mockResolvedValue({ data: { session: { user: { id: 'reader-account' }, access_token: 'source-access' } } })
 expect(await issueHandoff(client, source, secret, true, 'changed-account')).toEqual({ error: 'account-changed' })
 expect(invoke).not.toHaveBeenCalled()
 invoke.mockResolvedValue({ data: { code: secret } })
 expect(await issueHandoff(client, source, secret, true, 'reader-account')).toEqual({ code: secret })
 expect(invoke).toHaveBeenCalledWith('app-login', { body: { action: 'issue', target: source, challenge: secret, userRequested: true }, headers: { Authorization: 'Bearer source-access' } })
})
