import { browserBarSettingsSection } from './settings-sections'
import { formatDate } from '../../lib/dates'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { useLocation } from 'react-router-dom'

type Device = { id: string; name: string; paired: boolean; expires_at: string }
export function BrowserBarSettings() {
 const section = useRef<HTMLElement>(null)
 const { hash } = useLocation()
 useEffect(() => {
  if ([`#${browserBarSettingsSection.id}`, ...browserBarSettingsSection.aliases].includes(hash)) section.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
 }, [hash])
 const [devices, setDevices] = useState<Device[]>([])
 const [name, setName] = useState('My browser')
 const [code, setCode] = useState('')
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 useEffect(() => {
  let active = true
  if (supabase && !sampleMode) void supabase.rpc('manage_userscript_device', { p_action: 'list' }).then(({ data, error }) => {
   if (!active) return
   if (error) setMessage('Could not load devices. Apply the userscript migration and try again.')
   else setDevices(data as Device[])
  })
  return () => { active = false }
 }, [])
 async function manage(action: 'create' | 'revoke' | 'list', id?: string) {
  if (!supabase || busy || sampleMode) return
  setBusy(true); setMessage('')
  try {
   const { data, error } = await supabase.rpc('manage_userscript_device', { p_action: action, p_name: name, ...(id && { p_id: id }) })
   if (error) throw error
   if (action === 'create') {
    setCode((data as { code: string }).code)
    setMessage('Paste this one-time code into the AO3 panel within 5 minutes. It grants this device library access for 90 days. Keep it private.')
   } else { setDevices(data as Device[]); if (action === 'revoke') setMessage('Device disconnected.') }
  } catch { setMessage('Could not update devices. Check your connection, sign-in, and userscript migration.') }
  finally { setBusy(false) }
 }
 async function copyCode() {
  try { await navigator.clipboard.writeText(code); setMessage('Pairing code copied.') }
  catch { setMessage('Could not copy. Select the code and copy it manually.') }
 }
 return <section id={browserBarSettingsSection.id} tabIndex={-1} ref={section} className="settings-card"><h2 id="ao3-browser-bar">AO3 Browser Bar</h2>
  <p>Save and edit your library directly on AO3 using AO3 Library Companion in Chrome or Edge, or the AO3 Library userscript in Safari. Create a pairing code here, then paste it into Connect Library on an AO3 work or series page.</p>
  <section className="settings-subsection" aria-labelledby="browser-bar-install-title"><h3 id="browser-bar-install-title">Install or Update</h3>
  <p>Chrome and Edge: install or reload AO3 Library Companion, then reload AO3. The bar uses its own device pairing, separate from the extension connection for metadata imports and scans.</p>
  <p className="muted">Safari: to install or update, configure <code>.env.local.hosted</code> with the hosted website’s public settings and run <code>npm run build:userscript</code> in the project, then copy <code>userscript/dist/ao3-library.user.js</code> into the directory selected in Userscripts. Replace the existing file, open the Userscripts Safari popup, and reload AO3. Check the visible version at the bottom of the AO3 panel. Updates are manual; this script does not assume automatic updates.</p>
  </section>
  <section className="settings-subsection" aria-labelledby="browser-bar-pair-title"><h3 id="browser-bar-pair-title">Pair a Browser</h3>
  <form className="story-form" onSubmit={event => { event.preventDefault(); void manage('create') }}>
   <label>Device name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
   <div className="form-actions"><button className="button secondary" disabled={busy || sampleMode}>Create pairing code</button><button className="button secondary" type="button" disabled={busy || sampleMode} onClick={() => void manage('list')}>Refresh devices</button></div>
   {code && <label>One-time pairing code<input readOnly value={code} title="Click to copy pairing code" onClick={() => void copyCode()} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void copyCode() } }} onFocus={event => event.target.select()} autoComplete="off" spellCheck={false} /></label>}
  </form>
  {message && <p role="status" className="muted">{message}</p>}
  </section>
  <section className="settings-subsection" aria-labelledby="browser-bar-devices-title"><h3 id="browser-bar-devices-title">Connected Devices</h3>
  <ul>{devices.map(device => <li key={device.id}>{device.name} · {device.paired ? 'Connected' : 'Awaiting pairing'} · expires {formatDate(device.expires_at)} <button className="button secondary compact" disabled={busy} onClick={() => void manage('revoke', device.id)}>Disconnect {device.name}</button></li>)}</ul>
  <p className="muted">Disconnect here to revoke access even if the device is lost. Signing out of the website leaves paired devices connected until disconnected or expired. New codes replace previous unused codes.</p>
  </section>
 </section>
}
