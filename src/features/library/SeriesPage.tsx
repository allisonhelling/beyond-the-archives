import { MetadataTags } from './MetadataTags'
import { DisplayInfo } from './DisplayInfo'
import { formatDateTime, formatDate } from '../../lib/dates'
import { browsingReturnTo } from './browsing'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useLibrary } from './LibraryProvider'
import { LibraryBoundary, StoryCard } from './LibraryPages'
import { readingStatusIcons } from './collection-appearance'
import { ao3Date } from './model'
import { AuthorNames } from './AuthorNames'
import { PersonalNote } from './PersonalNote'
import { librarySeries, seriesInformation, seriesKudosLabel, seriesReadingLabel, seriesReadingStatus, seriesCompletionLabel, type LibrarySeries } from './series'
import { SeriesControls } from './SeriesControls'
import { Dialog } from '../../components/Dialog'
import { Tooltip } from '../../components/Tooltip'
import { ensureSeries, rememberSeries, removeSeriesDetails, saveSeriesNote } from './series-repository'
import { importHistory, previewSeries, submitImport } from '../imports/repository'
import { SeriesImportReview } from '../imports/SeriesImportReview'
import { sampleMode } from '../../lib/sample-mode'
import type { SeriesPreview } from '../imports/urls'

export function SeriesPage({ example }: { example?: LibrarySeries } = {}) {
 const { id } = useParams(), library = useLibrary(), seriesId = example?.seriesId ?? Number(id)
 const valid = Boolean(example) || /^[1-9]\d*$/.test(id ?? '') && Number.isSafeInteger(seriesId)
 const { refreshSeries, loadDetails, retainDetails } = library
 const location = useLocation()
 const candidate = location.state?.returnTo
 const returnTo = browsingReturnTo(candidate, '/library?shelf=series')
 const record = example?.record ?? (library.series ?? []).find(record => record.ao3_series_id === seriesId)
 const [reviewBusy, setReviewBusy] = useState(false)
 const [hideUnsaved, setHideUnsaved] = useState(false)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [review, setReview] = useState(false)
 async function load() {
  setBusy(true); setError('')
  try { const next = await previewSeries(`https://archiveofourown.org/series/${seriesId}`); await rememberSeries(next); await refreshSeries(seriesId) }
  catch (error) { setError(error instanceof Error ? error.message : 'Could not load series details.') }
  finally { setBusy(false) }
 }
 const metadata = record?.metadata as unknown as SeriesPreview | undefined
 const details = metadata && !metadata.basic ? metadata : undefined
 useEffect(() => {
  if (!example && valid && record?.detailsLoaded === false) void refreshSeries(seriesId, false).catch(error => setError(error instanceof Error ? error.message : 'Could not load series details.'))
 }, [example, valid, record, refreshSeries, seriesId])
 const saved = example ?? librarySeries(library.stories, library.series ?? []).find(series => series.seriesId === seriesId)
 const series: LibrarySeries = saved ?? { ...details, seriesId, normalizedUrl: `https://archiveofourown.org/series/${seriesId}`, title: metadata?.title ?? `Series ${seriesId}`, description: details?.description ?? '', works: details?.works ?? [], savedStories: [], fandoms: [...new Set(details?.works.flatMap(work => work.fandoms ?? []) ?? [])], detailsLoaded: Boolean(details), record }
 const retained = example ? '' : series.savedStories.map(story => story.id).sort().join(',')
 useEffect(() => retained ? retainDetails(retained.split(',')) : undefined, [retained, retainDetails])
 const missing = example ? '' : series.savedStories.filter(story => story.detailsLoaded === false).map(story => story.id).sort().join(',')
 useEffect(() => { if (missing) void loadDetails(missing.split(',')).catch(() => {}) }, [missing, loadDetails])
 const savedById = new Map(series.savedStories.map(story => [story.work.ao3_work_id, story]))
 const visibleWorks = series.works.filter(work => !hideUnsaved || savedById.has(work.workId))
 const info = seriesInformation(series)
 const basic = !series.detailsLoaded
 const StatusIcon = readingStatusIcons[seriesReadingStatus(series)]
 const errorMessage = error && <p className="error-message" role="alert">{error}</p>
 if (!valid) return <p role="alert">This series identifier is invalid.</p>
 return <LibraryBoundary><SeriesControls series={series}>{({ favorite, collectionsField, finishButton }) => <div className="story-details-page series-details-page">
  <div className="page-heading story-details-heading"><div>
   <Link className="story-return-link clickable-text" to={returnTo} aria-label="Back to Series"><ArrowLeft size={16} aria-hidden="true" />Series</Link>
   <div className="story-title-row"><h1><a href={series.normalizedUrl} target="_blank" rel="noreferrer">{series.title}</a></h1>
    {favorite}
    <div className="story-metadata-actions"><Tooltip description={basic ? 'Load full series from AO3' : 'Refresh series info from AO3'}>{tooltipId => <button className="button secondary" aria-describedby={tooltipId} disabled={busy || sampleMode} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" />{busy ? 'Loading series…' : series.detailsLoaded ? 'Refresh' : 'Load'}</button>}</Tooltip>{!basic && <Tooltip description="Removes downloaded series details">{tooltipId => <button className="text-button clickable-text" aria-describedby={tooltipId} disabled={busy} onClick={async () => {
     setBusy(true); setError('')
     try { await removeSeriesDetails(seriesId); await refreshSeries(seriesId) } catch (error) { setError(error instanceof Error ? error.message : 'Could not remove series details.') } finally { setBusy(false) }
    }}>Remove</button>}</Tooltip>}</div>
   </div>
