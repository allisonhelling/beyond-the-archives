import { connectedLogin, readerAppUrl } from '../../lib/connected-login'
import { verifyAuthLink } from '../../lib/auth-account'
import { useActivity } from '../../lib/use-activity'
import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { initialAuthType, supabase } from '../../lib/supabase'
import { AuthContext } from './auth-context'
import { sampleMode } from '../../lib/sample-mode'
import { brandSlug } from '../../lib/brand'

const sampleAuthKey = `${brandSlug}:sample-auth:v1`


export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sampleSignedIn, setSampleSignedIn] = useState(() => {
    if (!sampleMode) return false
    try { return sessionStorage.getItem(sampleAuthKey) !== 'signed-out' } catch { return true }
  })
  const [loading, setLoading] = useState(!sampleMode && Boolean(supabase))
  useActivity(Boolean(loading), 'Opening your reading space…')
  const [error, setError] = useState<string | null>(null)
  const [needsPassword, setNeedsPassword] = useState(!sampleMode && (initialAuthType === 'invite' || initialAuthType === 'recovery'))

  function sampleAuthentication(signedIn: boolean) {
    try { sessionStorage.setItem(sampleAuthKey, signedIn ? 'signed-in' : 'signed-out') } catch { /* In-memory preview still works without browser storage. */ }
    setSampleSignedIn(signedIn)
  }
  async function signIn(login: string, password: string) {
    if (sampleMode) {
      if (login.trim() !== 'Sample' || password !== '123') throw new Error('Invalid sample credentials.')
      sampleAuthentication(true)
      return
    }
    if (!supabase) throw new Error('Authentication is not configured.')
    const { error } = await supabase.auth.signInWithPassword({ email: login.trim(), password })
    if (error) throw error
    sessionStorage.removeItem('connected-login-signed-out')
  }
  async function signOut() {
    if (sampleMode) { sampleAuthentication(false); return }
    if (!supabase) throw new Error('Authentication is not configured.')
    sessionStorage.setItem('connected-login-signed-out','1')
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  useEffect(() => {
    if (sampleMode || !supabase) return
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
          await verifyAuthLink(client, tokenHash, type)
          if (active) setNeedsPassword(true)
          if (active) window.history.replaceState(null, '', '/auth/callback')
        }
        let timeout: ReturnType<typeof setTimeout> | undefined
        const result = await Promise.race([
          client.auth.getSession(),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Session check timed out.')), 8000) }),
        ]).finally(() => clearTimeout(timeout))
        const { data, error: sessionError } = result
        if (sessionError) throw sessionError
        if (active && !authEventReceived) setSession(data.session)
        if (!data.session && !tokenHash && !initialAuthType) {
          void connectedLogin(client, readerAppUrl()).catch(() => { /* Email/password remains available. */ })
        }
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

  return <AuthContext value={{ authenticated: sampleMode ? sampleSignedIn : Boolean(session), signIn, signOut, session, loading, error, needsPassword, passwordSaved: () => setNeedsPassword(false) }}>{children}</AuthContext>
}
