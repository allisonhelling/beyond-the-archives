import { isOneShot, type Story } from './model'
import { compileSearch, searchText, defaultReadingFilters, filterReading, normalize, type ReadingFilters } from './reading-search'
import { seriesReadingStatus, seriesWorkMetadata, type LibrarySeries } from './series'

export const seriesItemId = (series: LibrarySeries) => `series:${series.seriesId}`
/** Read-only search documents let series reuse the work toolbar and sorting. */
export function seriesSearchStory(series: LibrarySeries): Story {
 const sources = series.works.map(work => seriesWorkMetadata(work, series))
 const union = (values: string[][]) => [...new Set(values.flat())]
 const chapters = sources.every(source => source.published_chapters !== null) ? sources.reduce((sum, source) => sum + source.published_chapters!, 0) : null
 return {
  id: seriesItemId(series), created_at: series.record?.created_at ?? series.savedStories[0]?.created_at ?? '', updated_at: series.record?.updated_at ?? '', original_url: series.normalizedUrl,
  reading_status: seriesReadingStatus(series), last_read_chapter: series.savedStories.reduce((sum, story) => sum + story.last_read_chapter, 0),
  is_favorite: series.record?.is_favorite ?? false, notes: [series.record?.notes, ...series.savedStories.map(story => story.notes)].filter(Boolean).join('\n'), personalTags: union(series.savedStories.map(story => story.personalTags)), collectionIds: series.record?.collectionIds ?? [],
  work: { ao3_updated_at: series.updated ? `${series.updated}T00:00:00Z` : null, verified_chapters: {} },
  metadata: { title: series.title, authors: union([series.creators ?? [], ...sources.map(source => source.authors)]), fandoms: series.fandoms, summary: [series.description, series.creatorNotes, ...sources.map(source => source.summary)].filter(Boolean).join('\n'), ao3_tags: union(sources.map(source => source.ao3_tags)), relationship_tags: union(sources.map(source => source.relationship_tags ?? [])), character_tags: union(sources.map(source => source.character_tags ?? [])), additional_tags: union(sources.map(source => source.additional_tags ?? [])), rating: '', series: [series.title], publication_status: series.complete === true ? 'complete' : series.complete === false ? 'in_progress' : 'unknown', published_chapters: chapters, total_chapters: chapters, word_count: series.wordCount ?? null },
 } as Story
}
export function filterLibraryItems(pool: Story[], filters: ReadingFilters, series: LibrarySeries[]) {
 const byId = new Map(series.map(item => [seriesItemId(item), item]))
 const works = filterReading(pool.filter(story => !byId.has(story.id)), filters)
 const matches = pool.filter(story => {
  const item = byId.get(story.id)
  if (!item) return false
  const sources = item.works.map(work => seriesWorkMetadata(work, item))
  const query = normalize(filters.query.trim())
  if (query && !normalize([item.title, ...(item.creators ?? []), ...sources.flatMap(source => [source.title, ...source.authors])].join('\n')).includes(query)) return false
  if (filters.rating.length && !sources.some(source => filters.rating.includes(source.rating))) return false
  if (filters.oneShot !== 'allowed' && !sources.some(source => isOneShot(source) === (filters.oneShot === 'only'))) return false
  const withinText = searchText(story, filters.scope) + (filters.scope === 'any' ? '\n' + item.works.map(work => [work.title, work.url, work.rating, work.chapters, work.updated].join('\n')).join('\n') : '')
  if (!compileSearch(filters.within)(withinText)) return false
  return filterReading([story], { ...filters, query: '', rating: [], oneShot: 'allowed', within: '' }).length > 0
 })
 return filterReading([...works, ...matches], { ...defaultReadingFilters, sort: filters.sort })
}
