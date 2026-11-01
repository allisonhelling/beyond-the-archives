import type { ChangeEventHandler } from 'react'

export function SignInFields({ mode, busy, email, password, onEmailChange, onPasswordChange, remember, onRememberChange, onToggleMode }: {
 mode: 'login' | 'reset' | 'password'; busy: boolean; email?: string; password?: string
 onEmailChange?: ChangeEventHandler<HTMLInputElement>; onPasswordChange?: ChangeEventHandler<HTMLInputElement>
 remember: boolean; onRememberChange: (remember: boolean) => void; onToggleMode: () => void
}) {
 const emailLabel = mode === 'reset' ? 'Email Address' : 'Username or Email', passwordLabel = mode === 'password' ? 'New Password' : 'Password'
 return <>
  {mode !== 'password' && <label className="account-auth-field"><input className="account-auth-input" name="email" type={mode === 'reset' ? 'email' : 'text'} aria-label={emailLabel} placeholder={emailLabel} autoComplete={mode === 'reset' ? 'email' : 'username'} value={email} onChange={onEmailChange} required disabled={busy} /></label>}
  {mode !== 'reset' && <label className="account-auth-field"><input className="account-auth-input" key={mode} name="password" type="password" aria-label={passwordLabel} placeholder={passwordLabel} autoComplete={mode === 'password' ? 'new-password' : 'current-password'} value={password} onChange={onPasswordChange} required minLength={mode === 'password' ? 12 : 1} disabled={busy} />{mode === 'password' && <span className="field-help">Use at least 12 characters with upper and lower case letters, a number, and a symbol.</span>}</label>}
  {mode === 'login' && <div className="account-auth-options"><label className="account-auth-remember"><input type="checkbox" checked={remember} onChange={event => onRememberChange(event.target.checked)} disabled={busy} />Remember Me</label><button type="button" className="account-auth-help" disabled={busy} onClick={onToggleMode}>Forgot Your Password?</button></div>}
 </>
}

export function BackToSignIn({ busy, onClick }: { busy: boolean; onClick: () => void }) {
 return <button type="button" className="account-auth-help account-auth-back" disabled={busy} onClick={onClick}>Back to Sign In</button>
}
