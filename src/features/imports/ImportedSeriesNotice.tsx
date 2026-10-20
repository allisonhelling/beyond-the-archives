import { useEffect, useState } from 'react'
import { useLibrary } from '../library/LibraryProvider'
import { seriesMemberships } from '../library/series'
import type { Status, Story } from '../library/model'
import { importHistory, submitImport } from './repository'
import { importFinished, selectedImportText, type SeriesPreview } from './urls'
import { SeriesImportReview } from './SeriesImportReview'

export function ImportedSeriesNotice({ stories, onImported }: { stories: Story[]; onImported?: (batchId: string) => void }) {
 const library = useLibrary()
 const [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const suggestions = stories.flatMap(story => { const series = seriesMemberships(story); return series.length ? [{ story, series }] : [] })
 if (!suggestions.length) return null
 async function confirm(works: SeriesPreview['works'], readingStatus: Status, seriesIds: number[]) {
  setBusy(true); setError('')
  try {
   const batch = await submitImport(selectedImportText(selected, works), false, readingStatus, seriesIds)
   if (!batch) throw new Error('No selected works could be imported.')
   await library.refresh(); setSelected(''); setMessage('Selected series works saved. Metadata retrieval will continue in the background.'); onImported?.(batch)
  } catch (error) { setError(error instanceof Error ? error.message : 'Could not import selected series works.') }
  finally { setBusy(false) }
 }
 return <section className="settings-card" aria-label="Series discovered after import"><h2>Discover related series</h2>
  {suggestions.map(({ story, series }) => <div key={story.id}><p><strong>{story.metadata.title}</strong> is part of the following series. Select a series to review its works:</p><ul>{series.map(series => <li key={series.id}><button className="text-button clickable-text" disabled={busy} onClick={() => { setSelected(series.url); setError('') }}>{series.name}</button></li>)}</ul></div>)}
  {selected && <SeriesImportReview key={selected} text={selected} savedIds={new Set(library.stories.flatMap(story => story.work.ao3_work_id ? [story.work.ao3_work_id] : []))} autoLoad busy={busy} onConfirm={(works, status, seriesIds) => void confirm(works, status, seriesIds)} onCancel={() => setSelected('')} />}
  {message && <p role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
 </section>
}

/** Add Story opens a fic immediately; discover its series only after retrieval
 * finishes, including when the fic page is reloaded during the batch. */
export function CompletedImportSeriesNotice({ batchId }: { batchId: string }) {
 const { refresh, stories } = useLibrary(), [currentBatch, setCurrentBatch] = useState(batchId), [entries, setEntries] = useState<string[]>([])
 useEffect(() => {
  let alive = true, timer: ReturnType<typeof setTimeout>
  async function check() {
   try {
    const history = await importHistory(currentBatch)
    if (!alive) return
    if (importFinished(history)) {
     await refresh()
     if (alive) setEntries(history.items.flatMap(item => item.entry_id ? [item.entry_id] : []))
     return
    }
   } catch { /* Keep the page usable and retry transient history failures. */ }
   if (alive) timer = setTimeout(() => void check(), 5000)
  }
  void check()
  return () => { alive = false; clearTimeout(timer) }
 }, [currentBatch, refresh])
 return <ImportedSeriesNotice stories={stories.filter(story => entries.includes(story.id))} onImported={id => { setEntries([]); setCurrentBatch(id) }} />
}
