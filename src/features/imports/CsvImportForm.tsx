import { ImportReadingReview } from './ImportReadingReview'
import { sampleMode } from '../../lib/sample-mode'
import { SeriesImportOptions } from './SeriesImportOptions'
import { useSeriesImportBehavior } from './series-import-preferences'
import { FilePicker } from '../../components/FilePicker'
import { BookmarkChapterDatesOption } from './BookmarkChapterDatesOption'
import { useRef, useState } from 'react'
import { formatDate } from '../../lib/dates'
import { statuses } from '../library/model'
import { bookmarkConflicts, bookmarkReadingState, csvMetadata, csvWorkKey, readAo3Csv, uniqueCsvWorks, type CsvChoice, type CsvConflict, type CsvSource, type CsvWork } from './ao3-csv'
import { previewCsvImport, submitCsvImport } from './repository'

import { SeriesImportReview, type SeriesWorkSelection } from './SeriesImportReview'

type Prepared = { works: CsvWork[]; conflicts: CsvConflict[] }
export function CsvImportForm({ onImported }: { onImported: (batch: string | null) => Promise<void> }) {
 const seriesBehavior = useSeriesImportBehavior()
 const [checkChapterDates, setCheckChapterDates] = useState(false)
 const [prepared, setPrepared] = useState<Prepared>(), [choices, setChoices] = useState<Record<string, CsvChoice>>({})
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
     const metadata = csvMetadata({ title: work.title, summary: work.summary, summary_html: work.summary_html ?? '', author: work.authors.join(', '), fandoms: (work.fandoms ?? []).join(', '), chapters: work.chapters, words: String(work.wordCount ?? ''), rating: work.rating ?? '', relationships: (work.relationshipTags ?? []).join(', '), characters: (work.characterTags ?? []).join(', '), freeforms: (work.additionalTags ?? []).join(', '), warnings: (work.archiveWarnings ?? []).join(', '), date: work.updated?.slice(0, 10) ?? '' })
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
   const result = await submitCsvImport(prepared.works, prepared.conflicts, choices, checkChapterDates)
   setPrepared(undefined); seriesBehavior.reset(); setMessage(`Updated AO3 information for ${result.metadataRepaired ?? 0} works, including series information for ${result.seriesRepaired ?? 0} works. Found ${result.readingCorrections ?? 0} possible reading-status corrections. Imported ${result.imported} works. Kept ${result.kept} existing works. Non-empty AO3 metadata was refreshed for existing works. Metadata${checkChapterDates ? ' and chapter dates' : ''} for new or overwritten works continue processing in import history.`)
   await onImported(result.batch)
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not import the CSV files.') }
  finally { pending.current = false; setBusy(false) }
 }
 const conflicts = prepared ? bookmarkConflicts(prepared.works, prepared.conflicts) : []
 const laterSkipped = prepared?.conflicts.filter(conflict => prepared.works.some(work => work.workId === conflict.workId && work.source === 'marked_for_later')).length ?? 0
 return <section className="settings-card story-form" aria-labelledby="csv-import-heading">
  <h2 id="csv-import-heading">Import from CSV (Bookmarks or Marked for Later)</h2>
  {sampleMode ? <p>CSV imports are available in the connected library. Local sample mode does not save CSV import batches.</p> : <>
  <p>Choose CSV exports from your AO3 scraper, including combined lists. Bookmark notes become personal notes and bookmark tags become personal tags. Marked for Later works are saved as unread (To Read); existing personal data is always kept. Non-empty AO3 metadata refreshes automatically for every imported work, including existing works. Explicit manual metadata corrections are preserved.</p>
  <p className="field-help">Bookmarks dated after the work’s update date are saved as Read (Finished), with that bookmark date as the finished date. Earlier bookmarks are Currently Reading (Reading); chapter progress is unconfirmed unless you enable the chapter-date check. Missing dates leave progress unconfirmed. Choose which works to include from each series before reviewing conflicts.</p>
  <BookmarkChapterDatesOption checked={checkChapterDates} disabled={busy} onChange={setCheckChapterDates} />
  <SeriesImportOptions defaultBehavior={seriesBehavior.defaultBehavior} override={seriesBehavior.override} onChange={seriesBehavior.setOverride} disabled={busy || Boolean(seriesSources) || Boolean(prepared)} />
  <FilePicker label="AO3 CSV Files" multiple accept=".csv,text/csv" disabled={busy || Boolean(seriesSources)} onChange={files => void preview(files)} />
  {busy && <p role="status">{message || 'Processing CSV import…'}</p>}
  {!busy && message && <p role="status">{message}</p>}
  {error && !seriesSources && <p className="error-message" role="alert">{error}</p>}
  {seriesSources && <SeriesImportReview previewCache={seriesBehavior.previewCache} onPreview={seriesBehavior.cachePreview} error={error} automatic={seriesBehavior.behavior === 'all'} text={seriesSources.map(row => row.url).join('\n')} savedIds={new Set()} busy={busy} showReadingStatus={false} confirmLabel="Review CSV Conflicts" onConfirm={(_works, _status, _seriesIds, selections) => void reviewSeries(selections)} onCancel={() => { setSeriesSources(undefined); setError('') }} />}
  <ImportReadingReview onChanged={() => onImported(null)} />
  {prepared && <>
   <p>{prepared.works.length} unique works · {conflicts.length} bookmark conflicts · {laterSkipped} existing Marked for Later works will keep personal data.</p>
   {conflicts.length > 0 && <>
    <p>Choose how to handle each existing bookmark. Overwrite replaces notes, personal tags, reading status, and progress. Older known bookmark dates can repair saved and source bookmark dates with either choice. Personal reading dates change only with Overwrite or an accepted reading correction. Rec is enabled if either version selected it. AO3 metadata refreshes automatically with either choice; empty fields do not erase saved data. For deleted bookmarks, Overwrite replaces only notes and personal tags; saved work metadata and reading history remain. Ratings, favorites, and collections are kept. Unselected conflicts default to Keep.</p>
    <div className="form-actions">{(['overwrite', 'keep'] as const).map(choice => <button type="button" className="button secondary" key={choice} disabled={busy} onClick={() => setChoices(Object.fromEntries(conflicts.map(conflict => [csvWorkKey(conflict), choice])))}>{choice === 'overwrite' ? 'Overwrite All Works' : 'Keep All Works'}</button>)}</div>
    <div className="import-results"><table><caption>Bookmark Conflicts</caption><thead><tr><th>Work</th><th>Existing Data</th><th>Incoming Bookmark</th><th>Action</th></tr></thead><tbody>{conflicts.map(conflict => {
     const incoming = prepared.works.find(work => csvWorkKey(work) === csvWorkKey(conflict))!
     const reading = bookmarkReadingState(incoming)
     return <tr key={csvWorkKey(conflict)}><td>{incoming.metadata.title || `Deleted Work — Bookmark #${incoming.bookmarkId}`}</td><td>{conflict.title}<small>{statuses[conflict.status as keyof typeof statuses]} · {conflict.progress} chapters read</small><small>Finished: {formatDate(conflict.finishedAt)}</small><small>{conflict.notes}</small><small>{conflict.tags.join(', ')}</small></td><td>{formatDate(incoming.bookmarkDate)}<small>{incoming.workStatus === 'deleted' ? 'Deleted on AO3 · Existing reading history is kept' : <>{statuses[reading.status]} · {reading.status === 'finished' && incoming.metadata.published_chapters !== undefined ? `${reading.progress} chapters read` : 'chapter progress unconfirmed'}</>}</small><small>{incoming.notes}</small><small>{incoming.tags.join(', ')}</small></td><td><label>Action for {incoming.metadata.title || `Deleted Work — Bookmark #${incoming.bookmarkId}`}<select disabled={busy} value={choices[csvWorkKey(conflict)] ?? 'keep'} onChange={event => setChoices(current => ({ ...current, [csvWorkKey(conflict)]: event.target.value as CsvChoice }))}><option value="keep">Keep Existing Work</option><option value="overwrite">Overwrite With Bookmark</option></select></label></td></tr>
    })}</tbody></table></div>
   </>}
   <div className="form-actions"><button type="button" className="button primary" disabled={busy} onClick={() => void save()}>Import CSV Works</button><button type="button" className="button secondary" disabled={busy} onClick={() => { setPrepared(undefined); setError('') }}>Cancel CSV Import</button></div>
  </>}
  </>}
 </section>
}
