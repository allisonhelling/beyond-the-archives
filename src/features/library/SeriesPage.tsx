import { browsingReturnTo } from './browsing'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useLibrary } from './LibraryProvider'
import { LibraryBoundary, StoryCard } from './LibraryPages'
import { readingStatusIcons } from './collection-appearance'
import { ao3Date } from './model'
import { AuthorNames } from './AuthorNames'
import { PersonalNote } from './PersonalNote'
import { librarySeries, seriesReadingLabel, seriesReadingStatus, seriesCompletionLabel, type LibrarySeries } from './series'
import { SeriesControls } from './SeriesControls'
import { saveSeriesNote } from './series-repository'
import { importHistory, previewSeries, submitImport } from '../imports/repository'
import { SeriesImportReview } from '../imports/SeriesImportReview'
import { sampleMode } from '../../lib/sample-mode'
import type { SeriesPreview } from '../imports/urls'

export function SeriesPage() {
 const { id } = useParams(), library = useLibrary(), seriesId = Number(id)
 const valid = /^[1-9]\d*$/.test(id ?? '') && Number.isSafeInteger(seriesId)
 const { refreshSeries, loadDetails, retainDetails } = library
 const location = useLocation()
 const candidate = location.state?.returnTo
 const returnTo = browsingReturnTo(candidate, '/library?shelf=series')
 const record = (library.series ?? []).find(record => record.ao3_series_id === seriesId)
 const [preview, setPreview] = useState<SeriesPreview>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [review, setReview] = useState(false)
 const attempted = useRef<number | undefined>(undefined)
 const load = useCallback(async () => {
  setBusy(true); setError('')
  try { const next = await previewSeries(`https://archiveofourown.org/series/${seriesId}`); setPreview(next); await refreshSeries(seriesId) }
  catch (error) { setError(error instanceof Error ? error.message : 'Could not load series details.') }
  finally { setBusy(false) }
 }, [seriesId, refreshSeries])
 useEffect(() => {
  if (!valid || library.loading || record || sampleMode || attempted.current === seriesId) return
  attempted.current = seriesId; void load()
 }, [valid, library.loading, record, seriesId, load])
 const details = preview?.seriesId === seriesId ? preview : record?.metadata as unknown as SeriesPreview | undefined
 useEffect(() => {
  if (valid && record?.detailsLoaded === false) void refreshSeries(seriesId, false).catch(error => setError(error instanceof Error ? error.message : 'Could not load series details.'))
 }, [valid, record, refreshSeries, seriesId])
 const saved = librarySeries(library.stories, library.series ?? []).find(series => series.seriesId === seriesId)
 const series: LibrarySeries = saved ?? { ...details, seriesId, normalizedUrl: `https://archiveofourown.org/series/${seriesId}`, title: details?.title ?? `Series ${seriesId}`, description: details?.description ?? '', works: details?.works ?? [], savedStories: [], fandoms: [...new Set(details?.works.flatMap(work => work.fandoms ?? []) ?? [])], detailsLoaded: Boolean(details), record }
 const retained = series.savedStories.map(story => story.id).sort().join(',')
 useEffect(() => retained ? retainDetails(retained.split(',')) : undefined, [retained, retainDetails])
 const missing = series.savedStories.filter(story => story.detailsLoaded === false).map(story => story.id).sort().join(',')
 useEffect(() => { if (missing) void loadDetails(missing.split(',')).catch(() => {}) }, [missing, loadDetails])
 const StatusIcon = readingStatusIcons[seriesReadingStatus(series)]
 if (!valid) return <p role="alert">This series identifier is invalid.</p>
 return <LibraryBoundary><SeriesControls series={series}>{({ favorite, collectionsField, finishButton }) => <div className="story-details-page series-details-page">
  <div className="page-heading story-details-heading"><div>
   <Link className="story-return-link clickable-text" to={returnTo} aria-label="Back to Series"><ArrowLeft size={16} aria-hidden="true" />Series</Link>
   <div className="story-title-row"><h1><a href={series.normalizedUrl} target="_blank" rel="noreferrer">{series.title}</a></h1>
    <p className="story-details-authors">By <AuthorNames metadata={{ authors: series.creators ?? [], author_links: series.creatorLinks }} /></p>{favorite}
    <div className="story-metadata-actions"><button className="button secondary" disabled={busy || sampleMode} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" />{busy ? 'Loading series…' : series.detailsLoaded ? 'Refresh' : 'Load series details'}</button></div>
   </div>
   <p className="details-fandom-rating">{series.fandoms.join(' · ') || 'Fandom unknown'}</p>
   <dl className="details-story-stats"><div><dt>Word count</dt><dd><strong>{series.wordCount?.toLocaleString() ?? '?'}</strong> words</dd></div><div><dt>Publication Status</dt><dd><strong>{seriesCompletionLabel(series)}</strong></dd></div><div><dt>Date Updated</dt><dd><strong>{ao3Date(series.updated)}</strong></dd></div><div><dt>Works</dt><dd> <strong>{series.savedStories.length}</strong> in your library · <strong>{series.workCount ?? '?'}</strong> works total</dd></div></dl>
  </div></div>
  <section className="settings-card details-progress-panel" aria-label="Reading and organization"><div className="series-progress-controls"><div className="series-progress-columns"><div className="series-progress-state"><div className="story-section-heading"><h2>Your progress</h2></div><div className="series-progress-row"><p className="series-reading-status reading-status-value"><StatusIcon size={18} aria-hidden="true" />{seriesReadingLabel(series)}</p>{finishButton}</div></div>{collectionsField}</div><div className="series-import-actions"><button className="button secondary" disabled={busy || sampleMode} onClick={() => setReview(!review)}>Choose Works to Import</button></div></div></section>
  {error && <p className="error-message" role="alert">{error}</p>}
  <section className="details-private-notes" aria-label="Private notes"><PersonalNote key={seriesId} notes={record?.notes ?? ''} disabled={!record && !details} onSave={(notes, base) => saveSeriesNote(seriesId, notes, base)} onRefresh={() => refreshSeries(seriesId)} /></section>
  {review && <SeriesImportReview key={seriesId} text={series.normalizedUrl} savedIds={new Set(library.stories.flatMap(story => story.work.ao3_work_id ? [story.work.ao3_work_id] : []))} initialPreviews={details ? [details] : []} autoLoad busy={busy} onConfirm={async (works, status, seriesIds) => {
   setBusy(true); setError('')
   try { const batch = await submitImport(works.map(work => work.url).join('\n'), false, status, seriesIds); if (batch) { const history = await importHistory(batch, {historyPage:1,resultPage:1,status:'all'}); await library.refresh((history.changes ?? history.items).flatMap(item => item.entry_id ? [item.entry_id] : [])) }; await refreshSeries(seriesId); setReview(false) } catch (error) { setError(error instanceof Error ? error.message : 'Could not import selected works.') } finally { setBusy(false) }
  }} onCancel={() => setReview(false)} />}
  <section aria-label="Works in series"><h2>Works in this series</h2><div className="story-grid">{series.works.map(work => {
   const saved = series.savedStories.find(story => story.work.ao3_work_id === work.workId)
   return saved ? <StoryCard key={work.workId} story={saved} /> : <article className="story-card" key={work.workId}><h2><a href={work.url} target="_blank" rel="noreferrer">{work.position ? `Part ${work.position}: ` : ''}{work.title}</a></h2><p className="authors">By <AuthorNames metadata={{ authors: work.authors }} /></p><p className="muted">{work.fandoms?.join(' · ') || 'Fandom unknown'}</p><p className="story-facts">{work.wordCount?.toLocaleString() ?? '?'} words · {work.chapters || 'Chapters unknown'}</p>{work.summary && <p className="story-summary">{work.summary}</p>}<Link className="story-details-link clickable-text" to="/add" state={{ workUrl: work.url }}>Add to Library</Link></article>
  })}</div>{!series.works.length && <p>{busy ? 'Loading the series work list…' : 'No available works saved for this series.'}</p>}</section>
  <section className="settings-card details-fic-panel" aria-label="Series information"><dl className="metadata-list details-fic-fields">
   <div><dt>Series Begun</dt><dd>{series.begun || 'Unknown'}</dd></div>
   {series.description && <div><dt>Description</dt><dd className="story-summary story-details-summary">{series.description}</dd></div>}
   {series.creatorNotes && <div><dt>Creator Notes</dt><dd className="story-summary">{series.creatorNotes}</dd></div>}
   <div><dt>Saved</dt><dd>{record ? new Date(record.created_at).toLocaleString() : 'Not saved yet'}</dd></div>
   <div><dt>Last edited</dt><dd>{record ? new Date(record.updated_at).toLocaleString() : 'Not saved yet'}</dd></div>
  </dl></section>
 </div>}</SeriesControls></LibraryBoundary>
}
