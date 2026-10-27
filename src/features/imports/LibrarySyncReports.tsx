import { librarySyncRepairs } from './library-sync-state'
import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { formatDateTime } from '../../lib/dates'
import { Pagination } from '../library/browsing/Pagination'
import type { LibrarySyncIssue, LibrarySyncState } from './extension'
import { librarySyncReports, type LibrarySyncReports } from './library-sync-reports'

// Only AO3 destinations from a report can become links, including older reports.
function ao3Link(value?: string) {
 try { const url = new URL(value ?? ''); return url.origin === 'https://archiveofourown.org' && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}

export function LibrarySyncSummary({ state }: { state: LibrarySyncState }) {
 const [details, setDetails] = useState<'skipped' | 'dates' | null>(null)
 const listName = state.autoImport ? (/\/bookmarks(?:[?#]|$)/.test(state.url ?? '') ? 'Bookmark' : 'Marked for Later') : 'List'
 const issues: LibrarySyncIssue[] = (details === 'skipped' ? state.skippedEntries : state.chapterDateIssues) ?? []
 const count = details === 'skipped' ? state.skipped : state.chapterDatesUnavailable ?? 0
 const repairs = librarySyncRepairs(state)
 return <>
  {Boolean(state.batchStart) && <p className="field-help">{state.batchStart} pages already imported · {state.pages - (state.batchStart ?? 0)} pages in the current batch. Page and work totals below include all batches.</p>}
  <p role="status">{state.status} · {state.listPages !== undefined && <>{state.listPages} {listName} pages saved · </>}{state.pages} total pages saved · {state.count} works collected · {state.skipped ? <button type="button" className="text-button" onClick={() => setDetails('skipped')}>{state.skipped} Unsupported Entries Skipped</button> : '0 unsupported entries skipped'}</p>
  {state.hasMore && <p className="field-help">Batch ready: {state.pages - (state.batchStart ?? 0)} saved pages await import. Import this batch to continue with the remaining list pages and series. The Quick Sync baseline updates only after the entire scan finishes.</p>}
  {state.checkChapterDates && <p className="field-help">Chapter Dates: {state.chapterDatesChecked ?? 0} indexes checked · {state.chapterDatesUnavailable ? <button type="button" className="text-button" onClick={() => setDetails('dates')}>{state.chapterDatesUnavailable} Unavailable or Incomplete</button> : '0 unavailable or incomplete'}.</p>}
  {state.repairPages && <p className="field-help">Updated AO3 information for {repairs.metadata} works, including series information for {repairs.series} works. Found {repairs.reading} possible reading-status corrections. Use Review Reading Corrections to accept or keep them.</p>}
  {state.limited && <p className="field-help">Partial scan · pages {state.startPage ?? 1}–{state.endPage ?? 'end of list'}{state.partial ? ' · stopped at the selected end page; more pages remain on AO3' : ''}. Importing this range will not update the Quick Sync baseline.</p>}
  {details && <Dialog title={details === 'skipped' ? 'Skipped AO3 Entries' : 'Unavailable or Incomplete Chapter Dates'} onClose={() => setDetails(null)}>
   <div className="confirmation-description">
   <p>{count} {details === 'skipped' ? 'entries skipped.' : 'chapter indexes unavailable or incomplete. Reading progress was not inferred from these indexes.'}</p>
   {issues.length < count && <p className="field-help">Details for {count - issues.length} {count - issues.length === 1 ? 'entry were' : 'entries were'} not captured by the extension used for this scan. Run a new scan with the updated extension to collect them.</p>}
   <ul>{issues.map((issue, index) => <li key={`${issue.sourceUrl}:${issue.workId ?? index}`}>
    {ao3Link(issue.url) ? <a className="clickable-text" href={ao3Link(issue.url)} target="_blank" rel="noopener noreferrer">{issue.title}</a> : <strong>{issue.title}</strong>}
    <p>{issue.reason}</p>
    {issue.expectedChapters !== undefined && <p>{issue.foundChapters ?? 0} of {issue.expectedChapters} chapter dates available.</p>}
    {ao3Link(issue.sourceUrl) && <a className="clickable-text" href={ao3Link(issue.sourceUrl)} target="_blank" rel="noopener noreferrer">{details === 'skipped' ? 'Open Source Listing' : 'Open Chapter Index'}</a>}
   </li>)}</ul>
   </div>
  </Dialog>}
 </>
}

export function LibrarySyncReportHistory({ latest }: { latest?: LibrarySyncState }) {
 const [history, setHistory] = useState<LibrarySyncReports | null>(null)
 const [page, setPage] = useState(1), [selected, setSelected] = useState('')
 const [busy, setBusy] = useState(false), [error, setError] = useState('')
 async function load(nextPage = page) {
  setBusy(true); setError('')
  try { const next = await librarySyncReports(nextPage, latest); setHistory(next); setPage(nextPage); setSelected(next.reports[0]?.id ?? '') }
  catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load sync reports.') }
  finally { setBusy(false) }
 }
 const report = history?.reports.find(report => report.id === selected)
 return <div className="story-form">
  <button type="button" className="text-button clickable-text sync-reports-trigger" disabled={busy} onClick={() => void load()}>{busy ? 'Loading Sync Reports…' : history ? 'Refresh Saved Sync Reports' : 'View Saved Sync Reports'}</button>
  {error && <p role="alert" className="error-message">{error}</p>}
  {history && <>
   {!history.total ? <p>No saved sync reports yet.</p> : <>
    <label>Sync Report<select value={selected} onChange={event => setSelected(event.target.value)}>{history.reports.map(report => <option key={report.id} value={report.id}>{formatDateTime(report.completed_at)} · {report.report.count} works · {report.report.url}</option>)}</select></label>
    <Pagination itemLabel="reports" page={page} pages={Math.ceil(history.total / 10)} total={history.total} size={10} onPage={next => { if (!busy) void load(next) }} />
    {report && <LibrarySyncSummary key={report.id} state={report.report} />}
   </>}
  </>}
 </div>
}