<DisplayInfo group="seriesHeader">{{
authors: <> <p className="story-details-authors">By <AuthorNames metadata={{ authors: series.creators ?? [], author_links: series.creatorLinks }} /></p> </>,
fandoms: <>    <p className="details-fandom-rating">{series.fandoms.join(' · ') || 'Fandom unknown'}</p>
 </>,
stats: <>    <dl className="details-story-stats"><DisplayInfo group="seriesStats">{{
words: <> <div><dt>{basic ? 'Words in your library' : 'Word count'}</dt><dd><strong>{series.wordCount?.toLocaleString() ?? '?'}</strong> words</dd></div> </>,
publication: <> <div><dt>Publication Status</dt><dd><strong>{seriesCompletionLabel(series)}</strong></dd></div> </>,
updated: <> <div><dt>AO3 Series Updated</dt><dd><strong>{ao3Date(series.updated)}</strong></dd></div> </>,
works: <> <div><dt>Works</dt><dd> <strong>{series.savedStories.length}</strong> in your library{!basic && <> · <strong>{series.workCount ?? '?'}</strong> works total</>}</dd></div> </>
}}</DisplayInfo></dl> </>,
source: <>
   <p className="field-help">{basic ? 'Basic series page · Built from works in your library. Full AO3 series details have not been downloaded.' : `Full series details saved · ${details?.fetchedAt ? `Last fetched ${formatDateTime(details.fetchedAt)}` : 'Fetch date unavailable'}. AO3 may hide unavailable or restricted works.`}</p> </>
}}</DisplayInfo>
  </div></div>

  {!review && errorMessage}

  {review && <Dialog title="Review series" className="series-review-dialog" busy={busy || reviewBusy} onClose={() => setReview(false)}>{errorMessage}<SeriesImportReview key={seriesId} text={series.normalizedUrl} savedIds={new Set(library.stories.flatMap(story => story.work.ao3_work_id ? [story.work.ao3_work_id] : []))} initialPreviews={details ? [details] : []} autoLoad busy={busy} onBusyChange={setReviewBusy} onConfirm={async (works, status, seriesIds) => {
   setBusy(true); setError('')
   try { const batch = await submitImport(works.map(work => work.url).join('\n'), false, status, seriesIds); if (batch) { const history = await importHistory(batch, {historyPage:1,resultPage:1,status:'all'}); await library.refresh((history.changes ?? history.items).flatMap(item => item.entry_id ? [item.entry_id] : [])) }; await refreshSeries(seriesId); setReview(false) } catch (error) { setError(error instanceof Error ? error.message : 'Could not import selected works.') } finally { setBusy(false) }
  }} onCancel={() => setReview(false)} /></Dialog>}
