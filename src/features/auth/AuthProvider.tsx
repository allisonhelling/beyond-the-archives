import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { initialAuthType, supabase } from '../../lib/supabase'
import { AuthContext } from './auth-context'

// React StrictMode remounts effects. Consume a one-time email token only once.
let pendingVerification: { token: string; promise: Promise<{ error: unknown }> } | null = null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(null)
  const [needsPassword, setNeedsPassword] = useState(initialAuthType === 'invite' || initialAuthType === 'recovery')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true
    let authEventReceived = false
    let initialized = false
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return
      authEventReceived = true
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true)
      if (event === 'SIGNED_OUT') setNeedsPassword(false)
      if (initialized) setLoading(false)
    })
    async function initialize() {
      try {
        const params = new URLSearchParams(window.location.search)
        if (params.has('error') || new URLSearchParams(window.location.hash.slice(1)).has('error')) {
          throw new Error('This sign-in link is invalid or expired. Request a new link.')
        }
        const tokenHash = params.get('token_hash')
        const type = params.get('type')
        if (tokenHash && (type === 'invite' || type === 'recovery')) {
          if (pendingVerification?.token !== tokenHash) {
            pendingVerification = { token: tokenHash, promise: client.auth.verifyOtp({ token_hash: tokenHash, type }) }
          }
          const { error: verifyError } = await pendingVerification.promise
          if (verifyError) throw verifyError
          if (active) setNeedsPassword(true)
          if (active) window.history.replaceState(null, '', '/auth/callback')
        }
        const { data, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        if (active && !authEventReceived) setSession(data.session)
      } catch {
        if (active) {
          setSession(null)
          setError('Unable to verify your session. Sign in again or request a new invitation or recovery link.')
        }
      } finally {
        initialized = true
        if (active) setLoading(false)
      }
    }
    void initialize()
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  return <AuthContext value={{ session, loading, error, needsPassword, passwordSaved: () => setNeedsPassword(false) }}>{children}</AuthContext>
}
