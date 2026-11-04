import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { SignInFields } from '../../src/features/auth/SignInFields'
import { signInWithLogin } from '../../src/lib/auth-account'
import { remembersSession, rememberSession } from '../../src/lib/auth-session-storage'
import { issueHandoff, organizerAppUrl } from '../../src/lib/connected-login'
import { loginAuthorization, loginAuthorizationReturn } from '../../src/lib/connected-login-redirect'
import { readerBrandName } from '../../src/lib/brand'
import { readerCloud } from './cloud'

export function ReaderAuthorization() {
 const [request] = useState(() => loginAuthorization(organizerAppUrl()))
 const [session, setSession] = useState<Session | null>(null)
 const [checking, setChecking] = useState(true), [busy, setBusy] = useState(false)
 const [error, setError] = useState(''), [message, setMessage] = useState('')
 const [reset, setReset] = useState(false), [remember, setRemember] = useState(() => remembersSession('reader'))
 useEffect(() => {
  if (!request) return
  let active = true
  const timeout = setTimeout(() => { if (active) { active = false; setSession(null); setChecking(false) } }, 8000)
  void readerCloud.auth.getSession().then(({ data, error }) => {
   if (active) { clearTimeout(timeout); setSession(error ? null : data.session); setChecking(false) }
  }).catch(() => { if (active) { clearTimeout(timeout); setSession(null); setChecking(false) } })
  return () => { active = false; clearTimeout(timeout) }
 }, [request])

 async function signIn(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const fields = new FormData(event.currentTarget)
  setBusy(true); setError(''); setMessage('')
  try {
   if (reset) {
    const { error } = await readerCloud.auth.resetPasswordForEmail(String(fields.get('email')).trim(), { redirectTo: `${location.origin}/auth/callback` })
    if (error) throw error
    setMessage('If this address has an account, a recovery link is on its way. After resetting your password, return to this page to continue.')
   } else {
    const { data, error } = await signInWithLogin(readerCloud, String(fields.get('email')), String(fields.get('password')))
    if (error || !data.session) throw error ?? new Error('No session')
    sessionStorage.removeItem('connected-login-signed-out'); setSession(data.session)
   }
  } catch { setError(reset ? 'Could not send a recovery link. Please try again.' : 'Could not sign in. Check your username or email and password, then try again.') }
  finally { setBusy(false) }
 }

 async function authorize() {
  if (!request || !session || busy) return
  setBusy(true); setError('')
  try {
   const result = await issueHandoff(readerCloud, request.target, request.challenge, true, session.user.id)
   if (result.code) { location.replace(loginAuthorizationReturn(request, { code: result.code })); return }
   if (result.error === 'signed-out' || result.error === 'account-changed') {
    setSession(null)
    setError('The reader account changed or signed out. Sign in to the account you want to continue with.')
   } else setError(result.error === 'access-denied' ? 'This account does not have reader access. Sign in with an account that has access, or cancel and sign in to the organizer.' : 'Could not authorize sign-in. Please try again, or cancel and sign in to the organizer.')
  } catch { setError('Could not authorize sign-in. Please try again.') }
  finally { setBusy(false) }
 }

 return <main className="bookshelf"><section className="reader-authorization" aria-labelledby="authorization-title">
  <p className="eyebrow">{readerBrandName}</p><h1 id="authorization-title">Continue to Organizer</h1>
  {!request ? <p role="alert">This authorization request is invalid. Return to the organizer and choose Continue From Reader again.</p> : <>
   <p>Authorize sign-in to {new URL(request.target).hostname}.</p>
   {checking ? <p role="status">Checking your reader session…</p> : session ? <>
    <p>Continue as <strong>{session.user.email ?? session.user.id}</strong>.</p>
    <div className="dialog-actions"><button className="primary" disabled={busy} onClick={() => void authorize()}>{busy ? 'Continuing…' : 'Continue to Organizer'}</button><button disabled={busy} onClick={() => { setSession(null); setError(''); setReset(false) }}>Use Another Account</button></div>
   </> : <>
    <p>Sign in to continue. A login in another browser or installed app may be unavailable here. Your organizer destination will be kept.</p>
    <form className="account-auth-form" onSubmit={signIn}>
     <SignInFields mode={reset ? 'reset' : 'login'} busy={busy} remember={remember} onRememberChange={value => { setRemember(value); rememberSession('reader', value) }} onToggleMode={() => { setReset(true); setError(''); setMessage('') }} />
     <button className="primary" disabled={busy}>{busy ? 'Please Wait…' : reset ? 'Send Recovery Link' : 'Sign In'}</button>
     {reset && <button type="button" className="account-auth-help account-auth-back" disabled={busy} onClick={() => { setReset(false); setError(''); setMessage('') }}>Back to Sign In</button>}
    </form>
   </>}
   {error && <p className="error-message" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
   <p>Connecting accounts authorizes this handoff; it does not share browser sessions.</p>
   <button disabled={busy || checking} onClick={() => location.replace(loginAuthorizationReturn(request, { error: 'cancelled' }))}>Cancel</button>
  </>}
 </section></main>
}