<DisplayInfo group="seriesPage">{{
description: <>   {(series.description || series.creatorNotes) && <section className="settings-card details-fic-panel" aria-label="Series description"><dl className="metadata-list details-fic-fields">
<DisplayInfo group="seriesDescription">{{
description: <>    {series.description && <div><dt>Description</dt><dd className="story-summary story-details-summary">{series.description}</dd></div>} </>,
creatorNotes: <>    {series.creatorNotes && <div><dt>Creator Notes</dt><dd className="story-summary">{series.creatorNotes}</dd></div>} </>
}}</DisplayInfo>
  </dl></section>} </>,
progress: <>
  <section className="settings-card details-progress-panel" aria-label="Reading and organization"><div className="series-progress-controls"><div className="series-progress-columns"><div className="series-progress-state"><div className="story-section-heading"><h2>Your progress</h2></div><div className="series-progress-row"><p className="series-reading-status reading-status-value"><StatusIcon size={18} aria-hidden="true" />{seriesReadingLabel(series)}</p>{finishButton}</div></div>{collectionsField}</div><div className="series-import-actions">{!basic && series.savedStories.length !== series.workCount && <button className="button secondary" aria-pressed={hideUnsaved} onClick={() => setHideUnsaved(!hideUnsaved)}>{hideUnsaved ? 'Show Works Not in Library' : 'Hide Works Not in Library'}</button>}<button className="button secondary series-choose-works" disabled={busy || sampleMode} onClick={() => setReview(!review)}>Choose Works to Import</button></div></div></section> </>,
notes: <>   <section className="details-private-notes" aria-label="Private notes"><PersonalNote key={seriesId} notes={record?.notes ?? ''} disabled={busy} onSave={async (notes, base) => { await ensureSeries(series); await saveSeriesNote(seriesId, notes, base) }} onRefresh={() => refreshSeries(seriesId)} /></section> </>,
works: <>   <section aria-label="Works in series"><h2>{basic ? 'Works in your library' : 'Works in this series'}</h2><div className="story-grid">{visibleWorks.map(work => {
   const saved = savedById.get(work.workId)
   return saved ? <StoryCard key={work.workId} story={saved} /> : <article className="story-card" key={work.workId}><h2><a href={work.url} target="_blank" rel="noreferrer">{work.position ? `Part ${work.position}: ` : ''}{work.title}</a></h2><DisplayInfo group="workTile">{{
    authors: <p className="authors">By <AuthorNames metadata={{ authors: work.authors }} /></p>,
    fandoms: <p className="muted">{work.fandoms?.join(' · ') || 'Fandom unknown'}</p>,
    words: <span className="display-fact-value">{work.wordCount?.toLocaleString() ?? '?'} words</span>,
    chapters: <span className="display-fact-value">{work.chapters || 'Chapters unknown'}</span>,
    summary: work.summary && <p className="story-summary">{work.summary}</p>,
  }}</DisplayInfo><Link className="story-details-link clickable-text" to="/add" state={{ workUrl: work.url }}>Add to Library</Link></article>
  })}</div>{!visibleWorks.length && <p>{busy ? 'Loading the series work list…' : hideUnsaved ? 'No works from this series are in your library.' : 'No available works saved for this series.'}</p>}</section> </>,
information: <>
  <section className="settings-card details-fic-panel" aria-label="Series information"><dl className="metadata-list details-fic-fields">
<DisplayInfo group="seriesInfo">{{
libraryCount: <div><dt>Works in Library</dt><dd>{series.savedStories.length}</dd></div>,
words: <div><dt>Word Count</dt><dd>{series.wordCount?.toLocaleString() ?? '?'} words</dd></div>,
relationships: <div><dt>Relationships</dt><dd><MetadataTags values={info.relationships} category="relationships" /></dd></div>,
characters: <div><dt>Characters</dt><dd><MetadataTags values={info.characters} category="characters" /></dd></div>,
tags: <div><dt>Additional Tags</dt><dd><MetadataTags values={info.tags} /></dd></div>,
warnings: <div><dt>AO3 Warnings</dt><dd><MetadataTags values={info.warnings} category="warnings" /></dd></div>,
kudos: <div><dt>AO3 Kudos</dt><dd>{seriesKudosLabel(info)}</dd></div>,
begun: <>    <div><dt>Series Begun</dt><dd>{formatDate(series.begun)}</dd></div> </>,
saved: <>    <div><dt>Saved</dt><dd>{record ? formatDateTime(record.created_at) : 'Not saved yet'}</dd></div> </>,
edited: <>    <div><dt>Last edited</dt><dd>{record ? formatDateTime(record.updated_at) : 'Not saved yet'}</dd></div> </>
}}</DisplayInfo>
  </dl></section> </>
}}</DisplayInfo>
 </div>}</SeriesControls></LibraryBoundary>
}
