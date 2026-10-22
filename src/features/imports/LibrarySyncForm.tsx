import { Info } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useEffect, useId, useRef, useState } from 'react'
import { sampleMode } from '../../lib/sample-mode'
import { Link } from 'react-router-dom'
import { useLibrarySyncStatus } from './LibrarySyncProvider'
import { connectExtension, librarySyncCommand } from './extension'
import { readAo3Rows, uniqueCsvWorks, csvWorkKey, type CsvConflict, type CsvWork } from './ao3-csv'
import { submitLibrarySync } from './repository'

export function LibrarySyncForm({ onImported }: { onImported: (batch: string | null) => Promise<void> }) {
 const [updateDeleted, setUpdateDeleted] = useState(true)
 const intervalId = useId()
 const [url, setUrl] = useState(''), [mode, setMode] = useState('full')
 const [startPage, setStartPage] = useState(''), [endPage, setEndPage] = useState('')
 const { state, setState, refresh } = useLibrarySyncStatus()
 const [delayDraft, setDelayDraft] = useState<string | null>(null)
 const interval = delayDraft ?? String(state?.delaySeconds ?? 15)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const [conflicts, setConflicts] = useState<CsvConflict[]>([])
 const pending = useRef(false)
 useEffect(() => {
  if (sampleMode) void connectExtension().then(connected => { if (connected) return refresh() }).catch(() => {})
 }, [refresh])
 async function action(name: string) {
  if (pending.current) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  try {
   if (name === 'start' && !await connectExtension()) throw new Error(sampleMode ? 'Load or reload AO3 Library Companion (Local) from extension/local/dist in Chrome, then retry.' : 'Connect the extension in Settings, then try again.')
   const reply = await librarySyncCommand(name, name === 'start' ? { url: url.trim(), mode, updateDeleted, delaySeconds: Number(interval), ...(startPage !== '' ? { startPage: Number(startPage) } : {}), ...(endPage !== '' ? { endPage: Number(endPage) } : {}) } : { scanId: state?.id, ...(['set-delay', 'resume'].includes(name) ? { delaySeconds: Number(interval) } : {}) })
   setState(reply.state ?? null)
   if (['start', 'set-delay', 'resume'].includes(name)) setDelayDraft(null)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Library sync failed.') }
  finally { pending.current = false; setBusy(false) }
 }
 async function save() {
  if (!state || pending.current) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  let imported = 0, kept = 0, batch: string | null = null
  const differences = new Map<string, CsvConflict>()
  setConflicts([])
  try {
   // Page-sized transactions support large libraries and safe, idempotent retry.
   for (let offset = 0; offset < state.pages; offset++) {
    const page = (state.startPage ?? 1) + offset
    setMessage(`Importing saved page ${offset + 1} of ${state.pages} (AO3 page ${page})…`)
    const reply = await librarySyncCommand('page', { page, scanId: state.id })
    const rows = uniqueCsvWorks(readAo3Rows(reply.rows ?? []).filter((row): row is CsvWork => row.workId !== undefined))
    if (!rows.length) continue
    const result = await submitLibrarySync(rows, { mode: state.mode, updateDeleted: state.updateDeleted })
    for (const conflict of result.bookmarkConflicts ?? []) differences.set(csvWorkKey(conflict), conflict)
    setConflicts([...differences.values()])
    imported += result.imported; kept += result.kept; batch = result.batch ?? batch
   }
   const reply = await librarySyncCommand('finish', { scanId: state.id }); setState(reply.state ?? null)
   setMessage(`Imported ${imported} works; kept ${kept} existing works. Non-empty AO3 metadata was refreshed; existing personal data was preserved.`)
   await onImported(batch)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Import failed. Retry to continue safely.'); setMessage('Saved pages remain available. Retrying keeps works already imported.') }
  finally { pending.current = false; setBusy(false) }
 }
 const saved = state && ['running', 'paused', 'ready'].includes(state.status)
 const selectedMode = saved && state.mode ? state.mode : mode
 return <section className="settings-card story-form" aria-labelledby="library-sync-heading">
  <h2 id="library-sync-heading">AO3 Library Sync</h2>
  {sampleMode && <p className="field-help">Sample imports use the local extension and save only to this browser’s sample library. No library account or background worker is needed. Load extension/local/dist in Chrome before starting.</p>}
  <p>Scan your Bookmarks or Marked for Later across pages using AO3 Library Companion. {sampleMode ? <>The local extension connects automatically; paste an unfiltered list URL.</> : <><Link to="/settings#settings-metadata">Connect the updated extension in Settings</Link>, then paste an unfiltered list URL.</>} Run each list separately.</p>
  <p className="field-help">Full scan collects all listings from a list. Quick Sync checks newest entries until a previously imported record is found. Existing notes, personal tags, ratings, and progress are kept. Non-empty AO3 work metadata refreshes automatically, including existing works; explicit manual corrections are preserved. Bookmark differences are reported after import. New bookmarks dated after the work’s latest update are marked Finished, with the bookmark date as the finished date and the listed published chapters marked read. Earlier or same-day bookmarks are marked Reading with chapter progress unconfirmed. Missing dates also leave bookmarks Reading with unconfirmed progress. New Marked for Later works are saved as To Read.</p>
  <p className="field-help">Ensure that bookmarks are sorted by "Date Bookmarked". Changing the sort order may cause the scanner to miss entries.</p>
  <form className="story-form" onSubmit={event => { event.preventDefault(); void action('start') }}>
   <label>AO3 List URL<input type="url" required value={url} placeholder="https://archiveofourown.org/users/USERNAME/bookmarks" disabled={busy || Boolean(saved)} onChange={event => setUrl(event.target.value)} /></label>
   <p className="field-help">For Marked for Later use https://archiveofourown.org/users/USERNAME/readings?show=to-read</p>
   <div className="form-controls-row">
   <label><span className="editable-field-heading">Scan Mode</span><select className="select-fit" value={selectedMode} disabled={busy || Boolean(saved)} onChange={event => { setMode(event.target.value); if (event.target.value === 'quick') { setStartPage(''); setEndPage('') } }}><option value="full">Full Library Scan</option><option value="quick">Quick Sync</option></select></label>
   <div className="form-control">
    <div className="editable-field-heading"><label htmlFor={intervalId}>Time Between Page Requests</label><Tooltip description="Default interval: 15 seconds. Choose 5–3,600 seconds; browser scheduling and a small random delay may make requests slower.">{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label="Request interval information" aria-describedby={descriptionId}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>
    <div className="input-with-unit"><input id={intervalId} aria-describedby={`${intervalId}-unit`} className="input-fit" type="number" required min={5} max={3600} step={1} value={interval} disabled={busy} onChange={event => setDelayDraft(event.target.value)} /><span id={`${intervalId}-unit`}>seconds</span></div>
   </div>
   </div>
   {selectedMode === 'full' && <label className="check-label"><input type="checkbox" checked={saved ? state?.updateDeleted !== false : updateDeleted} disabled={busy || Boolean(saved)} onChange={event => setUpdateDeleted(event.target.checked)} />Update Deleted Work Status</label>}
   <p className="field-help">Deleted-work bookmarks are kept. Full scans can mark previously saved works deleted only when AO3 explicitly labels their bookmark deleted. Quick Sync imports new deleted bookmarks but leaves existing deletion status unchanged. Missing listings never mark a work deleted.</p>
   {selectedMode === 'full' && <fieldset className="scan-page-limits">
    <legend>Limit Full Library Scan (Optional)</legend>
    <div className="form-grid form-grid-two-columns">
     <label>Start Page<input type="number" min={1} max={500} step={1} value={startPage} placeholder="1" disabled={busy || Boolean(saved)} onChange={event => setStartPage(event.target.value)} /></label>
     <label>End Page<input type="number" min={startPage ? Number(startPage) : 1} max={500} step={1} value={endPage} placeholder="Leave Blank" disabled={busy || Boolean(saved)} onChange={event => setEndPage(event.target.value)} /></label>
    </div>
    <p className="field-help">Enter page numbers only; both endpoints are included. Leave Start Page blank for page 1 and End Page blank to scan to the list’s end. Selected ranges are partial scans and do not update the Quick Sync baseline.</p>
   </fieldset>}
   {state && ['running', 'paused'].includes(state.status) && <button type="button" className="button secondary" disabled={busy} onClick={() => void action('set-delay')}>Apply Request Interval</button>}
   <button className="button primary" disabled={busy || Boolean(saved)}>Start Library Scan</button>
  </form>
  <p className="field-help">Uses one scan tab with your selected request interval; background alarms may make it slower. Existing work imports finish first. Keep Chrome running. If sign-in or a request restriction blocks the scan, an alert lets you open the scan tab. Resolve the issue there, then resume manually. Checkpoints stay on this device until imported or discarded; no individual work pages are opened.</p>
  {state && <p role="status">{state.status} · {state.pages} pages saved · {state.count} works collected · {state.skipped} series or unsupported entries skipped</p>}
  {state?.limited && <p className="field-help">Partial scan · pages {state.startPage ?? 1}–{state.endPage ?? 'end of list'}{state.partial ? " · stopped at the selected end page; more pages remain on AO3" : ""}. Importing this range will not update the Quick Sync baseline.</p>}
  {state?.error && <p role="alert" className="error-message">{state.error}</p>}
  <div className="form-actions">
   {state?.status === 'running' && <button className="button secondary" disabled={busy} onClick={() => void action('pause')}>Pause Scan</button>}
   {state?.status === 'paused' && <button className="button secondary" disabled={busy} onClick={() => void action('resume')}>Resume Scan</button>}
   {state?.status === 'ready' && <button className="button primary" disabled={busy} onClick={() => void save()}>Import Scanned Works</button>}
   {saved && <button className="button secondary" disabled={busy} onClick={() => void action('discard')}>Discard Scan</button>}
  </div>
  {conflicts.length > 0 && <details><summary>{conflicts.length} Bookmark Conflicts — Personal Data Kept</summary><p>These incoming bookmarks differ in notes, personal tags, or reading state. Your library’s values were kept. Use CSV import to review and overwrite bookmark data if desired.</p><ul>{conflicts.map(conflict => <li key={csvWorkKey(conflict)}><Link to={`/stories/${conflict.id}`}>{conflict.title || `AO3 work ${conflict.workId}`}</Link></li>)}</ul></details>}
  {message && <p role="status">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}
 </section>
}
