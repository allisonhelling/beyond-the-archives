import { useActivity } from '../../lib/use-activity'
import { accountSettingsSection } from './settings-sections'
import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { authRedirectUrl, supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'

export function AccountSettings() {
  const { session } = useAuth()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useActivity(Boolean(busy), 'Updating your account…')
  async function reset() {
    if (!supabase || !session?.user.email || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, { redirectTo: authRedirectUrl() })
      setMessage(error ? 'Could not send a recovery email. Please try again.' : 'Check your email for a password recovery link. Open it in this browser.')
    } catch { setMessage('Could not send a recovery email. Please try again.') }
    finally { setBusy(false) }
  }
  return <section id={accountSettingsSection.id} tabIndex={-1} className="settings-card"><div className="section-title"><LockKeyhole size={21} /><h2>{accountSettingsSection.title}</h2></div><dl><div><dt>Signed In As</dt><dd>{session?.user.email}</dd></div><div><dt>Library Visibility</dt><dd>Private · invitation only</dd></div></dl><button className="button secondary" onClick={() => void reset()} disabled={busy || sampleMode}>{busy ? 'Sending…' : 'Send Password Recovery Email'}</button>{sampleMode && <p className="muted">Account settings are unavailable in the local sample preview.</p>}{message && <p role="status" className="muted">{message}</p>}</section>
}
