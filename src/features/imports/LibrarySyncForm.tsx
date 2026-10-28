import { ImportReadingReview } from './ImportReadingReview'
import { isLibrarySyncSafetyLimit, librarySyncRepairs, mergeLibrarySyncRepairs } from './library-sync-state'
import { mergeSeriesPreviews, parseSeriesUrl, type SeriesPreview } from './urls'
import { SeriesImportOptions } from './SeriesImportOptions'
import { useSeriesImportBehavior } from './series-import-preferences'
import { localExtensionConnectionHelp } from './extension-config'
import { BookmarkChapterDatesOption } from './BookmarkChapterDatesOption'
import { ImportReadingStatus, type ImportReadingStatusValue } from './ImportReadingStatus'
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
import { applyLibrarySyncBookmark, previewSeries, submitLibrarySync } from './repository'
import { SeriesImportReview } from './SeriesImportReview'
import { LibrarySyncReportHistory, LibrarySyncSummary } from './LibrarySyncReports'
import { librarySyncReports } from './library-sync-reports'

export function LibrarySyncForm({ onImported }: { onImported: (batch: string | null) => Promise<void> }) {
 const seriesBehavior = useSeriesImportBehavior()
 const usernamePreference = useAo3Username()
 const [usernameKind, setUsernameKind] = useState<'bookmarks' | 'marked_for_later' | null>(null)
 const [username, setUsername] = useState(''), [rememberUsername, setRememberUsername] = useState(false)
 const [manualReadingStatus, setManualReadingStatus] = useState(false)
 const [usernameReadingStatus, setUsernameReadingStatus] = useState<Status>('to_read')
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
   setUsername(savedUsername); setRememberUsername(Boolean(savedUsername)); setManualReadingStatus(false); setUsernameReadingStatus('to_read'); setUsernameKind(kind)
  } catch (failure) { setError((failure as Error).message) }
 }
 const intervalId = useId(), modeId = useId(), urlId = useId()
 const [checkChapterDates, setCheckChapterDates] = useState(false)
 const [readingStatus, setReadingStatus] = useState<ImportReadingStatusValue>('to_read')
 const [readingStatusExplicit, setReadingStatusExplicit] = useState(false)
 const [listCheckChapterDates, setListCheckChapterDates] = useState(false)
 const [url, setUrl] = useState(''), [mode, setMode] = useState('full')
 const [reviewExisting, setReviewExisting] = useState(true)
 const [startPage, setStartPage] = useState(''), [endPage, setEndPage] = useState('')
 const { state, setState, refresh } = useLibrarySyncStatus()
 const [delayDraft, setDelayDraft] = useState<string | null>(null)
 const interval = delayDraft ?? String(state?.delaySeconds ?? 15)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const [conflicts, setConflicts] = useState<CsvConflict[]>([])
 const [seriesReview, setSeriesReview] = useState<{ scanId: string; batchStart: number; text: string; previews: SeriesPreview[]; bookmarkedSeriesIds?: Set<number> } | null>(null)
 const selection = useRef<{ scanId: string; batchStart: number; ids: Set<number> } | null>(null)
 const pending = useRef(false)
 useEffect(() => {
  if (sampleMode) void connectExtension().then(connected => { if (connected) return refresh() }).catch(() => {})
 }, [refresh])
 async function action(name: string, listUrl = url, options: { autoImport?: boolean; checkChapterDates?: boolean; readingStatus?: Status } = {}) {
  const { autoImport = false } = options
  const withChapterDates = autoImport ? Boolean(options.checkChapterDates) : readingStatus === 'dynamic_bookmarks' && listCheckChapterDates
  const requestedReadingStatus = autoImport ? options.readingStatus : readingStatus === 'dynamic_bookmarks' ? undefined : readingStatus
  if (pending.current) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  try {
   if (name === 'start' && state?.status === 'complete') await librarySyncReports(1, state)
   if (name === 'start' && !await connectExtension()) throw new Error(sampleMode ? localExtensionConnectionHelp : 'Connect the extension in Settings, then try again.')
   if (name === 'discard') seriesBehavior.reset()
   if (name === 'start' || name === 'discard') { setSeriesReview(null); selection.current = null }
   if (name === 'start') { setCollectionName(null); setCreatedCollection(null) }
   const reply = await librarySyncCommand(name, name === 'start' ? { url: listUrl.trim(), mode, ...(mode === 'full' ? { reviewExisting } : {}), seriesBehavior: seriesBehavior.behavior, reviewRelatedSeries: seriesBehavior.reviewRelatedSeries, ...(withChapterDates ? { checkChapterDates: true } : {}), ...(requestedReadingStatus ? { readingStatus: requestedReadingStatus, ...(!autoImport && !readingStatusExplicit ? { readingStatusOrigin: 'default' as const } : {}) } : {}), ...(autoImport ? { autoImport: true } : {}), ...(/^https:\/\/archiveofourown\.org\/collections\//.test(listUrl.trim()) && importToCollection ? { importToCollection: true } : {}), delaySeconds: Number(interval), ...(startPage !== '' ? { startPage: Number(startPage) } : {}), ...(endPage !== '' ? { endPage: Number(endPage) } : {}) } : { scanId: state?.id, ...(['set-delay', 'resume', 'continue'].includes(name) ? { delaySeconds: Number(interval) } : {}) })
   const unsupportedOption = reply.state && (withChapterDates && reply.state.checkChapterDates !== true ? 'chapter-date checks' : requestedReadingStatus && reply.state.readingStatus !== requestedReadingStatus ? 'manual reading status' : mode === 'full' && reviewExisting && reply.state.reviewExisting !== true ? 'existing-entry review' : reply.state.reviewRelatedSeries !== seriesBehavior.reviewRelatedSeries ? 'series review choices' : null)
   if (name === 'start' && reply.state && unsupportedOption) {
    const discarded = await librarySyncCommand('discard', { scanId: reply.state.id })
    setState(discarded.state ?? null)
    throw new Error(`Rebuild and reload Beyond the Archives Companion before using ${unsupportedOption}. The unsupported scan was discarded; start it again after updating.`)
   }
   setState(reply.state ?? null)
   if (['start', 'set-delay', 'resume', 'continue'].includes(name)) setDelayDraft(null)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Library sync failed.') }
  finally { pending.current = false; setBusy(false) }
 }
 async function requestSave() {
  if (!state || pending.current) return
  if (!state.seenSeries?.length || (selection.current?.scanId === state.id && selection.current.batchStart === (state.batchStart ?? 0))) { await save(); return }
  pending.current = true; setBusy(true); setError(''); setMessage('')
  try {
   if (state.seriesReviewVersion !== 1) throw new Error('This scan predates series work selection. Discard it and run a new scan with the updated extension.')
   const links = new Set<string>()
   const all = (state.seriesBehavior ?? seriesBehavior.behavior) === 'all'
   const seriesIds = new Set<number>()
   const previews = new Map<number, SeriesPreview[]>()
   // Inspect every checkpoint before importing anything; direct works stay included.
   for (let offset = state.batchStart ?? 0; offset < state.pages; offset++) {
    const reply = await librarySyncCommand('page', { page: (state.startPage ?? 1) + offset, scanId: state.id })
    if (reply.seriesUrl) {
     links.add(reply.seriesUrl)
     const identity = parseSeriesUrl(reply.seriesUrl)
     const works = readAo3Rows(reply.rows ?? []).filter((row): row is CsvWork & { workId: number } => typeof row.workId === 'number')
     if (all) for (const row of works) seriesIds.add(row.workId)
     else {
      // Legacy checkpoints retain their scanned works. Retrieve only the first
      // series page when its name is absent, reusing a known name across pages.
      let title = previews.get(identity.seriesId)?.[0]?.title ?? seriesBehavior.previewCache.get(identity.seriesId)?.title
      if (!reply.seriesPreview && !title) {
       try { title = (await previewSeries(identity.normalizedUrl, { firstPageOnly: true, viaExtension: true })).title }
       catch (failure) { title = 'Series Name Unavailable'; setError(`Could not load the name for series ${identity.seriesId}: ${failure instanceof Error ? failure.message : 'AO3 did not return a series name.'} Your scanned works are still available. Cancel and try again after resolving the connection or AO3 sign-in issue.`) }
      }
      const preview: SeriesPreview = reply.seriesPreview ?? { ...identity, basic: true, title: title || 'Series Name Unavailable', description: '', works: works.map(row => ({
       workId: row.workId, url: row.url, title: row.metadata.title ?? `AO3 Work ${row.workId}`, position: null, authors: row.metadata.authors ?? [], fandoms: row.metadata.fandoms ?? [],
       summary: row.metadata.summary ?? '', summary_html: row.metadata.summary_html, tags: row.metadata.ao3_tags ?? [], wordCount: row.metadata.word_count ?? null,
       chapters: row.metadata.published_chapters == null ? '' : `${row.metadata.published_chapters}/${row.metadata.total_chapters ?? '?'}`, complete: row.metadata.is_complete ?? null,
      })) }
      previews.set(identity.seriesId, [...previews.get(identity.seriesId) ?? [], preview])
     }
     continue
    }
    for (const row of readAo3Rows(reply.rows ?? [])) if (typeof row.workId === 'number') links.add(row.url)
   }
   if (all || !previews.size) selection.current = { scanId: state.id, batchStart: state.batchStart ?? 0, ids: seriesIds }
   else setSeriesReview({ scanId: state.id, batchStart: state.batchStart ?? 0, text: [...links].join('\n'), previews: [...previews.values()].map(mergeSeriesPreviews), bookmarkedSeriesIds: state.bookmarkedSeries ? new Set(state.bookmarkedSeries.map(url => parseSeriesUrl(url).seriesId)) : undefined })
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare series selection.') }
  finally { pending.current = false; setBusy(false) }
  if (selection.current?.scanId === state.id && selection.current.batchStart === (state.batchStart ?? 0)) await save()
 }
 async function save() {
  if (!state || pending.current) return
  if (state.seenSeries?.length && (selection.current?.scanId !== state.id || selection.current.batchStart !== (state.batchStart ?? 0))) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  let imported = 0, kept = 0, batch: string | null = null
  const differences = new Map<string, CsvConflict>()
  let reportState = state
  const repairPages = { ...state.repairPages }
  setConflicts([])
  try {
   let collectionId = state.collectionId ?? (createdCollection?.scanId === state.id ? createdCollection!.id : undefined)
   if (state.importToCollection && (!state.endedEarly || state.pages > (state.batchStart ?? 0))) {
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
   for (let offset = state.batchStart ?? 0; offset < state.pages; offset++) {
    const page = (state.startPage ?? 1) + offset
    setMessage(`Importing saved page ${offset - (state.batchStart ?? 0) + 1} of ${state.pages - (state.batchStart ?? 0)}…`)
    const reply = await librarySyncCommand('page', { page, scanId: state.id })
    const rows = uniqueCsvWorks(readAo3Rows(reply.rows ?? []).filter((row): row is CsvWork => row.workId !== undefined && (!reply.seriesUrl || typeof row.workId === 'number' && selection.current?.ids.has(row.workId) === true)))
    if (!rows.length) continue
    const result = await submitLibrarySync(rows, collectionId, state.readingStatus, { id: state.id, url: state.url, reviewExisting: state.reviewExisting ?? false, ...(state.readingStatusOrigin ? { readingStatusOrigin: state.readingStatusOrigin } : {}) })
    for (const conflict of result.bookmarkConflicts ?? []) differences.set(csvWorkKey(conflict), conflict)
    setConflicts([...differences.values()])
    if (result.metadataRepaired !== undefined) {
     const previous = repairPages[page]
     const repairs = mergeLibrarySyncRepairs(previous, { metadata: result.metadataRepaired, series: result.seriesRepaired ?? 0, reading: result.readingCorrections ?? 0, ...(result.repairWorkIds ? { ids: result.repairWorkIds } : {}) })
     if (state.reviewExisting !== undefined) await librarySyncCommand('record-repairs', { scanId: state.id, page, repairs })
     repairPages[page] = repairs; reportState = { ...state, repairPages }
    }
    imported += result.imported; kept += result.kept; batch = result.batch ?? batch
   }
   // Save the report before acknowledging: finish deletes the scan checkpoints.
   if (!state.hasMore) await librarySyncReports(1, reportState)
   const reply = await librarySyncCommand(state.hasMore ? 'finish-batch' : 'finish', { scanId: state.id, ...(state.hasMore ? { batchStart: state.batchStart ?? 0, batchEnd: state.pages } : {}) }); setState(reply.state ?? null)
   setSeriesReview(null); selection.current = null; seriesBehavior.reset()
   const repairs = librarySyncRepairs({ repairPages })
   setMessage(`Updated AO3 information for ${repairs.metadata} works, including series information for ${repairs.series} works. Found ${repairs.reading} possible reading-status corrections. Imported ${imported} works; kept ${kept} existing works. Non-empty AO3 metadata was refreshed; existing personal data was preserved.${state.hasMore ? ' Scanning continues with the remaining pages.' : ''}`)
   await onImported(batch)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Import failed. Retry to continue safely.'); setMessage('Saved pages remain available. Retrying keeps works already imported.') }
  finally { pending.current = false; setBusy(false) }
 }
 async function resolveBookmark(conflict: CsvConflict, incoming: boolean) {
  if (pending.current) return
  pending.current = true; setBusy(true); setError('')
  try {
   if (incoming) await applyLibrarySyncBookmark(conflict)
   setConflicts(current => current.filter(saved => csvWorkKey(saved) !== csvWorkKey(conflict)))
   setMessage(`${incoming ? 'Incoming bookmark applied' : 'Saved personal data kept'} for ${conflict.title || `AO3 Work ${conflict.workId}`}.`)
   if (incoming) await onImported(null)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not apply the bookmark choice. Try again.') }
  finally { pending.current = false; setBusy(false) }
 }
 const autoSave = useEffectEvent(() => { void requestSave() })
 useEffect(() => {
  if (state?.status !== 'ready' || !state.autoImport && !state.endedEarly) return
  const timer = setTimeout(() => autoSave(), 0)
  return () => clearTimeout(timer)
 }, [state?.id, state?.status, state?.autoImport, state?.endedEarly])
 const saved = state && ['running', 'paused', 'ready'].includes(state.status)
 const selectedMode = saved && state.mode ? state.mode : mode
 const listReadingStatus = saved && !state.autoImport ? state.readingStatus ?? 'dynamic_bookmarks' : readingStatus
 return <section className="settings-card story-form" aria-labelledby="library-sync-heading">
  <h2 id="library-sync-heading">AO3 Library Sync</h2>
  {sampleMode && <p className="field-help">Sample imports use the extension with Local selected and save only to this browser’s sample library. No library account or background worker is needed. Select Local in the companion’s extension settings and enter its ID in this app’s Settings before starting.</p>}
  <p className="scan-introduction">Scan works across pages using Beyond the Archives Companion. Review differences in bookmark notes, personal tags, and reading state after importing. Saved personal data stays unchanged until you choose incoming data.</p>
  <p className="field-help">By default, new bookmarks dated after the work’s latest update are marked Finished, with the bookmark date as the finished date.</p>
  <p className="field-help">Ensure that bookmarks are sorted by "Date Bookmarked". Changing the sort order may cause the scanner to miss entries.</p>
  <form className="story-form" onSubmit={event => { event.preventDefault(); void action('start') }}>
   <fieldset className="scan-options"><legend>Scan Options</legend><div className="form-controls-row">
   <div className="form-control">
    <div className="editable-field-heading"><label htmlFor={intervalId}>Time Between Page Requests</label></div>
    <div className="input-with-unit"><input id={intervalId} aria-describedby={`${intervalId}-unit`} className="input-fit" type="number" required min={5} max={3600} step={1} value={interval} disabled={busy} onChange={event => setDelayDraft(event.target.value)} /><span id={`${intervalId}-unit`}>seconds</span><Tooltip pinOnClick description="Default interval: 15 seconds. Choose 5–3,600 seconds; browser scheduling and a small random delay may make requests slower.">{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label="Request Interval Information" aria-describedby={descriptionId}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>
   </div>
   <div className="form-control"><div className="editable-field-heading"><label htmlFor={modeId}>Scan Mode</label><Tooltip pinOnClick description="Full Scan collects all listings from a list. Quick Sync checks newest entries until a previously imported record is found.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Scan Mode Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div><select id={modeId} className="select-fit" value={selectedMode} disabled={busy || Boolean(saved)} onChange={event => { setMode(event.target.value); if (event.target.value === 'quick') { setStartPage(''); setEndPage('') } }}><option value="full">Full Scan</option><option value="quick">Quick Sync</option></select></div>
   {selectedMode === 'full' && <fieldset className="scan-page-limits" aria-label="Limit Full Library Scan">
    <legend><span className="editable-field-heading">Limit Full Library Scan<Tooltip pinOnClick description="Optional. Enter page numbers only; both endpoints are included. Leave Start Page blank for page 1 and End Page blank to scan to the list’s end. Selected ranges are partial scans and do not update the Quick Sync baseline.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Page Limits Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></span></legend>
    <div className="form-grid form-grid-two-columns">
     <label>Start Page<input type="number" min={1} step={1} value={startPage} placeholder="1" disabled={busy || Boolean(saved)} onChange={event => setStartPage(event.target.value)} /></label>
     <label>End Page<input type="number" min={startPage ? Number(startPage) : 1} step={1} value={endPage} placeholder="Leave Blank" disabled={busy || Boolean(saved)} onChange={event => setEndPage(event.target.value)} /></label>
    </div>
   </fieldset>}</div>
   <SeriesImportOptions reviewRelatedSeries={saved ? state.reviewRelatedSeries ?? true : seriesBehavior.reviewRelatedSeries} onReviewRelatedSeriesChange={seriesBehavior.setReviewRelatedSeries} defaultBehavior={seriesBehavior.defaultBehavior} override={saved && state.seriesBehavior ? state.seriesBehavior !== seriesBehavior.defaultBehavior : seriesBehavior.override} onChange={seriesBehavior.setOverride} disabled={busy || Boolean(saved)}>
    {selectedMode === 'full' && <div className="editable-field-heading"><label className="check-label"><input type="checkbox" checked={saved ? Boolean(state.reviewExisting) : reviewExisting} disabled={busy || Boolean(saved)} onChange={event => setReviewExisting(event.target.checked)} />Review Existing Entries</label><Tooltip pinOnClick description="Review older saved works encountered in this scan. Factual AO3 information repairs automatically; reading-status and progress corrections require approval. Quick Sync can stop before reaching older works.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Review Existing Entries Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>}
   </SeriesImportOptions>
   </fieldset>
   <div className="form-actions"><button type="button" className="button secondary" disabled={busy || Boolean(saved)} onClick={() => importUsername('bookmarks')}>Import Bookmarks</button><button type="button" className="button secondary" disabled={busy || Boolean(saved)} onClick={() => importUsername('marked_for_later')}>Import Marked for Later</button></div>
   <div className="form-controls-row list-import-controls">
   <div className="form-control list-url-control"><div className="editable-field-heading"><label htmlFor={urlId}>AO3 List URL</label><Tooltip pinOnClick description="Accepts a full user or pseud's Works, Series, or Bookmarks URL, filtered Bookmarks URL, tag Works/Bookmarks URL, work search URL, or an AO3 collection URL. Full Scan preserves URL filters; Quick Sync requires an unfiltered user list.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="AO3 List URL Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div><input id={urlId} type="url" required value={url} placeholder="https://archiveofourown.org/users/USERNAME/bookmarks" disabled={busy || Boolean(saved)} onChange={event => setUrl(event.target.value)} /></div>
   <ImportReadingStatus allowDynamic description="Applies only to new works imported with Import from List. Dynamic (Bookmarks) uses bookmark and update dates, with optional chapter-date checks; other works default to To Read. Username imports use their own reading-status options. Existing reading progress is preserved." ariaLabel="Reading Status for AO3 list URL" value={listReadingStatus} onChange={value => { setReadingStatus(value); setReadingStatusExplicit(true) }} disabled={busy || Boolean(saved)} />
   <button className="button primary" disabled={busy || Boolean(saved)}>Import from List</button>
   </div>
   {listReadingStatus === 'dynamic_bookmarks' && <BookmarkChapterDatesOption scan checked={saved && !state.autoImport ? Boolean(state.checkChapterDates) : listCheckChapterDates} disabled={busy || Boolean(saved)} onChange={setListCheckChapterDates} />}
   {/^https:\/\/archiveofourown\.org\/collections\//.test(url.trim()) && <div className="editable-field-heading"><label className="check-label"><input type="checkbox" checked={importToCollection} disabled={busy || Boolean(saved)} onChange={event => setImportToCollection(event.target.checked)} />Import to New Collection</label><Tooltip pinOnClick description="Creates a new collection with all of the added works">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Import to New Collection Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>}

   {state && ['running', 'paused'].includes(state.status) && <div className="editable-field-heading"><button type="button" className="button secondary" disabled={busy} onClick={() => void action('set-delay')}>Apply Request Interval</button><Tooltip pinOnClick description="Press Apply Request Interval to apply the currently selected Time Between Page Requests, even while a scan is running.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Apply Request Interval Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>}
  </form>
  <p className="field-help">Uses one scan tab with your selected request interval; background alarms may make it slower. Existing work imports finish first. Keep Chrome running. If sign-in or a request restriction blocks the scan, an alert lets you open the scan tab. Resolve the issue there, then resume manually. Checkpoints stay on this device until imported or discarded.</p>
  {state?.status === 'discarded' ? <p role="status">Scan discarded.</p> : <>
  {state && <LibrarySyncSummary key={state.id} state={state} />}
  {state?.status === 'paused' && isLibrarySyncSafetyLimit(state) && state.batchVersion !== 1 && <p className="field-help">Rebuild and reload Beyond the Archives Companion to recover this saved scan. Keep the scan saved while updating.</p>}
  {state?.error && <p role="alert" className="error-message">{state.error}</p>}
  </>}
  {state?.status === 'ready' && state.importToCollection && state.collection && <label>New Collection Name<input value={collectionName ?? state.collection.name} disabled={busy || Boolean(state.collectionId) || createdCollection?.scanId === state.id} onChange={event => setCollectionName(event.target.value)} /></label>}
  <ImportReadingReview onChanged={() => onImported(null)} refreshKey={JSON.stringify([state?.id, state?.status, state?.repairPages])} actions={<>
   {state && ['ready', 'complete'].includes(state.status) && state.endedEarly && state.canContinue && <button className="button secondary" disabled={busy} onClick={() => void action('continue')}>Continue From Previous Scan</button>}
   {state?.status === 'running' && <button className="button secondary" disabled={busy} onClick={() => void action('pause')}>Pause Scan</button>}
   {state?.status === 'paused' && isLibrarySyncSafetyLimit(state) && <button className="button primary" disabled={busy || state.batchVersion !== 1} onClick={() => void action('prepare-batch')}>Prepare Saved Batch</button>}
   {state?.status === 'paused' && !isLibrarySyncSafetyLimit(state) && <button className="button secondary" disabled={busy} onClick={() => void action('resume')}>Resume Scan</button>}
   {state?.status === 'ready' && (seriesReview?.scanId !== state.id || seriesReview.batchStart !== (state.batchStart ?? 0)) && <button className="button primary" disabled={busy} onClick={() => void requestSave()}>{state.hasMore ? 'Import Batch and Continue' : 'Import Scanned Works'}</button>}
   {saved && !state.endedEarly && (state.status !== 'ready' || state.hasMore) && <button className="button secondary" disabled={busy} onClick={() => void action('end')}>End Scan</button>}
   {saved && <button className="button secondary" disabled={busy} onClick={() => void action('discard')}>Discard Scan</button>}
  </>} />
  {state?.status === 'ready' && seriesReview?.scanId === state.id && seriesReview.batchStart === (state.batchStart ?? 0) && <SeriesImportReview previewCache={seriesBehavior.previewCache} onPreview={seriesBehavior.cachePreview} error={error} key={state.id} initialPreviews={seriesReview.previews} bookmarkedSeriesIds={seriesReview.bookmarkedSeriesIds} bookmarkGroupingUnavailable={seriesReview.bookmarkedSeriesIds === undefined && (/\/bookmarks(?:[/?]|$)/.test(state.url ?? '') || Boolean(state.collection))} relatedSeriesLabel={state.collection ? 'Other Series From Collection Works and Bookmarks' : undefined} text={seriesReview.text} savedIds={new Set()} busy={busy} showReadingStatus={false} allowEmpty fitActions={state.hasMore} confirmLabel={state.hasMore ? 'Import Batch and Continue' : 'Import Selected Works'} onConfirm={works => {
   selection.current = { scanId: state.id, batchStart: state.batchStart ?? 0, ids: new Set(works.map(work => work.workId)) }
   void save()
  }} onCancel={() => { setSeriesReview(null); selection.current = null; setError('') }} />}
  <LibrarySyncReportHistory key={`${state?.id}:${state?.status}`} latest={state?.status === 'complete' ? state : undefined} />
  {conflicts.length > 0 && <details><summary>{conflicts.length} Bookmark Conflicts — Review Personal Data</summary><p>These incoming bookmarks differ in notes, personal tags, or reading state. Choose saved personal data or the incoming bookmark for each work. Saved data stays unchanged until you apply an incoming bookmark. Incoming data replaces notes, personal tags, and reading state; deleted bookmarks replace only notes and tags. Ratings, favorites, and collections are kept. Older bookmark dates take precedence and Rec is enabled if either version selected it.</p><ul className="bookmark-conflict-list">{conflicts.map(conflict => <li key={csvWorkKey(conflict)}><Link className="clickable-text" to={`/stories/${conflict.id}`}>{conflict.title || `AO3 Work ${conflict.workId}`}</Link><dl><dt>Saved Reading State</dt><dd>{statuses[conflict.status as keyof typeof statuses]} · {conflict.progress} chapters read · Finished: {formatDate(conflict.finishedAt)}</dd>{conflict.incomingReading && <><dt>Incoming Reading State</dt><dd>{statuses[conflict.incomingReading.status]} · {conflict.incomingReading.progress} chapters read · Finished: {formatDate(conflict.incomingReading.finishedAt)}</dd></>}<dt>Saved Personal Notes</dt><dd>{conflict.notes || 'None'}</dd><dt>Incoming Bookmark Notes</dt><dd>{conflict.incomingNotes || 'None'}</dd><dt>Saved Personal Tags</dt><dd>{conflict.tags.join(', ') || 'None'}</dd><dt>Incoming Bookmark Tags</dt><dd>{conflict.incomingTags?.join(', ') || 'None'}</dd></dl><div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => void resolveBookmark(conflict, false)}>Keep Saved Data</button><button type="button" className="button primary" disabled={busy} onClick={() => void resolveBookmark(conflict, true)}>Use Incoming Bookmark</button></div></li>)}</ul></details>}
  {usernameKind && <Dialog title={usernameKind === 'bookmarks' ? 'Import Bookmarks' : 'Import Marked for Later'} busy={busy} onClose={() => setUsernameKind(null)}><form className="story-form" onSubmit={event => {
   event.preventDefault()
   try {
    const link = usernameUrl(usernameKind, username)
    if (rememberUsername) usernamePreference.save(username)
    setUsernameKind(null); void action('start', link, { autoImport: true, checkChapterDates: usernameKind === 'bookmarks' && !manualReadingStatus && checkChapterDates, ...(manualReadingStatus ? { readingStatus: usernameReadingStatus } : {}) })
   } catch (failure) { setError((failure as Error).message) }
  }}>{usernameKind === 'bookmarks' && !manualReadingStatus && <p className="field-help">Earlier or same-day bookmarks are marked Currently Reading; chapter progress stays unconfirmed unless you enable the chapter-date check. Missing dates also mark bookmarks as Currently Reading with unconfirmed progress.</p>}{error && <p role="alert" className="error-message">{error}</p>}<label>AO3 Username<input required pattern={ao3UsernamePattern} value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" /></label><div className="editable-field-heading"><label className="check-label"><input type="checkbox" checked={rememberUsername} onChange={event => setRememberUsername(event.target.checked)} />Save My AO3 Username for Future Imports</label><Tooltip pinOnClick description="View, change, or delete your saved username in Settings.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Saved Username Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>
   {usernameKind === 'bookmarks' && <BookmarkChapterDatesOption scan checked={checkChapterDates} disabled={busy || manualReadingStatus} onChange={setCheckChapterDates} />}
   <label className="check-label"><input type="checkbox" checked={manualReadingStatus} disabled={busy} onChange={event => setManualReadingStatus(event.target.checked)} />Manually Set Reading Status</label>
   {manualReadingStatus && <ImportReadingStatus value={usernameReadingStatus} onChange={setUsernameReadingStatus} disabled={busy} ariaLabel="Reading Status for Username Import" description="Applies to new works imported with this username. Existing reading progress is preserved." />}
   {usernameKind === 'marked_for_later' && <p className="field-help">{!manualReadingStatus && 'New Marked for Later works are saved as To Read. '}Marked for Later requires signing in to AO3 in the scan browser.</p>}<button className="button primary" disabled={busy}>Start Import</button></form></Dialog>}
  {message && <p role="status">{message}</p>}{error && !usernameKind && (!seriesReview || seriesReview.scanId !== state?.id) && <p role="alert" className="error-message">{error}</p>}
 </section>
}
