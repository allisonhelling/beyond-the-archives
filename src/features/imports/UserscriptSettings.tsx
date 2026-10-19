import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { useLocation } from 'react-router-dom'

type Device = { id: string; name: string; paired: boolean; expires_at: string }
export function UserscriptSettings() {
 const section = useRef<HTMLElement>(null)
 const { hash } = useLocation()
 useEffect(() => {
  if (hash === '#ios-safari-userscript') section.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
 }, [hash])
 const [devices, setDevices] = useState<Device[]>([])
 const [name, setName] = useState('Safari on iPhone')
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
 return <section id="ios-safari-userscript" ref={section} className="settings-card"><h2>iOS Safari userscript</h2>
  <p className="muted">Install the built AO3 Library userscript in the free Userscripts app. Pair it here to save and edit your library while reading on AO3.</p>
  <p className="muted">To install or update, run <code>npm run build:userscript</code> in the project, then copy <code>userscript/dist/ao3-library.user.js</code> into the directory selected in Userscripts. Replace the existing file, open the Userscripts Safari popup, and reload AO3. Check the visible version at the bottom of the AO3 panel. Updates are manual; this script does not assume automatic updates.</p>
  <form className="story-form" onSubmit={event => { event.preventDefault(); void manage('create') }}>
   <label>Device name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
   <div className="form-actions"><button className="button secondary" disabled={busy || sampleMode}>Create pairing code</button><button className="button secondary" type="button" disabled={busy || sampleMode} onClick={() => void manage('list')}>Refresh devices</button></div>
   {code && <label>One-time pairing code<input readOnly value={code} onFocus={event => event.target.select()} autoComplete="off" spellCheck={false} /></label>}
  </form>
  {message && <p role="status" className="muted">{message}</p>}
  <ul>{devices.map(device => <li key={device.id}>{device.name} · {device.paired ? 'Connected' : 'Awaiting pairing'} · expires {new Date(device.expires_at).toLocaleDateString()} <button className="button secondary compact" disabled={busy} onClick={() => void manage('revoke', device.id)}>Disconnect {device.name}</button></li>)}</ul>
  <p className="muted">Disconnect here to revoke access even if the device is lost. Signing out of the website leaves paired devices connected until disconnected or expired. New codes replace previous unused codes.</p>
 </section>
}
