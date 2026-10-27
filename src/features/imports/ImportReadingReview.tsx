import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pagination } from '../library/browsing/Pagination'
import { statuses } from '../library/model'
import { formatDate } from '../../lib/dates'
import { reviewImportReading, type ReadingReviews, type ReadingSnapshot } from './import-reading-review'

function ReadingState({ state, known = true }: { state: ReadingSnapshot; known?: boolean }) {
 return <>{statuses[state.status]}<small>{known ? `${state.progress} chapters read` : 'Chapter progress unconfirmed'}</small><small>Finished: {formatDate(state.finishedAt)}</small></>
}

/** Reuse import conflict table, selection and pagination patterns for reading only. */
export function ImportReadingReview({ onChanged }: { onChanged: () => Promise<void> }) {
 const [data, setData] = useState<ReadingReviews>(), [page, setPage] = useState(1)
 const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 async function load(nextPage = 1, action: 'list' | 'accept' | 'keep' = 'list', ids: string[] = []) {
  if (busy) return
  setBusy(true); setError('')
  try {
   const result = await reviewImportReading(ids, action, nextPage)
   setData(result); setPage(nextPage); setSelected([])
   if (action !== 'list') { setMessage(`${result.changed} corrections ${action === 'accept' ? 'accepted' : 'kept unchanged'}.${result.skipped ? ` ${result.skipped} entries changed since review and were skipped.` : ''}`); await onChanged() }
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load reading corrections.') }
  finally { setBusy(false) }
 }
 return <div className="story-form">
  <button type="button" className="button secondary" disabled={busy} onClick={() => void load()}>Review Reading Corrections</button>
  {data && <>
   <p>{data.total} possible reading-status corrections. AO3 metadata was repaired separately. Only accepting a correction changes your reading history.</p>
   <p className="field-help">Imported defaults and bookmark dates are suggestions. Entries without recorded provenance need your review. Explicit personal reading edits are preserved.</p>
   {data.reviews.length > 0 && <>
    <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setSelected(data.reviews.map(review => review.id))}>Select All on This Page</button><button type="button" className="button primary" disabled={busy || !selected.length} onClick={() => void load(1, 'accept', selected)}>Accept Selected Corrections</button><button type="button" className="button secondary" disabled={busy || !selected.length} onClick={() => void load(1, 'keep', selected)}>Keep Selected Reading History</button></div>
    <div className="import-results"><table><caption>Reading-Status Corrections</caption><thead><tr><th>Select</th><th>Work</th><th>Saved Reading State</th><th>Proposed Reading State</th><th>Action</th></tr></thead><tbody>{data.reviews.map(review => <tr key={review.id}>
     <td><input type="checkbox" aria-label={`Select Correction for ${review.title}`} disabled={busy} checked={selected.includes(review.id)} onChange={event => setSelected(current => event.target.checked ? [...current, review.id] : current.filter(id => id !== review.id))} /></td>
     <td><Link to={`/stories/${review.id}`}>{review.title}</Link><small>{review.source === 'legacy_unknown' ? 'Previous source unknown — review required' : review.source === 'import_default' ? 'Imported default' : 'Bookmark date inference'}</small></td>
     <td><ReadingState state={review.saved} known={review.savedProgressKnown} /></td><td><ReadingState state={review.proposed} known={review.progressKnown} /></td>
     <td><button type="button" className="button secondary" disabled={busy} onClick={() => void load(1, 'accept', [review.id])}>Accept Correction</button><button type="button" className="button secondary" disabled={busy} onClick={() => void load(1, 'keep', [review.id])}>Keep Reading History</button></td>
    </tr>)}</tbody></table></div>
   </>}
   <Pagination itemLabel="corrections" page={page} pages={Math.max(1, Math.ceil(data.total / 50))} total={data.total} size={50} onPage={next => void load(next)} />
  </>}
  {message && <p role="status">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}
 </div>
}
