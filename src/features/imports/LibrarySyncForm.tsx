import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { connectExtension, librarySyncCommand, type LibrarySyncState } from './extension'
import { readAo3Rows, uniqueCsvWorks, type CsvWork } from './ao3-csv'
import { submitLibrarySync } from './repository'

export function LibrarySyncForm({ onImported }: { onImported: (batch: string | null) => Promise<void> }) {
 const [url, setUrl] = useState(''), [mode, setMode] = useState('full')
 const [state, setState] = useState<LibrarySyncState | null>(null)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const pending = useRef(false)
 useEffect(() => {
  let active = true
  const refresh = () => { if (!pending.current) void librarySyncCommand('status').then(reply => { if (active) setState(reply.state ?? null) }).catch(() => {}) }
  refresh(); const timer = setInterval(refresh, 5000)
  return () => { active = false; clearInterval(timer) }
 }, [])
 async function action(name: string) {
  if (pending.current) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  try {
   if (name === 'start' && !await connectExtension()) throw new Error('Connect the extension in Settings, then try again.')
   const reply = await librarySyncCommand(name, name === 'start' ? { url: url.trim(), mode } : { scanId: state?.id })
   setState(reply.state ?? null)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Library sync failed.') }
  finally { pending.current = false; setBusy(false) }
 }
 async function save() {
  if (!state || pending.current) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  let imported = 0, kept = 0, batch: string | null = null
  try {
   // Page-sized transactions support large libraries and safe, idempotent retry.
   for (let page = 1; page <= state.pages; page++) {
    setMessage(`Importing saved page ${page} of ${state.pages}…`)
    const reply = await librarySyncCommand('page', { page, scanId: state.id })
    const rows = uniqueCsvWorks(readAo3Rows(reply.rows ?? []).filter((row): row is CsvWork => row.workId !== undefined))
    if (!rows.length) continue
    const result = await submitLibrarySync(rows)
    imported += result.imported; kept += result.kept; batch = result.batch ?? batch
   }
   const reply = await librarySyncCommand('finish', { scanId: state.id }); setState(reply.state ?? null)
   setMessage(`Imported ${imported} works; kept ${kept} existing works. Existing personal data was preserved.`)
   await onImported(batch)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Import failed. Retry to continue safely.'); setMessage('Saved pages remain available. Retrying keeps works already imported.') }
  finally { pending.current = false; setBusy(false) }
 }
 const saved = state && ['running', 'paused', 'ready'].includes(state.status)
 return <section className="settings-card story-form" aria-labelledby="library-sync-heading">
  <h2 id="library-sync-heading">AO3 Library Sync</h2>
  <p>Scan your Bookmarks or Marked for Later across pages using AO3 Library Companion. <Link to="/settings#settings-metadata">Connect the updated extension in Settings</Link>, then paste an unfiltered list URL. Run each list separately.</p>
  <p className="field-help">Full scan collects listing metadata. Quick Sync checks newest entries until a previously imported record is found; it can miss reordered entries and never detects removals. Existing library works, notes, tags, ratings, and progress are always kept. New bookmarks use the CSV importer’s reading-status rules; chapter progress remains unconfirmed when listing dates cannot establish it.</p>
  <form className="story-form" onSubmit={event => { event.preventDefault(); void action('start') }}>
   <label>AO3 list URL<input type="url" required value={url} placeholder="https://archiveofourown.org/users/USERNAME/bookmarks" disabled={busy || Boolean(saved)} onChange={event => setUrl(event.target.value)} /></label>
   <p className="field-help">For Marked for Later use https://archiveofourown.org/users/USERNAME/readings?show=to-read</p>
   <label>Scan mode<select value={mode} disabled={busy || Boolean(saved)} onChange={event => setMode(event.target.value)}><option value="full">Full library scan</option><option value="quick">Quick Sync — recent additions</option></select></label>
   <button className="button primary" disabled={busy || Boolean(saved)}>Start library scan</button>
  </form>
  <p className="field-help">Uses one scan tab with at least 15 seconds between page requests; background alarms may make it slower. Existing work imports finish first. Keep Chrome running. Check the scan tab for login or rate restrictions, then resume manually. Checkpoints stay on this device until imported or discarded; no individual work pages are opened.</p>
  {state && <p role="status">{state.status} · {state.pages} pages saved · {state.count} works collected · {state.skipped} deleted, series, or unsupported entries skipped</p>}
  {state?.error && <p role="alert" className="error-message">{state.error}</p>}
  <div className="form-actions">
   {state?.status === 'running' && <button className="button secondary" disabled={busy} onClick={() => void action('pause')}>Pause scan</button>}
   {state?.status === 'paused' && <button className="button secondary" disabled={busy} onClick={() => void action('resume')}>Resume scan</button>}
   {state?.status === 'ready' && <button className="button primary" disabled={busy} onClick={() => void save()}>Import scanned works</button>}
   {saved && <button className="button secondary" disabled={busy} onClick={() => void action('discard')}>Discard scan</button>}
  </div>
  {message && <p role="status">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}
 </section>
}
