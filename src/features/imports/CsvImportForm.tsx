import { useRef, useState } from 'react'
import { formatDate } from '../../lib/dates'
import { statuses } from '../library/model'
import { csvMetadata, readAo3Csv, uniqueCsvWorks, type CsvChoice, type CsvConflict, type CsvSource, type CsvWork } from './ao3-csv'
import { previewCsvImport, submitCsvImport } from './repository'

import { SeriesImportReview, type SeriesWorkSelection } from './SeriesImportReview'

type Prepared = { works: CsvWork[]; conflicts: CsvConflict[] }
export function CsvImportForm({ onImported }: { onImported: (batch: string | null) => Promise<void> }) {
 const [prepared, setPrepared] = useState<Prepared>(), [choices, setChoices] = useState<Record<number, CsvChoice>>({})
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const [seriesSources, setSeriesSources] = useState<CsvSource[]>()
 const pending = useRef(false)
 async function preview(files: File[]) {
  if (pending.current) return
  pending.current = true; setBusy(true); setError(''); setMessage(''); setPrepared(undefined); setSeriesSources(undefined); setChoices({})
  try {
   if (files.reduce((size, file) => size + file.size, 0) > 20_000_000) throw new Error('Choose CSV files totaling at most 20 MB.')
   const sources = (await Promise.all(files.map(async file => readAo3Csv(await file.text())))).flat()
   if (sources.some(row => row.seriesId !== undefined)) setSeriesSources(sources)
   else await prepare(sources.filter((row): row is CsvWork => row.workId !== undefined))
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not read the CSV files.'); setMessage('') }
  finally { pending.current = false; setBusy(false) }
 }
 async function prepare(works: CsvWork[]) {
  const unique = uniqueCsvWorks(works)
  if (!unique.length || unique.length > 2000) throw new Error('Import between 1 and 2,000 unique works at a time, including series installments.')
  const conflicts = await previewCsvImport(unique)
  setPrepared({ works: unique, conflicts }); setSeriesSources(undefined); setMessage('')
 }
 async function reviewSeries(selections: SeriesWorkSelection[]) {
  if (!seriesSources || pending.current) return
  pending.current = true; setBusy(true); setError('')
  try {
   const works = seriesSources.filter((row): row is CsvWork => row.workId !== undefined)
   for (const row of seriesSources.filter(row => row.seriesId !== undefined)) {
    for (const work of selections.find(selection => selection.seriesId === row.seriesId)?.works ?? []) {
     // Use the selected installment's metadata and date, retaining its source bookmark.
     const metadata = csvMetadata({ title: work.title, summary: work.summary, author: work.authors.join(', '), fandoms: (work.fandoms ?? []).join(', '), chapters: work.chapters, words: String(work.wordCount ?? ''), rating: work.rating ?? '', relationships: (work.relationshipTags ?? []).join(', '), characters: (work.characterTags ?? []).join(', '), freeforms: (work.additionalTags ?? []).join(', '), warnings: (work.archiveWarnings ?? []).join(', '), date: work.updated?.slice(0, 10) ?? '' })
     works.push({ ...row, workId: work.workId, url: work.url, metadata, updatedDate: work.updated?.slice(0, 10) ?? null })
    }
   }
   await prepare(works)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not review CSV conflicts.') }
  finally { pending.current = false; setBusy(false) }
 }
 async function save() {
  if (!prepared || pending.current) return
  pending.current = true; setBusy(true); setError('')
  try {
   const result = await submitCsvImport(prepared.works, prepared.conflicts, choices)
   setPrepared(undefined); setMessage(`Imported ${result.imported} works. Kept ${result.kept} existing works. Metadata and chapter dates continue processing in import history.`)
   await onImported(result.batch)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not import the CSV files.') }
  finally { pending.current = false; setBusy(false) }
 }
 const conflicts = prepared?.conflicts.filter(conflict => prepared.works.some(work => work.workId === conflict.workId && work.source === 'bookmarks')) ?? []
 const laterSkipped = (prepared?.conflicts.length ?? 0) - conflicts.length
 return <section className="settings-card story-form" aria-labelledby="csv-import-heading">
  <h2 id="csv-import-heading">Import AO3 bookmarks or Marked for Later</h2>
  <p>Choose CSV exports from your AO3 scraper, including combined lists. Bookmark notes become personal notes and bookmark tags become personal tags. Marked for Later works are saved as unread (To Read); existing works are always kept.</p>
  <p className="field-help">Bookmarks dated after the work’s update date are saved as Read (Finished), with that bookmark date as the finished date. Earlier bookmarks are Currently Reading (Reading); chapter release dates determine progress. Missing dates leave progress unconfirmed. Choose which works to include from each series before reviewing conflicts.</p>
  <label>AO3 CSV files<input type="file" multiple accept=".csv,text/csv" disabled={busy || Boolean(seriesSources)} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void preview(files) }} /></label>
  {busy && <p role="status">{message || 'Processing CSV import…'}</p>}
  {!busy && message && <p role="status">{message}</p>}
  {error && <p className="error-message" role="alert">{error}</p>}
  {seriesSources && <SeriesImportReview text={seriesSources.map(row => row.url).join('\n')} savedIds={new Set()} busy={busy} showReadingStatus={false} confirmLabel="Review CSV conflicts" cancelLabel="Back to CSV files" onConfirm={(_works, _status, _seriesIds, selections) => void reviewSeries(selections)} onCancel={() => { setSeriesSources(undefined); setError('') }} />}
  {prepared && <>
   <p>{prepared.works.length} unique works · {conflicts.length} bookmark conflicts · {laterSkipped} existing Marked for Later works will be skipped.</p>
   {conflicts.length > 0 && <>
    <p>Choose how to handle each existing bookmark. Overwrite replaces imported metadata, notes, personal tags, reading status, progress, and finished date. Ratings, favorites, and collections are kept. Unselected conflicts default to Keep.</p>
    <div className="form-actions">{(['overwrite', 'keep'] as const).map(choice => <button type="button" className="button secondary" key={choice} disabled={busy} onClick={() => setChoices(Object.fromEntries(conflicts.map(conflict => [conflict.workId, choice])))}>{choice === 'overwrite' ? 'Overwrite all works' : 'Keep all works'}</button>)}</div>
    <div className="import-results"><table><caption>Bookmark conflicts</caption><thead><tr><th>Work</th><th>Existing data</th><th>Incoming bookmark</th><th>Action</th></tr></thead><tbody>{conflicts.map(conflict => {
     const incoming = prepared.works.find(work => work.workId === conflict.workId)!
     return <tr key={conflict.workId}><td>{incoming.metadata.title}</td><td>{conflict.title}<small>{statuses[conflict.status as keyof typeof statuses]} · {conflict.progress} chapters read</small><small>{conflict.notes}</small><small>{conflict.tags.join(', ')}</small></td><td>{formatDate(incoming.bookmarkDate)}<small>{incoming.notes}</small><small>{incoming.tags.join(', ')}</small></td><td><label>Action for {incoming.metadata.title}<select disabled={busy} value={choices[conflict.workId] ?? 'keep'} onChange={event => setChoices(current => ({ ...current, [conflict.workId]: event.target.value as CsvChoice }))}><option value="keep">Keep existing work</option><option value="overwrite">Overwrite with bookmark</option></select></label></td></tr>
    })}</tbody></table></div>
   </>}
   <div className="form-actions"><button type="button" className="button primary" disabled={busy} onClick={() => void save()}>Import CSV works</button><button type="button" className="button secondary" disabled={busy} onClick={() => { setPrepared(undefined); setError('') }}>Cancel CSV import</button></div>
  </>}
 </section>
}
