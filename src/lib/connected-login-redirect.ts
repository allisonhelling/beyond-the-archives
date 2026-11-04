import type { SupabaseClient } from '@supabase/supabase-js'
import { randomSecret, sha256 } from './crypto'

const pendingKey = 'connected-login-redirect:v1'
const lifetime = 15 * 60 * 1000
const validSecret = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export const isConnectedLoginCallback = () => location.pathname === '/auth/connected'

function localDestination(value: unknown) {
 if (typeof value !== 'string') return '/reading'
 try {
  const url = new URL(value, location.origin)
  return url.origin === location.origin && !url.pathname.startsWith('/auth/') ? url.pathname + url.search + url.hash : '/reading'
 } catch { return '/reading' }
}

// Only the challenge leaves this tab. The verifier and intended page stay on
// the organizer origin, including while a user signs in on the reader origin.
export async function connectedLoginRedirect(otherApp: string) {
 const verifier = randomSecret(), state = randomSecret()
 const url = new URL('/auth/authorize', otherApp)
 url.search = new URLSearchParams({ target: location.origin, challenge: await sha256(verifier), state }).toString()
 try {
  sessionStorage.setItem(pendingKey, JSON.stringify({ verifier, state, createdAt: Date.now(), returnTo: localDestination(location.href) }))
 } catch { throw new Error('Allow storage in this tab to continue from the reader, or sign in here.') }
 location.assign(url.href)
}

export type LoginAuthorization = { target: string; challenge: string; state: string }
export function loginAuthorization(otherApp: string): LoginAuthorization | null {
 const params = new URLSearchParams(location.search)
 const target = params.get('target'), challenge = params.get('challenge'), state = params.get('state')
 if (target !== new URL(otherApp).origin || target === location.origin || !validSecret(challenge) || !validSecret(state)) return null
 return { target, challenge, state }
}

export function loginAuthorizationReturn(request: LoginAuthorization, result: { code: string } | { error: 'cancelled' }) {
 const url = new URL('/auth/connected', request.target)
 url.hash = new URLSearchParams({ ...result, state: request.state }).toString()
 return url.href
}

const redemptions = new WeakMap<SupabaseClient, Promise<string | null>>()
export function completeConnectedLoginRedirect(client: SupabaseClient): Promise<string | null> {
 const pending = redemptions.get(client)
 if (pending) return pending
 if (!isConnectedLoginCallback()) return Promise.resolve(null)
 const result = (async () => {
  const params = new URLSearchParams(location.hash.slice(1))
  let saved: { verifier?: unknown; state?: unknown; createdAt?: unknown; returnTo?: unknown } = {}
  try { saved = JSON.parse(sessionStorage.getItem(pendingKey) ?? '{}'); sessionStorage.removeItem(pendingKey) } catch { /* A missing verifier cannot authorize a handoff. */ }
  const returnTo = localDestination(saved?.returnTo)
  // Scrub the one-use code before network IO, even if redemption fails.
  history.replaceState(history.state, '', returnTo)
  if (!saved || !validSecret(saved.verifier) || !validSecret(saved.state) || saved.state !== params.get('state') || typeof saved.createdAt !== 'number' || Date.now() - saved.createdAt > lifetime || saved.createdAt > Date.now()) {
   throw new Error('This reader sign-in request is missing or expired. Choose Continue From Reader again, or sign in here.')
  }
  if (params.get('error') === 'cancelled') return returnTo
  const code = params.get('code')
  if (!validSecret(code)) throw new Error('This reader sign-in link is invalid. Choose Continue From Reader again, or sign in here.')
  // An independent sign-in in the organizer takes precedence over a delayed handoff.
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  if (!data.session) {
   const result = await client.functions.invoke('app-login', { body: { action: 'redeem', code, verifier: saved.verifier } })
   if (result.error || !result.data?.access_token || !result.data?.refresh_token) throw new Error('This reader sign-in code expired or could not be exchanged. Choose Continue From Reader again, or sign in here.')
   if (!(await client.auth.getSession()).data.session) {
    const { error } = await client.auth.setSession(result.data)
    if (error) throw error
   }
  }
  sessionStorage.removeItem('connected-login-signed-out')
  return returnTo
 })()
 redemptions.set(client, result)
 return result
}
