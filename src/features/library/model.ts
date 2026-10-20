import { parseWorkUrl } from '../imports/urls'
import type { Database, Json } from '../../types/database'
export type Status = Database['public']['Enums']['reading_status']
export const statuses: Record<Status, string> = { to_read: 'To Read', reading: 'Reading', waiting_for_updates: 'Waiting for Updates', re_reading: 'Re-reading', finished: 'Finished', did_not_finish: 'Did Not Finish' }
export const ratings = ['General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated']
export type Metadata = { one_shot?: boolean; manual_url?: string; author_links?: Record<string, string>; series?: string[]; series_memberships?: { id: number; name: string; url: string; position: number | null }[]; archive_warnings?: string[]; categories?: string[]; relationship_tags?: string[]; character_tags?: string[]; additional_tags?: string[]; title: string; authors: string[]; fandoms: string[]; ao3_tags: string[]; summary: string; rating: string; publication_status: 'unknown' | 'in_progress' | 'complete' | 'abandoned'; published_chapters: number | null; total_chapters: number | null; word_count: number | null }
export type Entry = Database['public']['Tables']['library_entries']['Row']
export type Work = Database['public']['Tables']['works']['Row']
export type Collection = Database['public']['Tables']['collections']['Row']
export type Story = Entry & { work: Work; metadata: Metadata; collectionIds: string[]; personalTags: string[] }
export const blankMetadata: Metadata = { title: '', authors: [], fandoms: [], ao3_tags: [], summary: '', rating: '', publication_status: 'unknown', published_chapters: null, total_chapters: null, word_count: null }
/** Manual corrections take precedence; automatic labels follow current metadata and tags. */
export function isOneShot(metadata: Metadata, personalTags: string[] = []): boolean {
  if (typeof metadata.one_shot === 'boolean') return metadata.one_shot
  return metadata.publication_status === 'complete' && metadata.published_chapters === 1
    || [...metadata.ao3_tags, ...(metadata.additional_tags ?? []), ...personalTags].some(tag => /^one[- ]?shot$/i.test(tag.trim()))
}
export function authorPageUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\/(?:www\.)?archiveofourown\.org\/users\/[^/?#\s]+(?:\/pseuds\/[^/?#\s]+)?(?:\/(?:profile|works))?\/?(?:[?#][^\s]*)?$/.test(value.trim()) ? value.trim() : null
}
export { parseWorkUrl }
export function initialProgress(url: string, verifiedChapters: Record<string, string> = {}) {
  const parsed = parseWorkUrl(url)
  const position = parsed.chapterId ? Number(Object.keys(verifiedChapters).find(key => verifiedChapters[key] === parsed.chapterId)) : 1
  const verified = Number.isInteger(position) && position > 0
  return { status: (verified && position > 1 ? 'reading' : 'to_read') as Status, lastRead: verified ? position - 1 : 0, chapterVerified: verified }
}
export function abandonedReadingStatus(status: Status, progress: number, metadata: Metadata): Status {
  return metadata.publication_status === 'abandoned' && metadata.published_chapters !== null && metadata.published_chapters > 0 && progress >= metadata.published_chapters ? 'finished' : status
}
export function nextUnread(lastRead: number) { return lastRead + 1 }
export function validateProgress(value: number, metadata: Metadata) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new Error('Chapters read must be a non-negative whole number.')
  if ((metadata.published_chapters !== null && value > metadata.published_chapters) || (metadata.total_chapters !== null && value > metadata.total_chapters)) throw new Error('Progress cannot exceed the known chapter count.')
  return value
}
export function chapterUrl(story: Story, position = nextUnread(story.last_read_chapter)) {
  const map = story.work.verified_chapters as Record<string, Json>
  const chapter = map?.[String(position)]
  return typeof chapter === 'string' && /^[1-9]\d*$/.test(chapter) ? `https://archiveofourown.org/works/${story.work.ao3_work_id}/chapters/${chapter}` : null
}
export function active(story: Story) { return ['reading', 'waiting_for_updates', 're_reading'].includes(story.reading_status) }
export function effectiveMetadata(work: Work, overrides: Json, tags: Pick<Database['public']['Tables']['tags']['Row'], 'name' | 'category'>[] = [], authors: { name: string; ao3_url: string | null }[] = [], fandoms: {name: string}[] = []): Metadata {
  const manual = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {}
  return { ...blankMetadata, authors: authors.map(a => a.name), author_links: Object.fromEntries(authors.filter(a => a.ao3_url).map(a => [a.name, a.ao3_url!])), fandoms: fandoms.map(f => f.name), title: work.title ?? `AO3 work ${work.ao3_work_id}`, summary: work.summary ?? '', rating: work.rating ?? '', word_count: work.word_count, published_chapters: work.published_chapters, total_chapters: work.total_chapters, publication_status: work.is_complete === null ? 'unknown' : work.is_complete ? 'complete' : 'in_progress', archive_warnings: tags.filter(tag => tag.category === 'warning').map(tag => tag.name), categories: tags.filter(tag => tag.category === 'category').map(tag => tag.name), ao3_tags: tags.map(tag => tag.name), relationship_tags: tags.filter(tag => tag.category === 'relationship').map(tag => tag.name), character_tags: tags.filter(tag => tag.category === 'character').map(tag => tag.name), additional_tags: tags.filter(tag => tag.category === 'freeform').map(tag => tag.name), ...(work.automatic_metadata as Partial<Metadata>), ...manual } as Metadata
}
export type StoryInput = { url: string; metadata: Metadata; status: Status; progress: number; notes: string; personalRating: number | null; favorite: boolean; collections: string[]; tags: string[]; id?: string; metadataChanges?: Partial<Metadata>; base?: import('./edit-merge').EditValues }

export function savedWorkUrl(story: Story) {
  try {
    const url = story.metadata.manual_url
    if (typeof url === 'string' && parseWorkUrl(url).workId === story.work.ao3_work_id) return url
  } catch { /* Invalid legacy overrides cannot become clickable destinations. */ }
  return story.original_url
}

export function tagNames(metadata: Metadata, category: 'relationship' | 'character' | 'freeform'): string[] {
  const key = { relationship: 'relationship_tags', character: 'character_tags', freeform: 'additional_tags' } as const
  const values = metadata[key[category]]
  return Array.isArray(values) ? values.filter(value => typeof value === 'string') : []
}

// Multiline metadata and personal tags share trimming and stable deduplication.
export function parseLines(text: string): string[] {
  return [...new Set(text.split('\n').map(value => value.trim()).filter(Boolean))]
}

/** Editing personal fields must not turn automatic metadata into manual overrides. */
export function changedMetadata(current: Metadata, next: Metadata): Partial<Metadata> {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key as keyof Metadata])))
}

/** AO3 dates are calendar dates; avoid shifting them into the reader's timezone. */
export function isCalendarDate(value: string): boolean {
 return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
/** Preserve incomplete filter edits while displaying calendar values as dd-mm-yyyy. */
export function filterDateText(value: string): string {
 return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('-') : value
}
const ao3DateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
export function ao3Date(value: string | null | undefined): string {
 const date = value?.slice(0, 10)
 return date && isCalendarDate(date) ? ao3DateFormat.formatToParts(new Date(date)).map(part => part.type === 'month' ? part.value.slice(0, 3) : part.value).join('') : 'Unknown'
}
