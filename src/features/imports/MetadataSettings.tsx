import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { connectExtension, disconnectExtension, extensionId, setExtensionId } from './extension'

export function ExtensionConnection() {
 const { session, loading } = useAuth()
 useEffect(() => {
  if (sampleMode || loading) return
  // Stay mounted across the auth gate; remounts and closing the page must not
  // disconnect queued imports. Only a resolved signed-out session does that.
  void (session ? connectExtension(session) : disconnectExtension()).catch(() => {})
 }, [session, loading])
 return null
}

export function MetadataSettings() {
 const { session } = useAuth()
 const userId = session?.user.id
 const [mode, setMode] = useState('direct')
 const [id, setId] = useState(extensionId)
 const [ready, setReady] = useState(false)
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 useEffect(() => {
  let active = true
  async function load() {
   try {
    if (!supabase || !userId || sampleMode) return
    const { data, error } = await supabase.from('metadata_preferences').select('retrieval_mode').eq('user_id', userId).maybeSingle()
    if (!active) return
    if (error) throw error
    setMode(data?.retrieval_mode ?? 'direct')
    setReady(true)
   } catch { if (active) setMessage('Could not load metadata settings. Check your connection and apply the extension migration, then reload.') }
  }
  void load()
  return () => { active = false }
 }, [userId])
 async function connect() {
  setExtensionId(id.trim())
  if (!await connectExtension()) throw new Error('Could not connect. Load the extension built for this site, allow its AO3 access, and check its ID.')
 }
 async function save(event: React.FormEvent) {
  event.preventDefault()
  if (!supabase || !userId || busy || !ready) return
  setBusy(true)
  try {
   if (mode === 'extension') await connect()
   const { error } = await supabase.from('metadata_preferences').upsert({ user_id: userId, retrieval_mode: mode })
   if (error) throw new Error('Could not save metadata settings. Please try again.')
   setMessage('Metadata mode saved for new import and refresh requests. Existing requests keep their selected mode.')
  } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save metadata settings.') }
  finally { setBusy(false) }
 }
 return <section className="settings-card">
  <h2>AO3 metadata retrieval</h2>
  <form className="story-form" onSubmit={event => void save(event)}>
   <fieldset disabled={!ready || busy || sampleMode}>
    <legend>Retrieval mode</legend>
    <label>How to load AO3 metadata<select value={mode} onChange={event => setMode(event.target.value)}>
     <option value="direct">Direct retrieval (hosted worker)</option>
     <option value="extension">Browser extension (requested works only)</option>
    </select></label>
    {mode === 'extension' && <label>Extension ID<input value={id} onChange={event => setId(event.target.value)} autoComplete="off" spellCheck={false} /><small>Copy the ID from chrome://extensions or edge://extensions after installing AO3 Library Companion. This device setting is stored in this browser.</small></label>}
    <p className="muted">The extension reads only works requested by Import URLs or Refresh metadata. It reuses a matching AO3 tab or opens one, then waits for the work to load. Complete any sign-in or confirmation in that tab. Ordinary browsing sends nothing.</p>
    <p className="muted">Browser metadata stays private and preserves manual corrections and reading progress. Keep this app open for long batches. If you close it, processing continues until the current sign-in token expires. After restarting the browser or signing in again, open this app to reconnect.</p>
    <button className="button secondary" type="submit">{busy ? 'Connecting and saving…' : 'Save metadata mode'}</button>
    {mode === 'extension' && <button className="button secondary" type="button" onClick={() => { setBusy(true); void connect().then(() => setMessage('Extension connected. Requested imports will resume.')).catch(error => setMessage(error instanceof Error ? error.message : 'Connection failed. Sign in again.')).finally(() => setBusy(false)) }}>Reconnect extension</button>}
   </fieldset>
  </form>
  {sampleMode && <p className="muted">Metadata settings require the connected application.</p>}
  {message && <p role="status" className="muted">{message}</p>}
 </section>
}
