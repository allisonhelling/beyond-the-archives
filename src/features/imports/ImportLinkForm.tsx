import { SeriesImportOptions } from './SeriesImportOptions'
import { CompletedImportSeriesNotice } from './ImportedSeriesNotice'
import { useSeriesImportBehavior } from './series-import-preferences'
import { SeriesImportReview } from './SeriesImportReview'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLibrary } from '../library/LibraryProvider'
import type { Status } from '../library/model'
import { sampleMode } from '../../lib/sample-mode'
import { importFinished, classifyUrl, parseWorkUrl, waybackSnapshot, selectedImportText, type SeriesPreview } from './urls'
import { importHistory, submitImport } from './repository'

type ImportItem = Awaited<ReturnType<typeof importHistory>>['items'][number]

export function ImportLinkForm() {
 const seriesBehavior = useSeriesImportBehavior()
 const [relatedOptions, setRelatedOptions] = useState({ reviewRelatedSeries: false, behavior: seriesBehavior.behavior, reviewedSeriesIds: [] as number[] })
  const library = useLibrary(), { refresh } = library
  const location = useLocation()
  const navigate = useNavigate()
  const initialUrl = typeof location.state?.workUrl === 'string' ? location.state.workUrl : ''
  const [url, setUrl] = useState(initialUrl), [batch, setBatch] = useState(''), [item, setItem] = useState<ImportItem>()
  const [source, setSource] = useState<'ao3' | 'wayback'>(() => waybackSnapshot(initialUrl) ? 'wayback' : 'ao3')
  const [reviewing, setReviewing] = useState(''), [multiple, setMultiple] = useState(false), [finishedBatch, setFinishedBatch] = useState(false), [entries, setEntries] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const complete = !!item && !['pending', 'processing'].includes(item.status)
  useEffect(() => {
    if (!batch) return
    let alive = true, failures = 0
    let timer: ReturnType<typeof setTimeout>
    async function check() {
      let finished = false
      try {
        const history = await importHistory(batch)
        if (!alive) return
        const next = history.items[0]
        finished = multiple ? importFinished(history) : !!next && !['pending', 'processing'].includes(next.status)
        if (multiple) {
          if (finished) await refresh(history.items.flatMap(item => item.entry_id ? [item.entry_id] : []))
          if (alive) { setFinishedBatch(finished); setEntries(history.items.flatMap(item => item.entry_id ? [item.entry_id] : [])); setItem(next); setError('') }
        } else if (next?.entry_id) {
          await refresh([next.entry_id])
          if (alive) navigate(`/stories/${next.entry_id}`, { replace: true, state: { importBatchId: batch, seriesImportBehavior: seriesBehavior.behavior, reviewRelatedSeries: seriesBehavior.reviewRelatedSeries } })
          return
        }
        failures = 0
        if (alive) { setItem(next); setError('') }
      } catch { failures++; finished = false; if (alive) setError('Could not check this import. Retrying shortly; you can also view it in import history.') }
      if (alive && !finished) timer = setTimeout(() => void check(), Math.max(document.hidden ? 30000 : 5000, Math.min(60000, 5000 * 2 ** failures)))
    }
    void check()
    return () => { alive = false; clearTimeout(timer) }
  }, [batch, refresh, navigate, multiple, seriesBehavior.behavior, seriesBehavior.reviewRelatedSeries])
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (source === 'wayback' && !waybackSnapshot(url)) throw new Error('Paste a full Wayback Machine snapshot link to an AO3 work, including its 14-digit capture timestamp.')
      if (classifyUrl(url).kind === 'series') { setReviewing(url.trim()); return }
      parseWorkUrl(url)
      const id = await submitImport(url.trim())
      if (!id) throw new Error('No AO3 work was found in that link.')
      setBatch(id)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not import this fic.') }
    finally { setBusy(false) }
  }
  async function importSelected(works: SeriesPreview['works'], readingStatus: Status, seriesIds: number[]) {
    setBusy(true); setError('')
    try {
      const id = await submitImport(selectedImportText(reviewing, works), true, readingStatus, seriesIds)
      if (!id) throw new Error('No works were selected for import.')
      for (const seriesId of seriesIds) await library.refreshSeries(seriesId)
      setRelatedOptions({reviewRelatedSeries: seriesBehavior.reviewRelatedSeries, behavior: seriesBehavior.behavior, reviewedSeriesIds: seriesIds}); setMultiple(true); setFinishedBatch(false); setBatch(id); setReviewing(''); seriesBehavior.reset()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not import selected works.') }
    finally { setBusy(false) }
  }
  return <>
    {sampleMode ? <section className="settings-card import-link-form"><p>Importing requires the connected application.</p><Link className="clickable-text" to="/add?import=manual">Add a Story Manually</Link></section> : reviewing ? <SeriesImportReview previewCache={seriesBehavior.previewCache} onPreview={seriesBehavior.cachePreview} error={error} automatic={seriesBehavior.behavior === 'all'} key={reviewing} text={reviewing} savedIds={new Set((library.stories ?? []).flatMap(story => story.work.ao3_work_id ? [story.work.ao3_work_id] : []))} busy={busy} onConfirm={(works, status, seriesIds) => void importSelected(works, status, seriesIds)} onCancel={() => setReviewing('')} /> : !batch ? <form className="story-form settings-card import-link-form" onSubmit={event => void submit(event)}>
      <label>Import Source<select value={source} disabled={busy} onChange={event => setSource(event.target.value as typeof source)}><option value="ao3">AO3 Work or Series Link</option><option value="wayback">Import from Wayback Machine</option></select></label>
      <label>{source === 'wayback' ? 'Wayback Machine Link' : 'AO3 Work or Series Link'}<input type="url" required value={url} disabled={busy} onChange={event => { setUrl(event.target.value); if (waybackSnapshot(event.target.value)) setSource('wayback') }} placeholder={source === 'wayback' ? 'https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/123' : 'https://archiveofourown.org/works/123'} /></label>
      <p className="field-help">{source === 'wayback' ? 'Paste the full archived AO3 work link, including its capture timestamp, to import the metadata saved in that snapshot.' : 'Paste an AO3 work or series link. For an archived work, choose Import from Wayback Machine or paste its full snapshot link.'}</p>
      <SeriesImportOptions reviewRelatedSeries={seriesBehavior.reviewRelatedSeries} onReviewRelatedSeriesChange={seriesBehavior.setReviewRelatedSeries} defaultBehavior={seriesBehavior.defaultBehavior} override={seriesBehavior.override} onChange={seriesBehavior.setOverride} disabled={busy} />
      <button className="button primary" disabled={busy}>{busy ? 'Importing…' : source === 'wayback' ? 'Import from Wayback Machine' : 'Import from Link'}</button>
    </form> : multiple ? <section className="settings-card series-import-result" aria-label="Series Import Result"><h2>{finishedBatch ? 'Series Import Finished' : 'Importing Selected Works'}</h2><p className={finishedBatch ? 'series-import-finished' : undefined} role="status">{finishedBatch ? 'Your selected works have finished processing.' : 'Your selected works are saved. Retrieving their metadata…'}</p><ul>{entries.map(id => <li key={id}><Link className="clickable-text" to={`/stories/${id}`} state={{ importBatchId: batch }}>{library.stories?.find(story => story.id === id)?.metadata.title ?? 'View Saved Work'}</Link></li>)}</ul><div className="form-actions"><Link className="button secondary" to="/library?shelf=series">View Series Collection</Link><button className="button secondary" onClick={() => { setBatch(''); setMultiple(false); setItem(undefined); setEntries([]) }}>Add Another Story</button></div></section> : <>
      {!complete ? <section className="settings-card"><p role="status">Retrieving metadata… Your fic is saved; this may take a few minutes. If using the extension, keep your browser running and complete any AO3 confirmation in its requested tab.</p><Link className="clickable-text" to="/imports">View Import History</Link></section> : <section className="settings-card" aria-label="Import Result">
        <h2>Import Result</h2>
        <p role="status">No saved fic was available for this import.</p>
        {item?.error_message && <p>{item.error_message}</p>}
        <Link className="clickable-text" to="/imports">View Import History</Link>
      </section>}
    </>}
    {batch && multiple && relatedOptions.reviewRelatedSeries && <CompletedImportSeriesNotice reviewedSeriesIds={relatedOptions.reviewedSeriesIds} batchId={batch} initialBehavior={relatedOptions.behavior} reviewRelatedSeries={relatedOptions.reviewRelatedSeries} />}
    {error && !reviewing && <p className="error-message" role="alert">{error}</p>}
  </>
}
