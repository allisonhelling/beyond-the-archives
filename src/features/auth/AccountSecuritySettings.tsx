import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import { confirmPassword, signOutEverywhere, verifyCurrentPassword } from '../../lib/auth-account'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'

/** The organizer and reader use the same password, email, and session controls. */
export function AccountSecuritySettings({ client, disabled = false, redirectTo, beforeSignOut, afterSignOut }: { client: SupabaseClient<Database> | null; disabled?: boolean; redirectTo: string; beforeSignOut?: () => Promise<unknown>; afterSignOut?: () => Promise<unknown> }) {
 const [editing, setEditing] = useState<'password' | 'email' | null>(null)
 const [hasPassword, setHasPassword] = useState<boolean | null>(null)
 const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [confirmSignOut, setConfirmSignOut] = useState(false)
 useEffect(() => {
  if (!client || disabled) return
  let active = true
  void Promise.resolve(client.rpc('account_has_password', {})).then(({ data, error }) => { if (active) { if (error) setError('Could not load password settings. Reopen your account to retry.'); else setHasPassword(Boolean(data)) } }).catch(() => { if (active) setError('Could not load password settings. Reopen your account to retry.') })
  return () => { active = false }
 }, [client, disabled])
 async function run(action: () => Promise<void>) {
  if (!client || busy || disabled) return
  setBusy(true); setMessage(''); setError('')
  try { await action() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update account settings.') } finally { setBusy(false) }
 }
 return <div className="account-security-settings">
  <div className="form-actions"><button type="button" className="button secondary" disabled={disabled || busy || hasPassword === null} onClick={() => { setEditing('password'); setMessage(''); setError('') }}>{hasPassword === false ? 'Set Password' : 'Change Password'}</button><button type="button" className="button secondary" disabled={disabled || busy} onClick={() => { setEditing('email'); setMessage(''); setError('') }}>Edit Email</button></div>
  {editing && <form key={editing} className="story-form" onSubmit={event => {
   event.preventDefault(); const form = event.currentTarget, fields = new FormData(form)
   void run(async () => {
    if (!client) return
    const currentPassword = String(fields.get('currentPassword') ?? '')
    if (editing === 'password') confirmPassword(fields)
    if (editing === 'email' || hasPassword !== false) await verifyCurrentPassword(client, currentPassword)
    if (editing === 'password') {
     const { error } = await client.auth.updateUser({ password: String(fields.get('password')), ...(hasPassword !== false ? { current_password: currentPassword } : {}) })
     if (error) throw error
     setHasPassword(true); setMessage('Password saved. Your account email receives a security notification.')
    } else {
     const { error } = await client.auth.updateUser({ email: String(fields.get('email')).trim() }, { emailRedirectTo: redirectTo })
     if (error) throw error
     setMessage('Confirm the email change using the links sent to your current and new addresses. Your old address also receives a security notification after the change.')
    }
    form.reset(); setEditing(null)
   })
  }}><fieldset className="settings-subsection" disabled={disabled || busy}><legend>{editing === 'password' ? 'Change Password' : 'Change Email'}</legend>
   {(editing === 'email' || hasPassword !== false) && <label>Current Password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>}
   {editing === 'password' ? <><label>New Password<input name="password" type="password" minLength={6} autoComplete="new-password" required /></label><label>Confirm New Password<input name="confirmPassword" type="password" minLength={6} autoComplete="new-password" required /></label></> : <label>New Email Address<input name="email" type="email" autoComplete="email" required /></label>}
   <div className="form-actions"><button className="button primary">{busy ? 'Saving…' : editing === 'password' ? 'Save Password' : 'Save Email'}</button><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancel</button></div>
  </fieldset></form>}
  <button type="button" className="button secondary" disabled={disabled || busy} onClick={() => void run(async () => {
   if (!client) return
   const { data, error } = await client.auth.getUser(); if (error || !data.user?.email) throw new Error('Sign in again before requesting recovery.')
   const result = await client.auth.resetPasswordForEmail(data.user.email, { redirectTo }); if (result.error) throw result.error
   setMessage('Check your email for a password recovery link. Open it in this browser.')
  })}>Send Password Recovery Email</button>
  <div className="form-actions"><button type="button" className="button secondary" disabled={disabled || busy} onClick={() => setConfirmSignOut(true)}>Log Out All Devices</button></div>
  {confirmSignOut && <ConfirmationDialog title="Log Out All Devices?" confirmLabel="Log Out All Devices" pendingLabel="Signing Out…" onClose={() => setConfirmSignOut(false)} onConfirm={async () => { if (!client) return; await beforeSignOut?.(); await signOutEverywhere(client); await afterSignOut?.() }}><p>Sign out of both apps on all devices and disconnect paired AO3 browser bars. Existing access tokens can remain usable until they expire. Downloaded EPUBs remain on their devices.</p></ConfirmationDialog>}
  {message && <p role="status">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}
 </div>
}
