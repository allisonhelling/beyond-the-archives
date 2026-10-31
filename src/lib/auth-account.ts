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
