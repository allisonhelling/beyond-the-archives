import { BookmarkChapterDatesOption } from './BookmarkChapterDatesOption'
import { ImportReadingStatus } from './ImportReadingStatus'
import type { Status } from '../library/model'
import { Dialog } from '../../components/Dialog'
import { ao3UsernamePattern, normalizeAo3Username, useAo3Username } from './ao3-username'
import { saveCollection } from '../library/repository'
import { Info } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { sampleMode } from '../../lib/sample-mode'
import { Link } from 'react-router-dom'
import { statuses } from '../library/model'
import { formatDate } from '../../lib/dates'
import { useLibrarySyncStatus } from './LibrarySyncProvider'
import { connectExtension, librarySyncCommand } from './extension'
import { readAo3Rows, uniqueCsvWorks, csvWorkKey, type CsvConflict, type CsvWork } from './ao3-csv'
import { submitLibrarySync } from './repository'
import { SeriesImportReview } from './SeriesImportReview'

export function LibrarySyncForm({ onImported }: { onImported: (batch: string | null) => Promise<void> }) {
 const usernamePreference = useAo3Username()
 const [usernameKind, setUsernameKind] = useState<'bookmarks' | 'marked_for_later' | null>(null)
 const [username, setUsername] = useState(''), [rememberUsername, setRememberUsername] = useState(false)
 const [collectionName, setCollectionName] = useState<string | null>(null)
 const [importToCollection, setImportToCollection] = useState(false)
 const [createdCollection, setCreatedCollection] = useState<{ scanId: string; id: string } | null>(null)
 function usernameUrl(kind: 'bookmarks' | 'marked_for_later', value: string) {
  return `https://archiveofourown.org/users/${encodeURIComponent(normalizeAo3Username(value))}/${kind === 'bookmarks' ? 'bookmarks' : 'readings?show=to-read'}`
 }
 function importUsername(kind: 'bookmarks' | 'marked_for_later') {
  setError('')
  try {
   const savedUsername = usernamePreference.read()
   if (savedUsername && kind === 'marked_for_later') { const link = usernameUrl(kind, savedUsername); setUrl(link); void action('start', link, true) }
   else { setUsername(savedUsername); setRememberUsername(Boolean(savedUsername)); setUsernameKind(kind) }
  } catch (failure) { setError((failure as Error).message) }
 }
 const intervalId = useId(), modeId = useId(), urlId = useId()
 const [checkChapterDates, setCheckChapterDates] = useState(false)
 const [readingStatus, setReadingStatus] = useState<Status>('to_read')
 const [url, setUrl] = useState(''), [mode, setMode] = useState('full')
 const [startPage, setStartPage] = useState(''), [endPage, setEndPage] = useState('')
 const { state, setState, refresh } = useLibrarySyncStatus()
 const [delayDraft, setDelayDraft] = useState<string | null>(null)
 const interval = delayDraft ?? String(state?.delaySeconds ?? 15)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const [conflicts, setConflicts] = useState<CsvConflict[]>([])
 const [seriesReview, setSeriesReview] = useState<{ scanId: string; text: string } | null>(null)
 const selection = useRef<{ scanId: string; ids: Set<number> } | null>(null)
 const pending = useRef(false)
 useEffect(() => {
  if (sampleMode) void connectExtension().then(connected => { if (connected) return refresh() }).catch(() => {})
 }, [refresh])
 async function action(name: string, listUrl = url, autoImport = false, withChapterDates = false) {
  if (pending.current) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  try {
   if (name === 'start' && !await connectExtension()) throw new Error(sampleMode ? 'Load or reload AO3 Library Companion (Local) from extension/local/dist in Chrome, then retry.' : 'Connect the extension in Settings, then try again.')
   if (name === 'start' || name === 'discard') { setSeriesReview(null); selection.current = null }
   if (name === 'start') { setCollectionName(null); setCreatedCollection(null) }
   const reply = await librarySyncCommand(name, name === 'start' ? { url: listUrl.trim(), mode, ...(withChapterDates ? { checkChapterDates: true } : {}), ...(!autoImport ? { readingStatus } : {}), ...(autoImport ? { autoImport: true } : {}), ...(/^https:\/\/archiveofourown\.org\/collections\//.test(listUrl.trim()) && importToCollection ? { importToCollection: true } : {}), delaySeconds: Number(interval), ...(startPage !== '' ? { startPage: Number(startPage) } : {}), ...(endPage !== '' ? { endPage: Number(endPage) } : {}) } : { scanId: state?.id, ...(['set-delay', 'resume'].includes(name) ? { delaySeconds: Number(interval) } : {}) })
   if (name === 'start' && withChapterDates && reply.state && reply.state.checkChapterDates !== true) {
    const discarded = await librarySyncCommand('discard', { scanId: reply.state.id })
    setState(discarded.state ?? null)
    throw new Error('Rebuild and reload AO3 Library Companion before using chapter-date checks. The unsupported scan was discarded; start it again after updating.')
   }
   setState(reply.state ?? null)
   if (['start', 'set-delay', 'resume'].includes(name)) setDelayDraft(null)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Library sync failed.') }
  finally { pending.current = false; setBusy(false) }
 }
 async function requestSave() {
  if (!state || pending.current) return
  if (!state.seenSeries?.length || selection.current?.scanId === state.id) { await save(); return }
  pending.current = true; setBusy(true); setError(''); setMessage('')
  try {
   if (state.seriesReviewVersion !== 1) throw new Error('This scan predates series work selection. Discard it and run a new scan with the updated extension.')
   const links = new Set(state.seenSeries)
   // Inspect every checkpoint before importing anything; direct works stay included.
   for (let offset = 0; offset < state.pages; offset++) {
    const reply = await librarySyncCommand('page', { page: (state.startPage ?? 1) + offset, scanId: state.id })
    if (reply.seriesUrl) continue
    for (const row of readAo3Rows(reply.rows ?? [])) if (typeof row.workId === 'number') links.add(row.url)
   }
   setSeriesReview({ scanId: state.id, text: [...links].join('\n') })
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare series selection.') }
  finally { pending.current = false; setBusy(false) }
 }
 async function save() {
  if (!state || pending.current) return
  if (state.seenSeries?.length && selection.current?.scanId !== state.id) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  let imported = 0, kept = 0, batch: string | null = null
  const differences = new Map<string, CsvConflict>()
  setConflicts([])
  try {
   let collectionId = state.collectionId ?? (createdCollection?.scanId === state.id ? createdCollection!.id : undefined)
   if (state.importToCollection) {
    if (!state.collection) throw new Error('Collection profile was not captured. Update the extension and scan again.')
    if (!collectionId) {
     collectionId = await saveCollection(collectionName?.trim() ?? state.collection.name, undefined, undefined, state.collection.description)
     setCreatedCollection({ scanId: state.id, id: collectionId })
    }
    if (!state.collectionId) {
     const reply = await librarySyncCommand('set-collection', { scanId: state.id, collectionId })
     setState(reply.state ?? state)
    }
   }
   // Page-sized transactions support large libraries and safe, idempotent retry.
   for (let offset = 0; offset < state.pages; offset++) {
    const page = (state.startPage ?? 1) + offset
    setMessage(`Importing saved page ${offset + 1} of ${state.pages}…`)
    const reply = await librarySyncCommand('page', { page, scanId: state.id })
    const rows = uniqueCsvWorks(readAo3Rows(reply.rows ?? []).filter((row): row is CsvWork => row.workId !== undefined && (!reply.seriesUrl || typeof row.workId === 'number' && selection.current?.ids.has(row.workId) === true)))
    if (!rows.length) continue
    const result = await submitLibrarySync(rows, collectionId, state.readingStatus)
    for (const conflict of result.bookmarkConflicts ?? []) differences.set(csvWorkKey(conflict), conflict)
    setConflicts([...differences.values()])
    imported += result.imported; kept += result.kept; batch = result.batch ?? batch
   }
   const reply = await librarySyncCommand('finish', { scanId: state.id }); setState(reply.state ?? null)
   setSeriesReview(null); selection.current = null
   setMessage(`Imported ${imported} works; kept ${kept} existing works. Non-empty AO3 metadata was refreshed; existing personal data was preserved.`)
   await onImported(batch)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Import failed. Retry to continue safely.'); setMessage('Saved pages remain available. Retrying keeps works already imported.') }
  finally { pending.current = false; setBusy(false) }
 }
 const autoSave = useEffectEvent(() => { void requestSave() })
 useEffect(() => {
  if (state?.status !== 'ready' || !state.autoImport) return
  const timer = setTimeout(() => autoSave(), 0)
  return () => clearTimeout(timer)
 }, [state?.id, state?.status, state?.autoImport])
 const saved = state && ['running', 'paused', 'ready'].includes(state.status)
 const selectedMode = saved && state.mode ? state.mode : mode
 return <section className="settings-card story-form" aria-labelledby="library-sync-heading">
  <h2 id="library-sync-heading">AO3 Library Sync</h2>
  {sampleMode && <p className="field-help">Sample imports use the local extension and save only to this browser’s sample library. No library account or background worker is needed. Load extension/local/dist in Chrome before starting.</p>}
  <p className="scan-introduction">Scan works across pages using AO3 Library Companion. Existing notes, personal tags, ratings, and progress are kept.</p>
  <p className="field-help">New bookmarks dated after the work’s latest update are marked Finished, with the bookmark date as the finished date.</p>
  <p className="field-help">Ensure that bookmarks are sorted by "Date Bookmarked". Changing the sort order may cause the scanner to miss entries.</p>
  <form className="story-form" onSubmit={event => { event.preventDefault(); void action('start') }}>
   <fieldset className="scan-options"><legend>Scan Options</legend><div className="form-controls-row">
   <div className="form-control">
    <div className="editable-field-heading"><label htmlFor={intervalId}>Time Between Page Requests</label></div>
    <div className="input-with-unit"><input id={intervalId} aria-describedby={`${intervalId}-unit`} className="input-fit" type="number" required min={5} max={3600} step={1} value={interval} disabled={busy} onChange={event => setDelayDraft(event.target.value)} /><span id={`${intervalId}-unit`}>seconds</span><Tooltip description="Default interval: 15 seconds. Choose 5–3,600 seconds; browser scheduling and a small random delay may make requests slower.">{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label="Request interval information" aria-describedby={descriptionId}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>
   </div>
   <div className="form-control"><div className="editable-field-heading"><label htmlFor={modeId}>Scan Mode</label><Tooltip description="Full Scan collects all listings from a list. Quick Sync checks newest entries until a previously imported record is found.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Scan mode information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div><select id={modeId} className="select-fit" value={selectedMode} disabled={busy || Boolean(saved)} onChange={event => { setMode(event.target.value); if (event.target.value === 'quick') { setStartPage(''); setEndPage('') } }}><option value="full">Full Scan</option><option value="quick">Quick Sync</option></select></div>
   {selectedMode === 'full' && <fieldset className="scan-page-limits" aria-label="Limit Full Library Scan (Optional)">
    <legend><span className="editable-field-heading">Limit Full Library Scan (Optional)<Tooltip description="Enter page numbers only; both endpoints are included. Leave Start Page blank for page 1 and End Page blank to scan to the list’s end. Selected ranges are partial scans and do not update the Quick Sync baseline.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Page limits information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></span></legend>
    <div className="form-grid form-grid-two-columns">
     <label>Start Page<input type="number" min={1} max={500} step={1} value={startPage} placeholder="1" disabled={busy || Boolean(saved)} onChange={event => setStartPage(event.target.value)} /></label>
     <label>End Page<input type="number" min={startPage ? Number(startPage) : 1} max={500} step={1} value={endPage} placeholder="Leave Blank" disabled={busy || Boolean(saved)} onChange={event => setEndPage(event.target.value)} /></label>
    </div>
   </fieldset>}</div>
   </fieldset>
   <div className="form-actions"><button type="button" className="button secondary" disabled={busy || Boolean(saved)} onClick={() => importUsername('bookmarks')}>Import Bookmarks</button><button type="button" className="button secondary" disabled={busy || Boolean(saved)} onClick={() => importUsername('marked_for_later')}>Import Marked for Later</button></div>
   <div className="form-controls-row list-import-controls">
   <div className="form-control list-url-control"><div className="editable-field-heading"><label htmlFor={urlId}>AO3 List URL</label><Tooltip description="Accepts a full user or pseud's Works, Series, or Bookmarks URL, tag Works/Bookmarks URL, work search URL, or an AO3 collection URL.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="AO3 List URL information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div><input id={urlId} type="url" required value={url} placeholder="https://archiveofourown.org/users/USERNAME/bookmarks" disabled={busy || Boolean(saved)} onChange={event => setUrl(event.target.value)} /></div>
   <ImportReadingStatus description="Applies to new works imported from this list URL. Existing reading progress is preserved." ariaLabel="Reading status for AO3 list URL" value={saved ? state.readingStatus ?? readingStatus : readingStatus} onChange={setReadingStatus} disabled={busy || Boolean(saved)} />
   <button className="button primary" disabled={busy || Boolean(saved)}>Import from List</button>
   </div>
   {/^https:\/\/archiveofourown\.org\/collections\//.test(url.trim()) && <div className="editable-field-heading"><label className="check-label"><input type="checkbox" checked={importToCollection} disabled={busy || Boolean(saved)} onChange={event => setImportToCollection(event.target.checked)} />Import to New Collection</label><Tooltip description="Creates a new collection with all of the added works">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Import to New Collection information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>}

   {state && ['running', 'paused'].includes(state.status) && <button type="button" className="button secondary" disabled={busy} onClick={() => void action('set-delay')}>Apply Request Interval</button>}
  </form>
  <p className="field-help">Uses one scan tab with your selected request interval; background alarms may make it slower. Existing work imports finish first. Keep Chrome running. If sign-in or a request restriction blocks the scan, an alert lets you open the scan tab. Resolve the issue there, then resume manually. Checkpoints stay on this device until imported or discarded.</p>
  {state && <p role="status">{state.status} · {state.pages} pages saved · {state.count} works collected · {state.skipped} unsupported entries skipped</p>}
  {state?.checkChapterDates && <p className="field-help">Chapter dates: {state.chapterDatesChecked ?? 0} indexes checked · {state.chapterDatesUnavailable ?? 0} unavailable or incomplete.</p>}
  {state?.limited && <p className="field-help">Partial scan · pages {state.startPage ?? 1}–{state.endPage ?? 'end of list'}{state.partial ? " · stopped at the selected end page; more pages remain on AO3" : ""}. Importing this range will not update the Quick Sync baseline.</p>}
  {state?.error && <p role="alert" className="error-message">{state.error}</p>}
  {state?.status === 'ready' && state.importToCollection && state.collection && <label>New Collection Name<input value={collectionName ?? state.collection.name} disabled={busy || Boolean(state.collectionId) || createdCollection?.scanId === state.id} onChange={event => setCollectionName(event.target.value)} /></label>}
  <div className="form-actions">
   {state?.status === 'running' && <button className="button secondary" disabled={busy} onClick={() => void action('pause')}>Pause Scan</button>}
   {state?.status === 'paused' && <button className="button secondary" disabled={busy} onClick={() => void action('resume')}>Resume Scan</button>}
   {state?.status === 'ready' && seriesReview?.scanId !== state.id && <button className="button primary" disabled={busy} onClick={() => void requestSave()}>Import Scanned Works</button>}
   {saved && <button className="button secondary" disabled={busy} onClick={() => void action('discard')}>Discard Scan</button>}
  </div>
  {state?.status === 'ready' && seriesReview?.scanId === state.id && <SeriesImportReview key={state.id} text={seriesReview.text} savedIds={new Set()} busy={busy} showReadingStatus={false} allowEmpty confirmLabel="Import selected scanned works" cancelLabel="Back to scan" onConfirm={works => {
   selection.current = { scanId: state.id, ids: new Set(works.map(work => work.workId)) }
   void save()
  }} onCancel={() => { setSeriesReview(null); selection.current = null; setError('') }} />}
  {conflicts.length > 0 && <details><summary>{conflicts.length} Bookmark Conflicts — Personal Data Kept</summary><p>These incoming bookmarks differ in notes, personal tags, or reading state. Saved notes, tags, and reading state were kept. Older bookmark dates take precedence and Rec is enabled if either version selected it. Use CSV import to overwrite personal data if desired.</p><ul>{conflicts.map(conflict => <li key={csvWorkKey(conflict)}><Link to={`/stories/${conflict.id}`}>{conflict.title || `AO3 work ${conflict.workId}`}</Link><dl><dt>Reading state before import</dt><dd>{statuses[conflict.status as keyof typeof statuses]} · {conflict.progress} chapters read · Finished: {formatDate(conflict.finishedAt)}</dd>{conflict.incomingReading && <><dt>Incoming reading state</dt><dd>{statuses[conflict.incomingReading.status]} · {conflict.incomingReading.progress} chapters read · Finished: {formatDate(conflict.incomingReading.finishedAt)}</dd></>}<dt>Saved personal notes</dt><dd>{conflict.notes || 'None'}</dd><dt>Incoming bookmark notes</dt><dd>{conflict.incomingNotes || 'None'}</dd><dt>Saved personal tags</dt><dd>{conflict.tags.join(', ') || 'None'}</dd><dt>Incoming bookmark tags</dt><dd>{conflict.incomingTags?.join(', ') || 'None'}</dd></dl></li>)}</ul></details>}
  {usernameKind && <Dialog title={usernameKind === 'bookmarks' ? 'Import Bookmarks' : 'Import Marked for Later'} busy={busy} onClose={() => setUsernameKind(null)}><form className="story-form" onSubmit={event => {
   event.preventDefault()
   try {
    const link = usernameUrl(usernameKind, username)
    if (rememberUsername) usernamePreference.save(username)
    setUrl(link); setUsernameKind(null); void action('start', link, true, usernameKind === 'bookmarks' && checkChapterDates)
   } catch (failure) { setError((failure as Error).message) }
  }}>{error && <p role="alert" className="error-message">{error}</p>}<label>AO3 Username<input required pattern={ao3UsernamePattern} value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" /></label><div className="editable-field-heading"><label className="check-label"><input type="checkbox" checked={rememberUsername} onChange={event => setRememberUsername(event.target.checked)} />Save my AO3 username for future imports</label><Tooltip description="View, change, or delete your saved username in Settings.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Saved username information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>
   {usernameKind === 'bookmarks' && <><p className="field-help">Earlier or same-day bookmarks are marked Currently Reading; chapter progress stays unconfirmed unless you enable the chapter-date check. Missing dates also mark bookmarks as Currently Reading with unconfirmed progress.</p><BookmarkChapterDatesOption scan checked={checkChapterDates} disabled={busy} onChange={setCheckChapterDates} /></>}
   {usernameKind === 'marked_for_later' && <p className="field-help">New Marked for Later works are saved as To Read. Marked for Later requires signing in to AO3 in the scan browser.</p>}<button className="button primary" disabled={busy}>Start Import</button></form></Dialog>}
  {message && <p role="status">{message}</p>}{error && !usernameKind && <p role="alert" className="error-message">{error}</p>}
 </section>
}
