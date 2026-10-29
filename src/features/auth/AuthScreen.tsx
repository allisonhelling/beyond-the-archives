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
  const [busy, setBusy] = useState(false)
  useActivity(Boolean(busy), 'Signing in or updating your account…')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const configured = sampleMode || Boolean(supabase)

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
      setError(sampleMode ? 'Could not sign in. Use Sample and password 123.' : needsPassword ? 'Could not save your password. Use at least 12 characters with upper and lower case letters, a number, and a symbol. Your link may have expired.' : mode === 'reset' ? 'Could not send a recovery link. Please try again shortly.' : 'Could not sign in. Check your email and password, then try again.')
    } finally { setBusy(false) }
  }

  return <div className="auth-page">
    <header className="public-header"><Brand /><span className="eyebrow desktop-note">A LITTLE SPACE FOR YOUR NEXT CHAPTER</span></header>
    <main id="main" className="auth-main">
      <section className="auth-intro">
        <span className="eyebrow accent">THE STORIES STAY WITH YOU</span>
        <h1>A Quiet Home for <br />Every <em>Story.</em></h1>
        <p>A place for the fics you love, the worlds you return to, and the chapters still waiting for you.</p>
        <div className="book-scene" aria-hidden="true"><div className="scene-circle" /><div className="book book-one"><span>ONE MORE CHAPTER</span></div><div className="book book-two"><span>WORLDS TO RETURN TO</span></div><div className="book book-three"><BookOpen size={36} strokeWidth={1} /><span>The Next<br /><em>Great Story</em></span></div><span className="scene-star star-one">✧</span><span className="scene-star star-two">✧</span></div>
        <div className="privacy-note"><ShieldCheck size={18} /><span>Private by design. Just you and your library.</span></div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="small-icon"><LockKeyhole size={20} /></div>
        <span className="eyebrow">YOUR PERSONAL READING SPACE</span>
        <h2 id="auth-title">{!configured ? 'Your Library Starts Here.' : needsPassword ? 'Make Yourself at Home.' : mode === 'reset' ? 'Find Your Way Back.' : 'Welcome Back.'}</h2>
        <p className="muted">{!configured ? 'The foundation is ready. Connect your private Supabase project to open your library.' : needsPassword ? 'Set a strong password to secure your private account.' : mode === 'reset' ? 'Enter your account email and we’ll send a recovery link.' : 'Sign in to pick up where you left off.'}</p>
        {!configured ? <div className="setup-panel"><span className="status-pill">SETUP NEEDED</span><ol><li>Create your Supabase project and apply the migrations.</li><li>Add the public project URL and publishable key to your environment.</li><li>Invite your account, then restart the app.</li></ol><p>Step-by-step instructions are in the project README.</p></div> : <form onSubmit={submit}>
          {sampleMode && <p className="field-help">Sample login: <strong>Sample</strong> · Password: <strong>123</strong>. Your sample library stays in this browser.</p>}
          {!needsPassword && <label>{sampleMode ? 'Username' : 'Email Address'}<input type={sampleMode ? 'text' : 'email'} name={sampleMode ? 'username' : 'email'} autoComplete={sampleMode ? 'username' : 'email'} placeholder={sampleMode ? 'Sample' : 'you@example.com'} value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label>}
          {(needsPassword || mode === 'login') && <label>{needsPassword ? 'New Password' : 'Password'}<input type="password" name="password" autoComplete={needsPassword ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={needsPassword ? 12 : 1} disabled={busy} />{needsPassword && <span className="field-help">At least 12 characters, including upper and lower case letters, a number, and a symbol.</span>}</label>}
          {(error || sessionError) && <p className="error-message" role="alert">{error || sessionError}</p>}
          {message && <p className="success-message" role="status">{message}</p>}
          <button className="button primary" disabled={busy} type="submit">{busy ? 'Please Wait…' : needsPassword ? 'Save Password' : mode === 'reset' ? 'Send Recovery Link' : 'Sign In to Your Library'}<ArrowRight size={17} /></button>
          {!needsPassword && <button type="button" className="text-button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'reset' : 'login'); setError(null); setMessage(null); setPassword('') }}>{mode === 'login' ? 'Forgot Your Password?' : 'Back to Sign In'}</button>}
        </form>}
        <div className="invite-note"><LockKeyhole size={14} /><span>Invitation only. Your library is never public.</span></div>
      </section>
    </main>
    <footer className="public-footer"><span>{brandName}</span><span>An independent reading companion. Not affiliated with AO3.</span></footer>
  </div>
}
