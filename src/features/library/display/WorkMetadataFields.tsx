import type { ReactNode } from 'react'
import { ao3Date, ratingLabel, savedWorkUrl, tagNames, type Story } from '../model'
import { AuthorNames } from '../AuthorNames'
import { SeriesNames } from '../series/SeriesNames'
import { MetadataTags } from '../MetadataTags'
import { WorkSummary } from '../summaries/WorkSummary'
import { publicationStatuses } from '../publication-status'
import { ao3MetadataLabels } from './ao3-fields'

/** Use one set of metadata values for the real tiles and information-page previews. */
export function workMetadataFields(story: Pick<Story, 'metadata' | 'original_url'> & { work: Pick<Story['work'], 'ao3_work_id' | 'language' | 'ao3_published_at' | 'ao3_updated_at'> }, layout: 'tile' | 'info') {
  const { metadata, work } = story
  const count = (value: number | null | undefined) => value?.toLocaleString() ?? '?'
  const values: Record<keyof typeof ao3MetadataLabels, ReactNode> = {
    authors: <AuthorNames metadata={metadata} />, fandoms: metadata.fandoms.join(' · ') || 'Fandom unknown',
    series: metadata.series?.length ? <SeriesNames metadata={metadata} /> : 'None saved',
    rating: ratingLabel(metadata.rating) || 'Rating unknown', words: `${count(metadata.word_count)} words`,
    chapters: `${metadata.published_chapters ?? '?'} / ${metadata.total_chapters ?? '?'} chapters`,
    summary: <WorkSummary metadata={metadata} fallback={layout === 'info' ? 'No summary saved.' : ''} />,
    relationships: <MetadataTags values={tagNames(metadata, 'relationship')} category="relationships" />,
    characters: <MetadataTags values={tagNames(metadata, 'character')} category="characters" />,
    tags: <MetadataTags values={tagNames(metadata, 'freeform')} />,
    warnings: <MetadataTags values={metadata.archive_warnings ?? []} category="warnings" />,
    category: <MetadataTags values={metadata.categories ?? []} />,
    kudos: `${count(metadata.kudos)} kudos`, bookmarks: `${count(metadata.bookmark_count)} bookmarks`,
    comments: `${count(metadata.comment_count)} comments`, hits: `${count(metadata.hits)} hits`,
    published: ao3Date(work.ao3_published_at), updated: ao3Date(work.ao3_updated_at),
    language: metadata.language || work.language || 'Unknown', publication: publicationStatuses[metadata.publication_status].label,
    workId: work.ao3_work_id ?? 'Unknown', source: <a href={savedWorkUrl(story)} target="_blank" rel="noreferrer">View on AO3</a>,
    allTags: <MetadataTags values={metadata.ao3_tags} />,
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const label = ao3MetadataLabels[key as keyof typeof ao3MetadataLabels]
    if (layout === 'info') return [key, <div key={key}><dt className={key === 'allTags' ? 'sr-only' : undefined}>{label}</dt><dd className={key === 'summary' ? 'story-summary story-details-summary' : undefined}>{key === 'allTags' ? <details className="details-disclosure"><summary>All tags</summary>{value}</details> : value}</dd></div>]
    if (key === 'summary') return [key, <>{metadata.summary && <><hr className="story-summary-divider" /><div className="story-summary">{value}</div></>}</>]
    if (key === 'authors') return [key, <p className="authors">By {value}</p>]
    if (key === 'fandoms') return [key, <p className="muted">{value}</p>]
    if (key === 'series' && !metadata.series?.length) return [key, false]
    if (['relationships', 'characters', 'tags', 'warnings', 'category'].includes(key)) return [key, <div className="story-facts">{key === 'category' && 'Category: '}{value}</div>]
    return [key, <span className="display-fact-value">{['category', 'published', 'updated', 'language', 'workId', 'publication'].includes(key) && `${key === 'updated' ? 'Updated' : label}: `}{value}</span>]
  }))
}
