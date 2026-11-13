import { authSessionStorage } from './auth-session-storage'
import { initialAuthIntent } from './auth-account'
import { createClient } from '@supabase/supabase-js'
import { requireRuntimeEnvironmentConfig } from './environment'
import type { Database } from '../types/database'
import { sampleMode } from './sample-mode'
import { fetchWithLayout } from './layout-fetch'

// Invalid or missing configuration leaves the organizer's existing setup screen active.
const config = (() => { try { return requireRuntimeEnvironmentConfig(import.meta.env) } catch { return null } })()
// Capture invitation/recovery intent before the SDK consumes callback parameters.
export const initialAuthType = initialAuthIntent
export const supabase = config && !sampleMode ? createClient<Database>(config.url, config.key, {
  global: { fetch: fetchWithLayout },
  auth: { storage: authSessionStorage('organizer'), flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export const authRedirectUrl = () => `${window.location.origin}/auth/callback`
