import { useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Brand } from '../../components/Brand'
import { authRedirectUrl, supabase } from '../../lib/supabase'
import { useAuth } from './auth-context'

export function AuthScreen() {
  const { error: sessionError, needsPassword, passwordSaved } = useAuth()
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const configured = Boolean(supabase)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true); setError(null); setMessage(null)
    try {
      if (needsPassword) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setPassword(''); passwordSaved()
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() })
        if (error) throw error
        setMessage('If this address has an account, a recovery link is on its way. Open it in this browser.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
    } catch {
      setError(needsPassword ? 'Could not save your password. Use at least 12 characters with upper and lower case letters, a number, and a symbol. Your link may have expired.' : mode === 'reset' ? 'Could not send a recovery link. Please try again shortly.' : 'Could not sign in. Check your email and password, then try again.')
    } finally { setBusy(false) }
  }

  return <div className="auth-page">
    <header className="public-header"><Brand /><span className="eyebrow desktop-note">A LITTLE SPACE FOR YOUR NEXT CHAPTER</span></header>
    <main id="main" className="auth-main">
      <section className="auth-intro">
        <span className="eyebrow accent">THE STORIES STAY WITH YOU</span>
        <h1>A quiet home for <br />every <em>story.</em></h1>
        <p>A place for the fics you love, the worlds you return to, and the chapters still waiting for you.</p>
        <div className="book-scene" aria-hidden="true"><div className="scene-circle" /><div className="book book-one"><span>ONE MORE CHAPTER</span></div><div className="book book-two"><span>WORLDS TO RETURN TO</span></div><div className="book book-three"><BookOpen size={36} strokeWidth={1} /><span>the next<br /><em>great story</em></span></div><span className="scene-star star-one">✧</span><span className="scene-star star-two">✧</span></div>
        <div className="privacy-note"><ShieldCheck size={18} /><span>Private by design. Just you and your library.</span></div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="small-icon"><LockKeyhole size={20} /></div>
        <span className="eyebrow">YOUR PERSONAL READING SPACE</span>
        <h2 id="auth-title">{!configured ? 'Your library starts here.' : needsPassword ? 'Make yourself at home.' : mode === 'reset' ? 'Find your way back.' : 'Welcome back.'}</h2>
        <p className="muted">{!configured ? 'The foundation is ready. Connect your private Supabase project to open your library.' : needsPassword ? 'Set a strong password to secure your private account.' : mode === 'reset' ? 'Enter your account email and we’ll send a recovery link.' : 'Sign in to pick up where you left off.'}</p>
        {!configured ? <div className="setup-panel"><span className="status-pill">SETUP NEEDED</span><ol><li>Create your Supabase project and apply the migrations.</li><li>Add the public project URL and publishable key to your environment.</li><li>Invite your account, then restart the app.</li></ol><p>Step-by-step instructions are in the project README.</p></div> : <form onSubmit={submit}>
          {!needsPassword && <label>Email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label>}
          {(needsPassword || mode === 'login') && <label>{needsPassword ? 'New password' : 'Password'}<input type="password" name="password" autoComplete={needsPassword ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={needsPassword ? 12 : 1} disabled={busy} />{needsPassword && <span className="field-help">At least 12 characters, including upper and lower case letters, a number, and a symbol.</span>}</label>}
          {(error || sessionError) && <p className="error-message" role="alert">{error || sessionError}</p>}
          {message && <p className="success-message" role="status">{message}</p>}
          <button className="button primary" disabled={busy} type="submit">{busy ? 'Please wait…' : needsPassword ? 'Save password' : mode === 'reset' ? 'Send recovery link' : 'Sign in to your library'}<ArrowRight size={17} /></button>
          {!needsPassword && <button type="button" className="text-button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'reset' : 'login'); setError(null); setMessage(null); setPassword('') }}>{mode === 'login' ? 'Forgot your password?' : 'Back to sign in'}</button>}
        </form>}
        <div className="invite-note"><LockKeyhole size={14} /><span>Invitation only. Your library is never public.</span></div>
      </section>
    </main>
    <footer className="public-footer"><span>BETWEEN CHAPTERS</span><span>An independent reading companion. Not affiliated with AO3.</span></footer>
  </div>
}
