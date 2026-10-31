import { WorkTileTags } from '../WorkTileTags'
import { WorkSummary } from '../summaries/WorkSummary'
import { MetadataTags } from '../MetadataTags'
import { CustomCollectionNames } from '../collections/CustomCollectionNames'
import { StarRating } from '../StarRating'
import { ao3Date, blankMetadata } from '../model'
import { DisplayInfo } from '../display/DisplayInfo'
import { useContext, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Tooltip } from '../../../components/Tooltip'
import { AuthorNames } from '../AuthorNames'
import { SeriesControls } from './SeriesControls'
import { readingStatusIcons } from '../collections/collection-appearance'
import { publicationStatuses } from '../publication-status'
import { seriesCompletionLabel, seriesInformation, seriesKudosLabel, seriesReadingLabel, type LibrarySeries } from './series'

import { SeriesSummaryContext } from './series-summary-context'

/** Summaries and navigation for the works listed on each series card. */
export function SeriesWorkList({ series }: { series: LibrarySeries }) {
 const { expanded, revision } = useContext(SeriesSummaryContext)
 return <SeriesWorkSummaries key={revision} series={series} expanded={expanded} />
}
function SeriesWorkSummaries({ series, expanded }: { series: LibrarySeries; expanded: boolean }) {
 const [opened, setOpened] = useState<Set<number>>(() => new Set(expanded ? series.works.map(work => work.workId) : []))
 const location = useLocation()
 const savedById = new Map(series.savedStories.map(story => [story.work.ao3_work_id, story]))
 const works = series.works.flatMap(work => { const saved = savedById.get(work.workId); return saved ? [{ work, saved }] : [] })
 return <>
  <ol className="series-work-list">{works.map(({ work, saved }) => {
   const Icon = readingStatusIcons[saved.reading_status]
   return <li key={work.workId}><details open={opened.has(work.workId)} onToggle={event => { const open = event.currentTarget.open; setOpened(current => { if (current.has(work.workId) === open) return current; const next = new Set(current); if (open) next.add(work.workId); else next.delete(work.workId); return next }) }}>
    <summary><span className="series-work-title">{work.position ? `Part ${work.position}: ` : ''}{work.title}</span>{' '}<Tooltip description="View Saved Work">{id => <Link className="clickable-text series-work-link" to={`/stories/${saved.id}`} state={{ returnTo: location.pathname + location.search }} aria-label={`View Saved Work: ${work.title}`} aria-describedby={id} onClick={event => event.stopPropagation()}><Icon size={18} aria-hidden="true" /></Link>}</Tooltip></summary>
    {work.summary && <div className="story-summary"><WorkSummary metadata={work} /></div>}
   </details></li>
  })}</ol></>
}
export function SeriesCard({ series, linkId }: { series: LibrarySeries; linkId?: string }) {
 const location = useLocation()
 const origin = { returnTo: location.pathname + location.search }
 const readingLabel = seriesReadingLabel(series)
 const info = seriesInformation(series)
 const label = seriesCompletionLabel(series), Icon = publicationStatuses[series.complete === true ? 'complete' : series.complete === false ? 'in_progress' : 'unknown'].Icon
 return <article className="story-card series-card" data-story-id={`series:${series.seriesId}`}><SeriesControls series={series}>{({ actions }) => <>
  <div className="story-card-title"><h2><Link id={linkId} to={`/series/${series.seriesId}`} state={origin}>{series.title}</Link>{'\u00a0'}<Tooltip description={label}>{id => <span className="publication-icon" role="img" aria-label={label} aria-describedby={id} tabIndex={0}><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>}</Tooltip></h2>{actions}</div>
<DisplayInfo group="seriesTile">{{
category: <div className="story-facts">Category: <MetadataTags values={info.categories} /></div>,
authors: <> <p className="authors">By <AuthorNames metadata={{ authors: series.creators ?? [], author_links: series.creatorLinks }} /></p> </>,
fandoms: <>   <p className="work-fandoms">{series.fandoms.join(' · ') || 'Fandom unknown'}</p> </>,
reading: <span className="series-reading-status display-fact-value">{readingLabel === 'Finished' ? 'Finished Reading' : readingLabel}</span>,
count: <span className="display-fact-value">{series.savedStories.length} works</span>,
words: <span className="display-fact-value">{series.wordCount?.toLocaleString() ?? '?'} words</span>,
allTags: <WorkTileTags metadata={{...blankMetadata,relationship_tags:info.relationships,character_tags:info.characters,additional_tags:info.tags,archive_warnings:info.warnings,categories:info.categories}} />,
relationships: <div className="story-facts"><MetadataTags values={info.relationships} category="relationships" /></div>,
characters: <div className="story-facts"><MetadataTags values={info.characters} category="characters" /></div>,
tags: <div className="story-facts"><MetadataTags values={info.tags} /></div>,
warnings: <div className="story-facts"><MetadataTags values={info.warnings} category="warnings" /></div>,
personalRating: <div className="tile-personal-rating"><StarRating value={info.personalRating} /><span>{info.personalRating === null ? 'Unrated' : `${Number(info.personalRating.toFixed(2))}/5 average · ${info.ratedWorks} rated works`}</span></div>,
collections: <div className="story-facts"><CustomCollectionNames ids={series.record?.collectionIds ?? []} /></div>,
kudos: <span className="display-fact-value">{seriesKudosLabel(info)}</span>,
description: <> {series.description && <><hr className="story-summary-divider" /><p className="story-summary">{series.description}</p></>} </>,
notes: <>   {series.record?.notes && <p className="story-summary">{series.record.notes}</p>} </>,
creatorNotes: <p className="story-summary">{series.creatorNotes || 'No creator notes saved.'}</p>,
updated: <p className="story-facts">Updated: {ao3Date(series.updated)}</p>,
begun: <p className="story-facts">Series Begun: {ao3Date(series.begun)}</p>,
works: <>   <SeriesWorkList series={series} /> </>
}}</DisplayInfo>  <Link className="story-details-link clickable-text" to={`/series/${series.seriesId}`} state={origin}>View Series Details</Link>
 </>}</SeriesControls></article>
}
