import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'

export function UsernameSettings({ client, disabled = false }: { client: SupabaseClient<Database> | null; disabled?: boolean }) {
 const [username, setUsername] = useState(''), [busy, setBusy] = useState(false)
 const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('')
 useEffect(() => {
  if (!client || disabled) return
  let active = true
  void (async () => {
   try {
    const result = await client.rpc('manage_account_username', {})
    if (result.error) throw result.error
    if (active) setUsername(result.data ?? '')
   } catch { if (active) setError('Could not load your username. Reopen account settings to try again.') }
   finally { if (active) setLoading(false) }
  })()
  return () => { active = false }
 }, [client, disabled])
 return <form className="story-form" onSubmit={event => {
  event.preventDefault()
  if (!client || busy || disabled || loading) return
  setBusy(true); setError(''); setMessage('')
  void (async () => {
   try {
    const result = await client.rpc('manage_account_username', { p_username: username.trim() })
    if (result.error) {
     setError(result.error.code === '23505' ? 'That username is already taken.' : result.error.code === '22023' ? 'Use 3–30 letters, numbers, or underscores.' : 'Could not save your username. Please try again.')
     return
    }
    setUsername(result.data ?? ''); setMessage('Username saved. You can use it to sign in to either app.')
   } catch { setError('Could not save your username. Please try again.') }
   finally { setBusy(false) }
  })()
 }}>
  <label>Account Username<input name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" disabled={disabled || busy || loading} /></label>
  <p className="field-help">Choose 3–30 letters, numbers, or underscores. Usernames ignore case. Your email also works for sign-in.</p>
  <div className="form-actions"><button className="button primary" disabled={disabled || busy || loading}>{busy ? 'Saving…' : 'Save Username'}</button></div>
  {error && <p className="error-message" role="alert">{error}</p>}
  {message && <p role="status">{message}</p>}
 </form>
}
