import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../../src/features/auth/AuthProvider'
import { useAuth } from '../../../src/features/auth/auth-context'
import { SignInFields } from '../../../src/features/auth/SignInFields'
import { initializeSampleReader } from './repository'

export function SampleReaderPreview({ children }: { children: ReactNode }) {
  return <BrowserRouter><AuthProvider><SampleGate>{children}</SampleGate></AuthProvider></BrowserRouter>
}
function SampleGate({ children }: { children: ReactNode }) {
  const { authenticated, signIn } = useAuth(), [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [remember, setRemember] = useState(false)
  useEffect(() => { let active = true; void initializeSampleReader().then(() => { if (active) setReady(true) }).catch(error => { if (active) setError(String(error)) }); return () => { active = false } }, [])
  if (!authenticated) return <main className="settings-content"><section className="settings-card"><h1>Sample Reader Sign-In</h1><p>Use Sample / 123. Your sample library is saved on this browser.</p><form className="account-auth-form" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setError(''); void signIn(String(fields.get('email')), String(fields.get('password'))).catch(error => setError(String(error))).finally(() => setBusy(false)) }}><SignInFields mode="login" busy={busy} remember={remember} onRememberChange={setRemember} onToggleMode={() => setError('Use username Sample and password 123. No recovery email is sent.')} /><button className="button primary" disabled={busy}>{busy ? 'Signing In…' : 'Sign In'}</button></form>{error && <p role="alert">{error}</p>}</section></main>
  if (!ready) return <main className="settings-content"><p role={error ? 'alert' : 'status'}>{error || 'Opening sample reader…'}</p></main>
  return children
}
