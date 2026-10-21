import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Tooltip } from '../../components/Tooltip'
import { AuthorNames } from './AuthorNames'
import { SeriesControls } from './SeriesControls'
import { readingStatusIcons } from './collection-appearance'
import { publicationStatuses } from './publication-status'
import { seriesCompletionLabel, seriesReadingLabel, type LibrarySeries } from './series'

/** Summaries and navigation for the works listed on each series card. */
export function SeriesWorkList({ series }: { series: LibrarySeries }) {
 const [closed, setClosed] = useState<Set<number>>(new Set())
 const location = useLocation()
 const savedById = new Map(series.savedStories.map(story => [story.work.ao3_work_id, story]))
 const works = series.works.flatMap(work => { const saved = savedById.get(work.workId); return saved ? [{ work, saved }] : [] })
 const allExpanded = works.length > 0 && works.every(({ work }) => !closed.has(work.workId))
 return <><div className="form-actions series-summary-controls"><button className="text-button" type="button" disabled={!works.length} onClick={() => setClosed(allExpanded ? new Set(works.map(({ work }) => work.workId)) : new Set())}>{allExpanded ? 'Collapse All' : 'Expand All'}</button></div>
  <ol className="series-work-list">{works.map(({ work, saved }) => {
   const Icon = readingStatusIcons[saved.reading_status]
   return <li key={work.workId}><details open={!closed.has(work.workId)} onToggle={event => { const open = event.currentTarget.open; setClosed(current => { if (current.has(work.workId) === !open) return current; const next = new Set(current); if (open) next.delete(work.workId); else next.add(work.workId); return next }) }}>
    <summary><span className="series-work-title">{work.position ? `Part ${work.position}: ` : ''}{work.title}</span>{' '}<Tooltip description="View saved work">{id => <Link className="clickable-text series-work-link" to={`/stories/${saved.id}`} state={{ returnTo: location.pathname + location.search }} aria-label={`View saved work: ${work.title}`} aria-describedby={id} onClick={event => event.stopPropagation()}><Icon size={18} aria-hidden="true" /></Link>}</Tooltip></summary>
    {work.summary && <p className="story-summary">{work.summary}</p>}
   </details></li>
  })}</ol></>
}
export function SeriesCard({ series, linkId }: { series: LibrarySeries; linkId?: string }) {
 const location = useLocation()
 const origin = { returnTo: location.pathname + location.search }
 const readingLabel = seriesReadingLabel(series)
 const label = seriesCompletionLabel(series), Icon = publicationStatuses[series.complete === true ? 'complete' : series.complete === false ? 'in_progress' : 'unknown'].Icon
 return <article className="story-card series-card" data-story-id={`series:${series.seriesId}`}><SeriesControls series={series}>{({ actions }) => <>
  <div className="story-card-title"><h2><Link id={linkId} to={`/series/${series.seriesId}`} state={origin}>{series.title}</Link>{'\u00a0'}<Tooltip description={label}>{id => <span className="publication-icon" role="img" aria-label={label} aria-describedby={id} tabIndex={0}><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>}</Tooltip></h2>{actions}</div>
  <p className="authors">By <AuthorNames metadata={{ authors: series.creators ?? [], author_links: series.creatorLinks }} /></p>
  <p className="muted">{series.fandoms.join(' · ') || 'Fandom unknown'}</p>
  <p className="story-facts"><span className="series-reading-status">{readingLabel === 'Finished' ? 'Finished Reading' : readingLabel}</span> · {series.savedStories.length} works · {series.wordCount?.toLocaleString() ?? '?'} words</p>
  <hr className="story-summary-divider" />
  {series.description && <p className="story-summary">{series.description}</p>}
  {series.record?.notes && <p className="story-summary">{series.record.notes}</p>}
  <SeriesWorkList series={series} />
  <Link className="story-details-link clickable-text" to={`/series/${series.seriesId}`} state={origin}>View series details</Link>
 </>}</SeriesControls></article>
}
