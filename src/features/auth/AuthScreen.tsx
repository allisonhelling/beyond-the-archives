import { BackToSignIn, SignInFields } from './SignInFields'
import { remembersSession, rememberSession } from '../../lib/auth-session-storage'
import { connectedLogin, readerAppUrl } from '../../lib/connected-login'
import { useActivity } from '../../lib/use-activity'
import { useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Brand } from '../../components/Brand'
import { authRedirectUrl, supabase } from '../../lib/supabase'
import { useAuth } from './auth-context'
import { sampleMode } from '../../lib/sample-mode'
import { brandName } from '../../lib/brand'

export function AuthScreen() {
  const { error: sessionError, needsPassword, passwordSaved, signIn } = useAuth()
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [email, setEmail] = useState(sampleMode ? 'Sample' : '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => remembersSession('organizer'))
  const [busy, setBusy] = useState(false)
  useActivity(Boolean(busy), 'Signing in or updating your account…')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const configured = sampleMode || Boolean(supabase)

  function toggleMode() {
    setMode(mode === 'login' ? 'reset' : 'login'); setError(null); setMessage(null); setPassword('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!configured || busy) return
    setBusy(true); setError(null); setMessage(null)
    try {
      if (sampleMode && mode === 'reset') {
        setMessage('Sample preview: no recovery email is sent. Sign in with Sample and password 123.')
      } else if (needsPassword && supabase) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setPassword(''); passwordSaved()
      } else if (mode === 'reset' && supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() })
        if (error) throw error
        setMessage('If this address has an account, a recovery link is on its way. Open it in this browser.')
      } else {
        await signIn(email, password)
      }
    } catch {
      setError(sampleMode ? 'Could not sign in. Use Sample and password 123.' : needsPassword ? 'Could not save your password. Use at least 12 characters with upper and lower case letters, a number, and a symbol. Your link may have expired.' : mode === 'reset' ? 'Could not send a recovery link. Please try again shortly.' : 'Could not sign in. Check your username or email and password, then try again.')
    } finally { setBusy(false) }
  }

  async function continueFromReader() {
    setBusy(true); setError(null); setMessage(null)
    try {
      if (sampleMode) await signIn('Sample', '123')
      else if (!await connectedLogin(supabase!, readerAppUrl(), true)) setMessage('Sign in to your connected reader account first, or use your email and password.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Connected sign-in failed.') }
    finally { setBusy(false) }
  }

  return <div className="auth-page">
    <header className="public-header"><Brand /><span className="eyebrow desktop-note">YOUR STORIES, ALWAYS WITHIN REACH</span></header>
    <main id="main" className="auth-main">
      <section className="auth-intro">
        <span className="eyebrow accent">KEEP YOUR PLACE IN EVERY STORY</span>
        <h1>Your Stories.<br />Your <em>Library.</em></h1>
        <p>Organize the fics you love, track your reading, and return to the chapters waiting for you.</p>
        <div className="book-scene" aria-hidden="true"><div className="scene-circle" /><div className="book book-one"><span>ONE MORE CHAPTER</span></div><div className="book book-two"><span>WORLDS TO RETURN TO</span></div><div className="book book-three"><BookOpen size={36} strokeWidth={1} /><span>The Next<br /><em>Great Story</em></span></div><span className="scene-star star-one">✧</span><span className="scene-star star-two">✧</span></div>
        <div className="privacy-note"><ShieldCheck size={18} /><span>Private by design. Just you and your library.</span></div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="small-icon"><LockKeyhole size={20} /></div>
        <span className="eyebrow">YOUR PERSONAL READING SPACE</span>
        <h2 id="auth-title">{!configured ? 'Your Library Starts Here.' : needsPassword ? 'Make Yourself at Home.' : mode === 'reset' ? 'Find Your Way Back.' : 'Sign In'}</h2>
        <p className="muted">{!configured ? 'The foundation is ready. Connect your private Supabase project to open your library.' : needsPassword ? 'Set a strong password to secure your private account.' : mode === 'reset' ? 'Enter your account email and we’ll send a recovery link.' : 'Sign in to pick up where you left off.'}</p>
        {!configured ? <div className="setup-panel"><span className="status-pill">SETUP NEEDED</span><ol><li>Create your Supabase project and apply the migrations.</li><li>Add the public project URL and publishable key to your environment.</li><li>Invite your account, then restart the app.</li></ol><p>Step-by-step instructions are in the project README.</p></div> : <form className="account-auth-form" onSubmit={submit}>
          {sampleMode && <p className="field-help">Sample login: <strong>Sample</strong> · Password: <strong>123</strong>. Your sample library stays in this browser.</p>}
          <SignInFields mode={needsPassword ? 'password' : mode} busy={busy} email={email} password={password} onEmailChange={event=>setEmail(event.target.value)} onPasswordChange={event=>setPassword(event.target.value)} remember={remember} onRememberChange={value=>{setRemember(value);rememberSession('organizer',value)}} onToggleMode={toggleMode} />
          {(error || sessionError) && <p className="error-message" role="alert">{error || sessionError}</p>}
          {message && <p className="success-message" role="status">{message}</p>}
          <div className="account-auth-actions">
          {!needsPassword && mode === 'login' && <button type="button" className="button secondary" disabled={busy} onClick={() => void continueFromReader()}>Continue From Reader</button>}
          <button className="button primary" disabled={busy} type="submit">{busy ? 'Please Wait…' : needsPassword ? 'Save Password' : mode === 'reset' ? 'Send Recovery Link' : 'Sign In'}<ArrowRight size={17} /></button>
          </div>
          {!needsPassword && mode === 'reset' && <BackToSignIn busy={busy} onClick={toggleMode} />}
        </form>}
        <div className="invite-note"><LockKeyhole size={14} /><span>Invitation only. Your library is never public.</span></div>
      </section>
    </main>
    <footer className="public-footer"><span>{brandName}</span><span>An independent reading companion. Not affiliated with AO3.</span></footer>
  </div>
}
