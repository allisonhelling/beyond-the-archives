import type { ChangeEventHandler } from 'react'
import { AccountUsernameField } from './UsernameSettings'
export type AccountMode = 'login' | 'reset' | 'signup'

export function SignInFields({ mode, busy, email, password, username, onUsernameChange, onEmailChange, onPasswordChange, remember, onRememberChange, onToggleMode }: {
 mode: AccountMode | 'password'; busy: boolean; email?: string; password?: string; username?: string; onUsernameChange?: ChangeEventHandler<HTMLInputElement>
 onEmailChange?: ChangeEventHandler<HTMLInputElement>; onPasswordChange?: ChangeEventHandler<HTMLInputElement>
 remember: boolean; onRememberChange: (remember: boolean) => void; onToggleMode: () => void
}) {
 const emailLabel = mode === 'login' ? 'Username or Email' : 'Email Address', passwordLabel = mode === 'password' ? 'New Password' : 'Password', newPassword = mode === 'password' || mode === 'signup'
 return <>
  {mode !== 'password' && <label className="account-auth-field"><input className="account-auth-input" name="email" type={mode === 'login' ? 'text' : 'email'} aria-label={emailLabel} placeholder={emailLabel} autoComplete={mode === 'login' ? 'username' : 'email'} value={email} onChange={onEmailChange} required disabled={busy} /></label>}
  {mode === 'signup' && <AccountUsernameField auth value={username} onChange={onUsernameChange} disabled={busy} />}
  {mode !== 'reset' && <label className="account-auth-field"><input className="account-auth-input" key={mode} name="password" type="password" aria-label={passwordLabel} placeholder={passwordLabel} autoComplete={newPassword ? 'new-password' : 'current-password'} value={password} onChange={onPasswordChange} required minLength={newPassword ? 12 : 1} disabled={busy} />{newPassword && <span className="field-help">Use at least 12 characters with upper and lower case letters, a number, and a symbol.</span>}</label>}
  {(mode === 'login' || mode === 'signup') && <div className="account-auth-options"><label className="account-auth-remember"><input type="checkbox" checked={remember} onChange={event => onRememberChange(event.target.checked)} disabled={busy} />Remember Me</label>{mode === 'login' && <button type="button" className="account-auth-help" disabled={busy} onClick={onToggleMode}>Forgot Your Password?</button>}</div>}
 </>
}

export function AccountModeSwitch({ mode, busy, onChange }: { mode: AccountMode; busy: boolean; onChange: (mode: AccountMode) => void }) {
 return <button type="button" className="account-auth-help account-auth-back" disabled={busy} onClick={() => onChange(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create Account' : 'Back to Sign In'}</button>
}
