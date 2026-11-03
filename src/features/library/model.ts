import { normalizeSearchText } from '../../lib/search-text'
import { parseWorkUrl, waybackSnapshot } from '../imports/urls'
import type { Database, Json } from '../../types/database'
export type Status = Database['public']['Enums']['reading_status']
export const statuses: Record<Status, string> = { to_read: 'To Read', reading: 'Reading', paused_reading: 'Paused Reading', waiting_for_updates: 'Waiting for Updates', re_reading: 'Re-Reading', finished: 'Finished', did_not_finish: 'Did Not Finish' }
export const ratings = ['General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated']
export function ratingLabel(rating: string): string { return /^teen and up audiences$/i.test(rating) ? 'Teen and Up' : rating }
export type Metadata = { bookfusion_link?: { url: string; kind: 'book' | 'bookmark' } | null; language?: string; kudos?: number | null; bookmark_count?: number | null; comment_count?: number | null; hits?: number | null; one_shot?: boolean; manual_url?: string; author_links?: Record<string, string>; series?: string[]; series_memberships?: { id: number; name: string; url: string; position: number | null }[]; archive_warnings?: string[]; categories?: string[]; relationship_tags?: string[]; character_tags?: string[]; additional_tags?: string[]; title: string; authors: string[]; fandoms: string[]; ao3_tags: string[]; summary: string; summary_html?: string; rating: string; publication_status: 'unknown' | 'in_progress' | 'complete' | 'hiatus' | 'abandoned' | 'deleted'; published_chapters: number | null; total_chapters: number | null; word_count: number | null }
type EntryRow = Database['public']['Tables']['library_entries']['Row']
export type Entry = Omit<EntryRow, 'work_status' | 'source_bookmark' | 'dnf_since' | 'reading_provenance'> & Partial<Pick<EntryRow, 'work_status' | 'source_bookmark' | 'dnf_since' | 'reading_provenance'>>
export type Work = Database['public']['Tables']['works']['Row']
export type Collection = Omit<Database['public']['Tables']['collections']['Row'], 'automatic_rules'> & { automatic_rules?: Json | null }
export type Story = Omit<Entry, 'reading_history'> & { reading_history?: import('./reading-history').ReadingEvent[]; automaticCollectionIds?: string[]; personalRatings?: (number | null)[]; detailsLoaded?: boolean; work: Work; metadata: Metadata; collectionIds: string[]; personalTags: string[] }
/** Overlay account-specific source data before resolving manual corrections. */
export function effectiveWork(sharedWork: Work, entry: Pick<Entry, 'extension_metadata' | 'extension_chapters' | 'source_bookmark' | 'work_status'>): Work {
  const browser = entry.extension_metadata && typeof entry.extension_metadata === 'object' && !Array.isArray(entry.extension_metadata) ? entry.extension_metadata : {}
  const fields = Object.fromEntries(Object.entries(browser).filter(([key]) => ['title','summary','rating','word_count','published_chapters','total_chapters','is_complete','ao3_published_at','ao3_updated_at','last_metadata_check','last_metadata_success'].includes(key)))
  return { ...sharedWork, title: sharedWork.title ?? (sharedWork.ao3_work_id === null || entry.work_status === 'deleted' ? deletedWorkTitle(entry) : null), ...fields, automatic_metadata: { ...(sharedWork.automatic_metadata as object), ...browser }, verified_chapters: entry.extension_chapters && Object.keys(entry.extension_chapters).length ? entry.extension_chapters : sharedWork.verified_chapters } as Work
}
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
export function isCrossover(metadata: Pick<Metadata, 'fandoms'>): boolean {
  return new Set(metadata.fandoms.map(value => normalizeSearchText(value.trim())).filter(Boolean)).size > 1
}

