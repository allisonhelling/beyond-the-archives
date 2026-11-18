import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { brandSlug } from '../../lib/brand'
import { Pagination } from '../library/browsing/Pagination'
import { reviewImportCounts, type CountEdit, type CountReview } from './site-bulk-repository'

const sizes = [10, 25, 50]
type ReviewState = { page: number; size: number; progress: boolean; drafts: Record<string, CountEdit> }
function readState(key: string): ReviewState {
 const initial = { page: 1, size: 25, progress: false, drafts: {} }
 try {
  const value = JSON.parse(localStorage.getItem(key) ?? 'null') as ReviewState | null
  if (value && Number.isInteger(value.page) && value.page > 0 && sizes.includes(value.size)
   && typeof value.progress === 'boolean' && value.drafts && typeof value.drafts === 'object') return value
 } catch { /* The queue can still be reviewed when browser storage is unavailable. */ }
 return initial
}

export function ImportCountReview({ batch, owner, onSaved, onClose }: { batch: string; owner: string; onSaved: () => Promise<unknown>; onClose: () => void }) {
 const key = `${brandSlug}:import-count-review:v1:${owner}:${batch}`
 const [state, setState] = useState(() => readState(key))
 const { page, size, progress, drafts } = state
 const [revision, reload] = useState(0), [result, setResult] = useState<{ query: string; review: CountReview }>()
 const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
 const query = JSON.stringify([page, size, progress, revision])
 const visible = result?.query === query ? result.review : undefined
 useEffect(() => {
  let active = true
  void reviewImportCounts(batch, page, size, progress).then(review => {
   if (active) setResult({ query, review })
  }).catch(e => { if (active) setError(e.message) })
  return () => { active = false }
 }, [batch, page, size, progress, query])
 function update(next: Partial<ReviewState>) {
  const value = { ...state, ...next }
  setState(value)
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch { setError('Browser storage could not save these draft choices for later.') }
 }
 const rows = visible?.rows ?? []
 const edits = rows.flatMap(row => drafts[row.id] ? [drafts[row.id]] : [])
 const issues = visible?.issues ?? {}
 function edit(row: CountReview['rows'][number], patch: Partial<CountEdit>) {
  const draft = drafts[row.id] ?? { id: row.id, revision: row.revision, count: '', manual: false }
  const next = { ...draft, ...patch }
  const changes = { ...drafts }
  if (!next.count && !next.manual) delete changes[row.id]
  else changes[row.id] = next
  update({ drafts: changes })
 }
 async function save() {
  setError(''); setMessage(''); setBusy(true)
  try {
   const review = await reviewImportCounts(batch, page, size, progress, edits)
   const remaining = { ...drafts }
   for (const entry of edits) if (!Object.hasOwn(review.issues, entry.id)) delete remaining[entry.id]
   update({ drafts: remaining })
   setResult({ query, review })
   setMessage(`${review.saved} saved. ${Object.keys(review.issues).length} need attention.`)
   if (review.saved) await onSaved()
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not save count reviews.') }
  finally { setBusy(false) }
 }
 return <section className="settings-card" aria-label="Missing Chapter Counts">
  <h2>Missing Chapter Counts</h2>
  <div className="story-form">
   <label>Stories per Page<select value={size} disabled={busy} onChange={event => update({ size: Number(event.target.value), page: 1 })}>{sizes.map(size => <option key={size}>{size}</option>)}</select></label>
   <label className="check-label"><input type="checkbox" disabled={busy} checked={progress} onChange={event => update({ progress: event.target.checked, page: 1 })} />Only Review Stories with Reading Progress</label>
  </div>
   {visible && <Pagination page={visible.page} pages={visible.pages} total={visible.total} size={size} onPage={next => { if (!busy) update({ page: next }) }} itemLabel="stories" />}
  <form className="story-form" onSubmit={event => { event.preventDefault(); void save() }}>
   {!visible && !error && <p role="status">Loading chapter count reviews…</p>}
   {rows.map(row => {
    const draft = drafts[row.id], stale = draft && draft.revision !== row.revision
    return <fieldset key={row.id} disabled={busy}><legend>{row.title}</legend>
     <p>{row.progress} chapters read</p>
     <div className="form-controls-row">
      <label>Published Chapter Count<input type="number" min={1} max={100000} step={1} value={draft?.count ?? ''} disabled={stale} onChange={event => edit(row, { count: event.target.value })} /></label>
      <label className="check-label"><input type="checkbox" checked={draft?.manual ?? false} disabled={stale} onChange={event => edit(row, { manual: event.target.checked })} />Manually Entered Chapter Count</label>
     </div>
     {stale && <p role="alert">This story changed. <button className="text-button" type="button" onClick={() => edit(row, { count: '', manual: false })}>Discard Stale Draft</button></p>}
     {issues[row.id] && <p role="alert">{issues[row.id]} <Link to={`/stories/${row.id}?edit=metadata`}>Review Story</Link></p>}
    </fieldset>
   })}
   <div className="form-actions">
    <button className="button primary" disabled={busy || !edits.length || edits.some(entry => !entry.manual || !/^[0-9]{1,6}$/.test(entry.count) || Number(entry.count) < 1 || Number(entry.count) > 100000 || entry.revision !== rows.find(row => row.id === entry.id)?.revision)}>Save Page Counts</button>
    <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Resume Later</button>
    {error && <button className="text-button" type="button" disabled={busy} onClick={() => { setError(''); reload(value => value + 1) }}>Reload Counts</button>}
   </div>
  </form>
  {error && <p role="alert">{error}</p>}
  {message && <p role="status">{message}</p>}
 </section>
}
