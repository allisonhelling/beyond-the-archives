import { DesktopRetrievalGate } from './DesktopRetrievalGate'
import { useActivity } from '../../lib/use-activity'
import { sampleMode } from '../../lib/sample-mode'
import { useSeriesImportBehavior, type SeriesImportBehavior } from './series-import-preferences'
import { useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { useLibrary } from '../library/LibraryProvider'
import { seriesMemberships } from '../library/series/series'
import type { Status, Story } from '../library/model'
import { importHistory, submitImport } from './repository'
import { importFinished, selectedImportText, type SeriesPreview } from './urls'
import { SeriesImportReview } from './SeriesImportReview'

export function ImportedSeriesNotice({ stories, onImported, initialBehavior, reviewRelatedSeries = false, reviewedSeriesIds = [] }: { stories: Story[]; onImported?: (batchId: string) => void; initialBehavior?: SeriesImportBehavior; reviewRelatedSeries?: boolean; reviewedSeriesIds?: number[] }) {
 const seriesBehavior = useSeriesImportBehavior(initialBehavior)
 const library = useLibrary()
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 useActivity(Boolean(busy), 'Importing selected series works…')
 const [dismissed, setDismissed] = useState(''), [reviewBusy, setReviewBusy] = useState(false)
 const reviewed = new Set(reviewedSeriesIds)
 const suggestions = reviewRelatedSeries ? stories.flatMap(story => { const series = seriesMemberships(story).filter(series => !reviewed.has(series.id)); return series.length ? [{ story, series }] : [] }) : []
 const seriesUrls = [...new Map(suggestions.flatMap(({ series }) => series.map(item => [item.id, item.url] as const))).values()]
 const reviewText = seriesUrls.join('\n')
 const signature = suggestions.map(({ story }) => story.id).sort().join(',')
 if (!suggestions.length || dismissed === signature) return null
 async function confirm(works: SeriesPreview['works'], readingStatus: Status, seriesIds: number[]) {
  setBusy(true); setError('')
  try {
   const batch = await submitImport(selectedImportText(reviewText, works), false, readingStatus, seriesIds)
   if (!batch) throw new Error('No selected works could be imported.')
   if (sampleMode) await library.refresh()
   else {
    const history = await importHistory(batch, {historyPage:1,resultPage:1,status:'all'})
    await library.refresh((history.changes ?? history.items).flatMap(item => item.entry_id ? [item.entry_id] : []))
   }
   for (const id of seriesIds) await library.refreshSeries(id)
   seriesBehavior.reset(); setMessage('Selected series works saved. Metadata retrieval will continue in the background.'); onImported?.(batch)
  } catch (error) { setError(error instanceof Error ? error.message : 'Could not import selected series works.') }
  finally { setBusy(false) }
 }
 return <Dialog title="Related Series" className="series-review-dialog" busy={busy || reviewBusy} onClose={() => setDismissed(signature)}>
  {suggestions.map(({ story }) => <p key={story.id}><strong>{story.metadata.title}</strong> is part of the following series. {seriesBehavior.behavior === 'all' ? 'All available works from these series will be imported.' : 'Choose which of its series works to add below.'}</p>)}
  <DesktopRetrievalGate>{reviewText && <SeriesImportReview previewCache={seriesBehavior.previewCache} onPreview={seriesBehavior.cachePreview} embedded automatic={seriesBehavior.behavior === 'all'} key={reviewText} text={reviewText} savedIds={new Set(library.stories.flatMap(story => story.work.ao3_work_id ? [story.work.ao3_work_id] : []))} busy={busy} onBusyChange={setReviewBusy} onConfirm={(works, status, seriesIds) => void confirm(works, status, seriesIds)} onCancel={() => setDismissed(signature)} />}</DesktopRetrievalGate>
  {message && <p role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
 </Dialog>
}

/** Add Story opens a fic immediately; discover its series only after retrieval
 * finishes, including when the fic page is reloaded during the batch. */
export function CompletedImportSeriesNotice({ batchId, workIds, initialBehavior, reviewRelatedSeries = false, reviewedSeriesIds = [] }: { batchId?: string; workIds?: number[]; initialBehavior?: SeriesImportBehavior; reviewRelatedSeries?: boolean; reviewedSeriesIds?: number[] }) {
 const { refresh, stories } = useLibrary({ catalog: reviewRelatedSeries }), [currentBatch, setCurrentBatch] = useState(batchId), [entries, setEntries] = useState<string[]>([]), [discover, setDiscover] = useState(true)
 const [finished, setFinished] = useState(!batchId)
 useEffect(() => {
  if (!reviewRelatedSeries || !currentBatch) return
  let alive = true, failures = 0, timer: ReturnType<typeof setTimeout>
  async function check() {
   try {
    const history = await importHistory(currentBatch)
    if (!alive) return
    if (importFinished(history)) {
     await refresh(history.items.flatMap(item => item.entry_id ? [item.entry_id] : []))
     if (alive) { setEntries(history.items.flatMap(item => item.entry_id ? [item.entry_id] : [])); setFinished(true) }
     return
    }
    failures = 0
   } catch { failures++ }
   if (alive) timer = setTimeout(() => void check(), Math.max(document.hidden ? 30000 : 5000, Math.min(60000, 5000 * 2 ** failures)))
  }
  void check()
  return () => { alive = false; clearTimeout(timer) }
 }, [currentBatch, refresh, reviewRelatedSeries])
 const includedEntries = new Set(entries), includedWorks = new Set(workIds)
 return discover && reviewRelatedSeries ? <ImportedSeriesNotice reviewedSeriesIds={reviewedSeriesIds} reviewRelatedSeries={reviewRelatedSeries} initialBehavior={initialBehavior} stories={stories.filter(story => includedEntries.has(story.id) || finished && story.work.ao3_work_id !== null && includedWorks.has(story.work.ao3_work_id))} onImported={id => { setEntries([]); setCurrentBatch(id); setDiscover(false) }} /> : null
}
