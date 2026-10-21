import type { Database } from '../../types/database'
import type { SeriesPreview } from '../imports/urls'
import { active, blankMetadata, type Metadata, type Status, type Story } from './model'

export type SeriesRecord = Database['public']['Tables']['library_series']['Row'] & { collectionIds?: string[]; detailsLoaded?: boolean }
export type LibrarySeries = SeriesPreview & { record?: SeriesRecord; savedStories: Story[]; fandoms: string[]; detailsLoaded: boolean }
export function seriesMemberships(story: Pick<Story, 'metadata'>) {
 const valid = (story.metadata.series_memberships ?? []).filter(series => Number.isSafeInteger(series.id) && series.id > 0 && series.url === `https://archiveofourown.org/series/${series.id}`)
 return [...new Map(valid.map(series => [series.id, series])).values()]
}
export function inSeries(story: Story) { return seriesMemberships(story).length > 0 || Boolean(story.metadata.series?.some(name => name.trim())) }
export function librarySeries(stories: Story[], records: SeriesRecord[] = []): LibrarySeries[] {
 const storiesByAo3Id = new Map(stories.map(story => [story.work.ao3_work_id, story]))
 const groups = new Map<number, { title: string; stories: Story[]; record?: SeriesRecord }>()
 for (const story of stories) for (const membership of seriesMemberships(story)) {
  const group = groups.get(membership.id) ?? { title: membership.name, stories: [] }
  if (!group.stories.some(saved => saved.id === story.id)) group.stories.push(story)
  groups.set(membership.id, group)
 }
 for (const record of records) {
  const preview = record.metadata as unknown as SeriesPreview
  const ids = new Set(preview.works?.map(work => work.workId) ?? [])
  const saved = [...ids].flatMap(id => { const story = storiesByAo3Id.get(id); return story ? [story] : [] })
  const group = groups.get(record.ao3_series_id)
  if (group || saved.length || preview.basic === false || record.is_favorite || record.reading_status === 'finished' || record.collectionIds?.length || record.notes) groups.set(record.ao3_series_id, { title: preview.title, stories: [...new Map([...(group?.stories ?? []), ...saved].map(story => [story.id, story])).values()], record })
 }
 return [...groups].map(([seriesId, group]) => {
  const preview = group.record?.metadata as unknown as SeriesPreview | undefined
  const works = new Map((preview?.works ?? []).map(work => [work.workId, work]))
  for (const story of group.stories) {
   const id = story.work.ao3_work_id
   if (!id) continue
   const original = works.get(id)
   if (story.detailsLoaded === false && original) continue
   works.set(id, { ...original, workId: id, url: `https://archiveofourown.org/works/${id}`, position: seriesMemberships(story).find(series => series.id === seriesId)?.position ?? original?.position ?? null, title: story.metadata.title, authors: story.metadata.authors, rating: story.metadata.rating, relationshipTags: story.metadata.relationship_tags, characterTags: story.metadata.character_tags, additionalTags: story.metadata.additional_tags, updated: story.work.ao3_updated_at?.slice(0, 10) ?? original?.updated, fandoms: story.metadata.fandoms, summary: story.metadata.summary, tags: story.metadata.ao3_tags, wordCount: story.metadata.word_count, chapters: `${story.metadata.published_chapters ?? '?'}/${story.metadata.total_chapters ?? '?'}`, complete: story.metadata.publication_status === 'unknown' ? null : story.metadata.publication_status === 'complete' })
  }
  const list = [...works.values()].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
  const wordCount = preview && !preview.basic ? preview.wordCount : list.length && list.every(work => work.wordCount !== null) ? list.reduce((sum, work) => sum + (work.wordCount ?? 0), 0) : null
  return { ...preview, seriesId, normalizedUrl: `https://archiveofourown.org/series/${seriesId}`, title: preview?.title ?? group.title, description: preview?.description ?? '', wordCount, creators: preview?.creators ?? [...new Set(list.flatMap(work => work.authors))], works: list, record: group.record, savedStories: group.stories, fandoms: [...new Set(list.flatMap(work => work.fandoms ?? []))], detailsLoaded: Boolean(preview && !preview.basic) }
 }).sort((a, b) => a.title.localeCompare(b.title))
}

export function seriesCompletionLabel(series: Pick<LibrarySeries, 'complete'>) { return series.complete === true ? 'Complete' : series.complete === false ? 'Incomplete' : 'Completion unknown' }

/** Convert a listing preview to the same metadata fields used by saved fics. */
export function seriesWorkMetadata(work: SeriesPreview['works'][number], series: Pick<SeriesPreview, 'seriesId' | 'title' | 'normalizedUrl'>): Metadata {
 const chapters = work.chapters.match(/^(\d+)\/(\d+|\?)$/)
 return { ...blankMetadata, title: work.title, authors: work.authors, fandoms: work.fandoms ?? [], summary: work.summary, ao3_tags: work.tags, rating: work.rating ?? '', relationship_tags: work.relationshipTags ?? [], character_tags: work.characterTags ?? [], additional_tags: work.additionalTags ?? work.tags, published_chapters: chapters ? Number(chapters[1]) : null, total_chapters: chapters && chapters[2] !== '?' ? Number(chapters[2]) : null, word_count: work.wordCount, publication_status: work.complete === true ? 'complete' : work.complete === false ? 'in_progress' : 'unknown', series: [series.title], series_memberships: [{ id: series.seriesId, name: series.title, url: series.normalizedUrl, position: work.position }] }
}

/** Saved works drive reading state; an explicitly finished series can have no saved works. */
export function seriesReadingStatus(series: Pick<LibrarySeries, 'savedStories' | 'record'>): Status {
 const states = series.savedStories.map(story => story.reading_status ?? 'to_read')
 if (!states.length) return series.record?.reading_status === 'finished' ? 'finished' : 'to_read'
 if (states.every(status => status === 'to_read')) return 'to_read'
 if (series.savedStories.some(active)) return 'reading'
 if (states.every(status => status === 'finished')) return 'finished'
 if (states.every(status => status === 'did_not_finish')) return 'did_not_finish'
 return 'reading'
}
export function seriesReadingLabel(series: Pick<LibrarySeries, 'savedStories' | 'record'>) {
 const status = seriesReadingStatus(series)
 return status === 'reading' ? 'Currently Reading' : status === 'finished' ? 'Finished' : status === 'did_not_finish' ? 'Did Not Finish' : 'To Read'
}