/** Status after reading all currently published chapters, shared by the app and companions. */
export function caughtUpReadingStatus(status: Status, metadata: Pick<Metadata, 'publication_status'>): Status {
  return ['complete', 'deleted'].includes(metadata.publication_status) ? 'finished' : ['in_progress', 'hiatus'].includes(metadata.publication_status) ? 'waiting_for_updates' : status
}
export function abandonedReadingStatus(status: Status, progress: number, metadata: Metadata): Status {
  return metadata.publication_status === 'abandoned' && metadata.published_chapters !== null && metadata.published_chapters > 0 && progress >= metadata.published_chapters ? 'finished' : status
}
/** Normalize caught-up active reads without changing paused or manually finished works. */
export function normalizeReadingStatus(status: Status, progress: number, metadata: Metadata): Status {
  if (['reading', 're_reading'].includes(status) && ['in_progress', 'hiatus'].includes(metadata.publication_status)
    && metadata.published_chapters !== null && metadata.published_chapters > 0 && progress >= metadata.published_chapters) return 'waiting_for_updates'
  return abandonedReadingStatus(status, progress, metadata)
}
/** Explicit footer progress edits update both reading fields in one checked save. */
export function progressReadingStatus(progress: number, metadata: Metadata, currentStatus?: Status): Status {
  validateProgress(progress, metadata)
  if (progress === 0) return currentStatus === 're_reading' ? 're_reading' : 'to_read'
  const published = metadata.published_chapters ?? (metadata.publication_status === 'complete' ? metadata.total_chapters : null)
  const reading = currentStatus === 're_reading' ? 're_reading' : 'reading'
  const status = published !== null && progress >= published ? caughtUpReadingStatus(reading, metadata) : reading
  return abandonedReadingStatus(status, progress, metadata)
}
export function nextUnread(lastRead: number) { return lastRead + 1 }
export function validateProgress(value: number, metadata: Metadata) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new Error('Chapters read must be a non-negative whole number.')
  if ((metadata.published_chapters !== null && value > metadata.published_chapters) || (metadata.total_chapters !== null && value > metadata.total_chapters)) throw new Error('Progress cannot exceed the known chapter count.')
  return value
}
export function readChapter(story: Pick<Story, 'reading_status' | 'last_read_chapter'>) {
  return story.reading_status === 'finished' ? 1 : nextUnread(story.last_read_chapter)
}
export function chapterUrl(story: Story, position = readChapter(story)) {
  // A verified AO3 chapter ID does not prove that Wayback captured that URL.
  if (story.original_url && waybackSnapshot(savedWorkUrl(story))) return null
  const map = story.work.verified_chapters as Record<string, Json>
  const chapter = map?.[String(position)]
  return typeof chapter === 'string' && /^[1-9]\d*$/.test(chapter) ? `https://archiveofourown.org/works/${story.work.ao3_work_id}/chapters/${chapter}` : null
}
export function active(story: Story) { return ['reading', 'waiting_for_updates', 're_reading'].includes(story.reading_status) }
export function effectiveMetadata(work: Work, overrides: Json, tags: Pick<Database['public']['Tables']['tags']['Row'], 'name' | 'category'>[] = [], authors: { name: string; ao3_url: string | null }[] = [], fandoms: {name: string}[] = [], workStatus?: Entry['work_status']): Metadata {
  const manual = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {}
  return { ...blankMetadata, authors: authors.map(a => a.name), author_links: Object.fromEntries(authors.filter(a => a.ao3_url).map(a => [a.name, a.ao3_url!])), fandoms: fandoms.map(f => f.name), title: work.title ?? `AO3 Work ${work.ao3_work_id}`, summary: work.summary ?? '', rating: work.rating ?? '', word_count: work.word_count, published_chapters: work.published_chapters, total_chapters: work.total_chapters, publication_status: work.is_complete === null ? 'unknown' : work.is_complete ? 'complete' : 'in_progress', archive_warnings: tags.filter(tag => tag.category === 'warning').map(tag => tag.name), categories: tags.filter(tag => tag.category === 'category').map(tag => tag.name), ao3_tags: tags.map(tag => tag.name), relationship_tags: tags.filter(tag => tag.category === 'relationship').map(tag => tag.name), character_tags: tags.filter(tag => tag.category === 'character').map(tag => tag.name), additional_tags: tags.filter(tag => tag.category === 'freeform').map(tag => tag.name), ...(work.automatic_metadata as Partial<Metadata>), ...manual, ...(workStatus === 'deleted' ? { publication_status: 'deleted' } : {}) } as Metadata
}
export type StoryInput = { url: string; metadata: Metadata; status: Status; progress: number; notes: string; personalRating: number | null; favorite: boolean; rec?: boolean; collections: string[]; tags: string[]; id?: string; metadataChanges?: Partial<Metadata>; base?: import('./edit-merge').EditValues }

export function savedWorkUrl(story: Pick<Story, 'metadata' | 'original_url'> & { work: Pick<Work, 'ao3_work_id'> }) {
  try {
    const url = story.metadata.manual_url
    if (typeof url === 'string' && parseWorkUrl(url).workId === story.work.ao3_work_id) return url
  } catch { /* Invalid legacy overrides cannot become clickable destinations. */ }
  return story.original_url
}

/** A finished work without a first-chapter mapping opens the work, not the last saved chapter. */
export function readingUrl(story: Story) {
 const next=chapterUrl(story)
 if(next)return next
 const saved=savedWorkUrl(story)
 if(story.reading_status==='finished' && !waybackSnapshot(saved)) {
  try {return parseWorkUrl(saved).normalizedUrl} catch { /* Preserve legacy and archived destinations. */ }
 }
 return saved
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

export { ao3Date, filterDateText, isCalendarDate } from '../../lib/dates'

export type SourceBookmark = { id?: string; status?: string; date?: string; url?: string; user?: string; count?: number; rec?: boolean | null; notes?: string; tags?: string[] }
export function sourceBookmark(entry: Pick<Entry, 'source_bookmark'>): SourceBookmark {
 return entry.source_bookmark && typeof entry.source_bookmark === 'object' && !Array.isArray(entry.source_bookmark) ? entry.source_bookmark as SourceBookmark : {}
}
export function deletedWorkTitle(entry: Pick<Entry, 'source_bookmark'>) { return `Deleted Work — Bookmark #${sourceBookmark(entry).id ?? '?'}` }

/** Private/hidden bookmark icons do not expose the Rec checkbox value. */
export function bookmarkRec(entry: Pick<Entry, 'source_bookmark'>): boolean | null {
 const source = sourceBookmark(entry)
 if (typeof source.rec === 'boolean') return source.rec
 if (Object.hasOwn(source, 'rec')) return null
 const status = (source.status ?? '').split(/\s+/)
 return status.includes('rec') ? true : status.includes('public') && !status.some(value => ['private', 'hidden'].includes(value)) ? false : null
}

export function savedWorkIdentity(book: { workId: string | null; metadata: Metadata & { calibre_work_link?: string } }): string | null {
 if (book.workId && /^[1-9]\d*$/.test(book.workId) && Number.isSafeInteger(Number(book.workId))) return book.workId
 for (const link of [book.metadata.calibre_work_link, book.metadata.manual_url]) {
  if (link) try { return String(parseWorkUrl(link).workId) } catch { /* Unidentified and merged EPUBs stay unlinked. */ }
 }
 return null
}
