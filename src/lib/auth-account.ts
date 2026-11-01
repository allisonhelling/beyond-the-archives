import type { SupabaseClient } from '@supabase/supabase-js'

// Capture intent before Auth consumes the callback URL.
export const initialAuthIntent = new URLSearchParams(location.search).get('type') || new URLSearchParams(location.hash.slice(1)).get('type')
const verifications = new WeakMap<SupabaseClient, { token: string; promise: Promise<{ error: unknown }> }>()
export async function verifyAuthLink(client: SupabaseClient, token: string, type: 'invite' | 'recovery') {
  let pending = verifications.get(client)
  if (pending?.token !== token) {
    pending = { token, promise: client.auth.verifyOtp({ token_hash: token, type }) }
    verifications.set(client, pending)
  }
  const { error } = await pending.promise
  if (error) throw error
}

// Email goes directly to Auth; usernames are resolved only on the trusted server.
export async function signInWithLogin(client: SupabaseClient, login: string, password: string) {
 const identifier = login.trim()
 if (identifier.includes('@')) return client.auth.signInWithPassword({ email: identifier, password })
 const { data, error } = await client.functions.invoke('app-login', { body: { action: 'password', username: identifier, password } })
 if (error || !data?.access_token || !data?.refresh_token) throw new Error('Could not sign in. Check your username or email and password, then try again.')
 return client.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
}
