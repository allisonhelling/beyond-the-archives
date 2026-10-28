import { useLayout } from '../../lib/use-layout'
import { metadataRetrievalMode, type RetrievalMode } from './metadata-preferences'
import { metadataSettingsSection } from './settings-sections'
import { isLocalApp } from '../../lib/local-app'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { connectExtension, extensionId, setExtensionId } from './extension'

export function MetadataSettings() {
 const { session } = useAuth()
 const userId = session?.user.id
 const layout = useLayout()
 const [mode, setMode] = useState<RetrievalMode>('direct')
 const [mobileMode, setMobileMode] = useState<RetrievalMode | 'inherit'>('inherit')
 const currentMode = metadataRetrievalMode({ retrieval_mode: mode, retrieval_mode_mobile: mobileMode === 'inherit' ? null : mobileMode }, layout)
 const [id, setId] = useState(extensionId)
 const [ready, setReady] = useState(false)
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 useEffect(() => {
  let active = true
  async function load() {
   try {
    if (!supabase || !userId || sampleMode) return
    const { data, error } = await supabase.from('metadata_preferences').select('retrieval_mode,retrieval_mode_mobile').eq('user_id', userId).maybeSingle()
    if (!active) return
    if (error) throw error
    setMode(metadataRetrievalMode(data, 'desktop'))
    setMobileMode(data?.retrieval_mode_mobile === 'direct' || data?.retrieval_mode_mobile === 'extension' ? data.retrieval_mode_mobile : 'inherit')
    setReady(true)
   } catch { if (active) setMessage('Could not load metadata settings. Check your connection and apply the latest database migrations, then reload.') }
  }
  void load()
  return () => { active = false }
 }, [userId])
 async function connect() {
  setExtensionId(id.trim())
  if (!await connectExtension()) throw new Error('Could not connect. Select the matching Hosted or Local environment in the extension settings, allow AO3 access, and check its ID.')
 }
 async function save(event: React.FormEvent) {
  event.preventDefault()
  if (!supabase || !userId || busy || !ready) return
  setBusy(true)
  try {
   if (currentMode === 'extension') await connect()
   const { error } = await supabase.from('metadata_preferences').upsert({ user_id: userId, retrieval_mode: mode, retrieval_mode_mobile: mobileMode === 'inherit' ? null : mobileMode })
   if (error) throw new Error('Could not save metadata settings. Apply the latest database migrations and try again.')
   setMessage('Metadata mode saved for new import and refresh requests. Existing requests keep their selected mode.')
  } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save metadata settings.') }
  finally { setBusy(false) }
 }
 return <section id={metadataSettingsSection.id} tabIndex={-1} className="settings-card">
  <h2>{metadataSettingsSection.title}</h2>
  {isLocalApp() && <p className="muted">Use Beyond the Archives Companion with Local selected in its extension settings. Build the extension with <code>npm run build:extension</code>, load <code>extension/dist</code> in Chrome, then reconnect. Enter the same extension ID you use for the hosted library. The older local build remains available as a fallback.</p>}
  <form className="story-form" onSubmit={event => void save(event)}>
   <fieldset className="settings-subsection" disabled={busy || (!sampleMode && !ready)}>
    <legend>{sampleMode ? 'Extension Connection' : 'Retrieval Mode'}</legend>
    {!sampleMode && <>
     <div className="form-controls-row">{(['desktop', 'mobile'] as const).map(target => <label key={target}>{target === 'desktop' ? 'Desktop Metadata Retrieval' : 'Mobile Metadata Retrieval'}<select value={target === 'desktop' ? mode : mobileMode} onChange={event => { if (target === 'desktop') setMode(event.target.value as RetrievalMode); else setMobileMode(event.target.value as RetrievalMode | 'inherit') }}>
      {target === 'mobile' && <option value="inherit">Same as Desktop</option>}
      <option value="direct">Direct Retrieval (Hosted Worker)</option>
      <option value="extension">Browser Extension (Requested Works and Series)</option>
     </select></label>)}</div>
     <p className="field-help">New import and refresh requests use the choice for the layout they are started from. Existing requests keep their selected mode. For Safari, use Direct Retrieval; the Safari userscript does not process import metadata jobs. Connect the companion separately in each browser that uses Browser Extension.</p>
    </>}
    {(sampleMode || currentMode === 'extension') && <label>Extension ID<input value={id} onChange={event => setId(event.target.value)} autoComplete="off" spellCheck={false} /><small className="muted">Copy the ID from chrome://extensions or edge://extensions after installing Beyond the Archives Companion. Select the matching Hosted or Local environment in the extension settings.</small></label>}
    <p className="muted">The extension reads only works requested by Import URLs or Refresh metadata and series explicitly requested for import preview. Library listing scans are started separately from Mass Import from AO3. It reuses a matching AO3 tab or opens one, then waits for the work to load. Complete any sign-in or confirmation in that tab. Metadata imports are explicit. If you pair the AO3 Browser Bar separately, visiting a work or series loads its saved library details; saving changes still requires your action.</p>
    <p className="muted">Browser metadata stays private and preserves manual corrections and reading progress. Keep this app open for long batches. If you close it, processing continues until the current sign-in token expires. After restarting the browser or signing in again, open this app to reconnect.</p>
    {!sampleMode && <button className="button secondary" type="submit">{busy ? 'Connecting and Saving…' : 'Save Metadata Mode'}</button>}
    {(sampleMode || currentMode === 'extension') && <button className="button secondary" type="button" onClick={() => { setBusy(true); void connect().then(() => setMessage('Extension connected. Requested imports will resume.')).catch(error => setMessage(error instanceof Error ? error.message : 'Connection failed. Sign in again.')).finally(() => setBusy(false)) }}>Reconnect Extension</button>}
   </fieldset>
  </form>
  {sampleMode && <p className="muted">Local sample imports use this extension connection. Retrieval preferences require the connected application.</p>}
  {message && <p role="status" className="muted">{message}</p>}
 </section>
}
