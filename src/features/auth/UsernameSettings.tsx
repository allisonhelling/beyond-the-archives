import { useEffect, useState, type ReactNode, type ChangeEventHandler } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import { accountUsernamePattern } from '../../lib/auth-account'

export function AccountUsernameField({ value, onChange, disabled, readOnly = false, auth = false, label: customLabel }: { label?: string; value?: string; onChange?: ChangeEventHandler<HTMLInputElement>; disabled: boolean; readOnly?: boolean; auth?: boolean }) {
 const label = customLabel ?? (auth ? 'Username' : 'Account Username')
 return <label className={auth ? 'account-auth-field' : undefined}>{!auth && label}<input className={auth ? 'account-auth-input' : undefined} aria-label={label} placeholder={auth ? label : undefined} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={value} onChange={onChange} readOnly={readOnly} required minLength={3} maxLength={30} pattern={accountUsernamePattern} disabled={disabled} /></label>
}

export function UsernameSettings({ client, disabled = false, actions, verifyPassword }: { verifyPassword?: (password: string) => Promise<void>; actions?: ReactNode; client: SupabaseClient<Database> | null; disabled?: boolean }) {
 const [editing, setEditing] = useState(false)
 const [savedUsername, setSavedUsername] = useState('')
 const [username, setUsername] = useState(''), [busy, setBusy] = useState(false)
 const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('')
 useEffect(() => {
  if (!client || disabled) return
  let active = true
  void (async () => {
   try {
    const result = await client.rpc('manage_account_username', {})
    if (result.error) throw result.error
    if (active) { setUsername(result.data ?? ''); setSavedUsername(result.data ?? '') }
   } catch { if (active) setError('Could not load your username. Reopen account settings to try again.') }
   finally { if (active) setLoading(false) }
  })()
  return () => { active = false }
 }, [client, disabled])
 return <form className="story-form account-details-form" onSubmit={event => {
  event.preventDefault()
  if (!client || busy || disabled || loading) return
  const password = String(new FormData(event.currentTarget).get('currentPassword') ?? '')
  setBusy(true); setError(''); setMessage('')
  void (async () => {
   try {
    if (verifyPassword) {
     try { await verifyPassword(password) } catch { setError('Could not verify your current password. Check it and try again.'); return }
    }
    const result = await client.rpc('manage_account_username', { p_username: username.trim() })
    if (result.error) {
     setError(result.error.code === '23505' ? 'That username is already taken.' : result.error.code === '22023' ? 'Use 3–30 letters, numbers, or underscores.' : 'Could not save your username. Please try again.')
     return
    }
    setUsername(result.data ?? ''); setSavedUsername(result.data ?? ''); setEditing(false); setMessage('Username saved. You can use it to sign in to either app.')
   } catch { setError('Could not save your username. Please try again.') }
   finally { setBusy(false) }
  })()
 }}>
  <AccountUsernameField readOnly value={savedUsername} disabled={disabled || busy || loading} />
  {!editing && <button type="button" className="button secondary" disabled={disabled || busy || loading} onClick={() => setEditing(true)}>Edit</button>}
  {editing && <><AccountUsernameField label="New Username" value={username} onChange={event => setUsername(event.target.value)} disabled={disabled || busy || loading} />
  {verifyPassword && <label>Current Password<input name="currentPassword" type="password" autoComplete="current-password" required disabled={disabled || busy} /></label>}
  <p className="field-help">Choose 3–30 letters, numbers, or underscores. Usernames ignore case. Your email also works for sign-in.</p>
  <div className="form-actions"><button className="button primary" disabled={disabled || busy || loading}>{busy ? 'Saving…' : 'Save Username'}</button><button type="button" className="button secondary" disabled={busy} onClick={() => { setUsername(savedUsername); setEditing(false); setError('') }}>Cancel</button></div></>}
  {actions}
  {error && <p className="error-message" role="alert">{error}</p>}
  {message && <p role="status">{message}</p>}
 </form>
}
