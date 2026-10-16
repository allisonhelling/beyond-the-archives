import { createClient } from '@supabase/supabase-js'
import { readPublicConfig } from './config'
import type { Database } from '../types/database'
import { sampleMode } from './sample-mode'

const config = readPublicConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
})
// Capture invitation/recovery intent before the SDK consumes callback parameters.
export const initialAuthType = new URLSearchParams(window.location.search).get('type')
  || new URLSearchParams(window.location.hash.slice(1)).get('type')
export const supabase = config && !sampleMode ? createClient<Database>(config.url, config.key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export const authRedirectUrl = () => `${window.location.origin}/auth/callback`
