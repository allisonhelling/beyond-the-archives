import { useState } from 'react'
import { useActivity } from '../../lib/use-activity'
import { isLocalApp } from '../../lib/local-app'
import { metadataSettingsSection } from './settings-sections'
import { connectExtension, desktopExtensionHelp, extensionId, setExtensionId } from './extension'

export function MetadataSettings() {
 const [id, setId] = useState(extensionId)
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 useActivity(busy, 'Connecting the desktop companion…')
 async function connect(event: React.FormEvent) {
  event.preventDefault()
  setBusy(true)
  try {
   setExtensionId(id.trim())
   if (!await connectExtension()) throw new Error('Could not connect. Update and reload the companion, select the matching Hosted or Local environment, allow AO3 access, and check its ID.')
   setMessage('Extension connected. Requested imports will resume.')
  } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not connect.') }
  finally { setBusy(false) }
 }
 return <section id={metadataSettingsSection.id} tabIndex={-1} className="settings-card">
  <h2>{metadataSettingsSection.title}</h2>
  <p>{desktopExtensionHelp}</p>
  {isLocalApp() && <p className="muted">Use Beyond the Archives Companion with Local selected in its extension settings. Build with <code>npm run build:extension</code>, load <code>extension/dist</code> in Chrome, then reconnect.</p>}
  <form className="story-form" onSubmit={event => void connect(event)}>
   <fieldset className="settings-subsection" disabled={busy}>
    <legend>Extension Connection</legend>
    <label>Extension ID<input value={id} onChange={event => setId(event.target.value)} autoComplete="off" spellCheck={false} /><small className="muted">Copy the ID from chrome://extensions or edge://extensions. Select the matching Hosted or Local environment in the companion.</small></label>
    <p className="muted">The companion retrieves only explicitly requested works, series, chapter dates, snapshots, and library scans. Complete any AO3 sign-in or confirmation in its tab. Browser results stay private and preserve manual corrections and reading progress.</p>
    <p className="muted">Keep this app open for long batches. Saved jobs and scan checkpoints survive disconnection. Reopen the app and reconnect after restarting the browser or signing in again.</p>
    <button className="button secondary" type="submit">{busy ? 'Connecting…' : 'Reconnect Extension'}</button>
   </fieldset>
  </form>
  {message && <p role="status" className="muted">{message}</p>}
 </section>
}
