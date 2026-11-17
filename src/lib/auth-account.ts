import type { SupabaseClient } from '@supabase/supabase-js'

// Capture intent before Auth consumes the callback URL.
export const initialAuthIntent = new URLSearchParams(location.search).get('type') || new URLSearchParams(location.hash.slice(1)).get('type')
const verifications = new WeakMap<SupabaseClient, { token: string; promise: Promise<{ error: unknown }> }>()
export function isAuthLinkType(type: string | null): type is 'invite' | 'recovery' | 'signup' | 'email_change' {
 return type === 'invite' || type === 'recovery' || type === 'signup' || type === 'email_change'
}
export async function verifyAuthLink(client: SupabaseClient, token: string, type: 'invite' | 'recovery' | 'signup' | 'email_change') {
  let pending = verifications.get(client)
  if (pending?.token !== token) {
    pending = { token, promise: client.auth.verifyOtp({ token_hash: token, type }) }
    verifications.set(client, pending)
  }
  const { error } = await pending.promise
  if (error) throw error
}

export const accountUsernamePattern = '[A-Za-z0-9_]{3,30}'
export const accountConfirmationMessage = 'Check your email to confirm your account, then sign in. If you already have an account in either app, use its existing username or email and password.'
export async function createAccount(client: SupabaseClient, email: string, password: string, username: string, redirectTo: string) {
 const chosen = username.trim()
 if (!new RegExp(`^${accountUsernamePattern}$`).test(chosen)) throw new Error('Use 3–30 letters, numbers, or underscores for your username.')
 if (password.length < 6) throw new Error('Use at least 6 characters for your password.')
 const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { username: chosen }, emailRedirectTo: redirectTo } }).catch(() => { throw new Error('Could not create an account. Please try again shortly.') })
 if (error) throw new Error(error.message === 'Private beta: this email address has not been approved for account creation.' ? error.message : error.code === 'signup_disabled' ? 'Account creation is not enabled yet. Please try again later.' : 'Could not create an account. Try a different username, or sign in if you already have an account.')
 return data.session
}

// Email goes directly to Auth; usernames are resolved only on the trusted server.
export async function signInWithLogin(client: SupabaseClient, login: string, password: string) {
 const identifier = login.trim()
 if (identifier.includes('@')) return client.auth.signInWithPassword({ email: identifier, password })
 const { data, error } = await client.functions.invoke('app-login', { body: { action: 'password', username: identifier, password } })
 if (error || !data?.access_token || !data?.refresh_token) throw new Error('Could not sign in. Check your username or email and password, then try again.')
 return client.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
}

export function confirmPassword(fields: FormData) {
 if (fields.get('password') !== fields.get('confirmPassword')) throw new Error('Passwords do not match.')
}

export async function verifyCurrentPassword(client: SupabaseClient, password: string) {
 const { data, error } = await client.auth.getUser()
 if (error || !data.user?.email) throw new Error('Sign in again before changing account details.')
 const result = await client.auth.signInWithPassword({ email: data.user.email, password })
 if (result.error || result.data.user?.id !== data.user.id) throw new Error('The current password is incorrect.')
}

export async function signOutEverywhere(client: SupabaseClient) {
 // Paired AO3 bars have their own credentials, independent of Auth refresh tokens.
 const devices = await client.rpc('manage_userscript_device', { p_action: 'list' })
 if (devices.error || !Array.isArray(devices.data)) throw new Error('Could not load paired devices. Try again before signing out everywhere.')
 for (const device of (devices.data ?? []) as { id: string }[]) {
  const result = await client.rpc('manage_userscript_device', { p_action: 'revoke', p_id: device.id })
  if (result.error) throw new Error('Could not disconnect all paired devices. Try again.')
 }
 const { error } = await client.auth.signOut({ scope: 'global' })
 if (error) throw error
}
