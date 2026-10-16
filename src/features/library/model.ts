import type { Database, Json } from '../../types/database'
export type Status = Database['public']['Enums']['reading_status']
export const statuses: Record<Status, string> = { to_read: 'To Read', reading: 'Reading', waiting_for_updates: 'Waiting for Updates', re_reading: 'Re-reading', finished: 'Finished', did_not_finish: 'Did Not Finish' }
export const ratings = ['General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated']
export type Metadata = { manual_url?: string; author_links?: Record<string, string>; series?: string[]; relationship_tags?: string[]; character_tags?: string[]; additional_tags?: string[]; title: string; authors: string[]; fandoms: string[]; ao3_tags: string[]; summary: string; rating: string; publication_status: 'unknown' | 'in_progress' | 'complete'; published_chapters: number | null; total_chapters: number | null; word_count: number | null }
export type Entry = Database['public']['Tables']['library_entries']['Row']
export type Work = Database['public']['Tables']['works']['Row']
export type Collection = Database['public']['Tables']['collections']['Row']
export type Story = Entry & { work: Work; metadata: Metadata; collectionIds: string[]; personalTags: string[] }
export const blankMetadata: Metadata = { title: '', authors: [], fandoms: [], ao3_tags: [], summary: '', rating: '', publication_status: 'unknown', published_chapters: null, total_chapters: null, word_count: null }
export function authorPageUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\/(?:www\.)?archiveofourown\.org\/users\/[^/?#\s]+(?:\/pseuds\/[^/?#\s]+)?(?:\/(?:profile|works))?\/?(?:[?#][^\s]*)?$/.test(value.trim()) ? value.trim() : null
}
export function parseWorkUrl(original: string) {
  const match = original.trim().match(/^https?:\/\/(?:www\.)?archiveofourown\.org\/works\/([1-9]\d*)(?:\/chapters\/([1-9]\d*))?\/?(?:[?#][^\s]*)?$/)
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error('Enter a supported AO3 work URL, such as https://archiveofourown.org/works/123.')
  return { workId: Number(match[1]), chapterId: match[2] ?? null, original }
}
export function initialProgress(url: string, verifiedChapters: Record<string, string> = {}) {
  const parsed = parseWorkUrl(url)
  const position = parsed.chapterId ? Number(Object.keys(verifiedChapters).find(key => verifiedChapters[key] === parsed.chapterId)) : 1
  const verified = Number.isInteger(position) && position > 0
  return { status: (verified && position > 1 ? 'reading' : 'to_read') as Status, lastRead: verified ? position - 1 : 0, chapterVerified: verified }
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
export function effectiveMetadata(work: Work, overrides: Json, tags: Pick<Database['public']['Tables']['tags']['Row'], 'name' | 'category'>[] = []): Metadata {
  const manual = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {}
  return { ...blankMetadata, title: work.title ?? '', summary: work.summary ?? '', rating: work.rating ?? '', word_count: work.word_count, published_chapters: work.published_chapters, total_chapters: work.total_chapters, publication_status: work.is_complete === null ? 'unknown' : work.is_complete ? 'complete' : 'in_progress', ao3_tags: tags.map(tag => tag.name), relationship_tags: tags.filter(tag => tag.category === 'relationship').map(tag => tag.name), character_tags: tags.filter(tag => tag.category === 'character').map(tag => tag.name), additional_tags: tags.filter(tag => tag.category === 'freeform').map(tag => tag.name), ...manual } as Metadata
}
export type StoryInput = { url: string; metadata: Metadata; status: Status; progress: number; notes: string; personalRating: number | null; favorite: boolean; collections: string[]; tags: string[]; id?: string }

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
