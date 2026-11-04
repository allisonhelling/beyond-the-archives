import type { EditValues } from '../library/edit-merge'
import { readerBaseUrl } from '../../lib/reader-connection'
import { readerWorkIdentities } from '../../lib/reader-work-identities'
import { blankMetadata, statuses, savedWorkIdentity, type Collection, type Metadata, type Status, type Story } from '../library/model'

export type ReaderReport = { id: string; name: string; url: string; reportedAt: string; works: string[] }
export type CloudReaderBook = { workIds?: string[]; workCount?: number; favorite?: boolean; rec?: boolean; id: string; workId: string | null; metadata: Metadata; status: Status; notes: string; completedCount: number; createdAt?: string; updatedAt?: string }
export type OfflineMarking = { id: string; book?: string; entry?: string; base?: EditValues; field: 'favorite' | 'rec'; value: boolean }
export type OfflineSnapshot = { collections?: Collection[]; pendingMarkings?: OfflineMarking[]; cloudBooks?: CloudReaderBook[]; connected?: boolean; userId: string; savedAt: string; readers: ReaderReport[]; stories: Story[] }
const key = 'bta:offline-hub:v1'
export const offlineCleared = 'bta:offline-cleared'
export function readOfflineSnapshot(): OfflineSnapshot | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as OfflineSnapshot | null
    if (value && typeof value.userId === 'string' && Array.isArray(value.readers) && Array.isArray(value.stories)) return value
  } catch { /* An unavailable cache must not prevent sign-in. */ }
}
export function saveOfflineSnapshot(snapshot: OfflineSnapshot) { localStorage.setItem(key, JSON.stringify(snapshot)) }
export function clearOfflineSnapshot() { localStorage.removeItem(key); window.dispatchEvent(new Event(offlineCleared)) }
export function readerWorkUrl(readerUrl: string, work: string | number, parameter: 'work' | 'book' = 'work', chapter?: number): string {
  const url = readerBaseUrl(readerUrl)
  url.searchParams.set(parameter, String(work))
  if (chapter !== undefined && Number.isSafeInteger(chapter) && chapter > 0) url.searchParams.set('chapter', String(chapter))
  return url.href
}

/** Prefer organizer data for linked works; reader-only cloud works stay read-only. */
export function offlineStories(snapshot?: OfflineSnapshot): Story[] {
  if (!snapshot) return []
  const cloudBooks = [...(snapshot.cloudBooks ?? [])].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const available = new Set([...snapshot.readers.flatMap(reader => reader.works), ...cloudBooks.flatMap(readerWorkIdentities)])
  const stories = snapshot.stories.filter(story => available.has(String(story.work.ao3_work_id)))
  const seen = new Set(stories.map(story => String(story.work.ao3_work_id)))
  for (const book of cloudBooks) {
    const members = readerWorkIdentities(book)
    if ((book.workCount ?? 0) > 1 && members.length === book.workCount && members.every(id => seen.has(id))) continue
    const workId = (book.workCount ?? 0) > 1 ? null : savedWorkIdentity(book), key = workId ?? book.id
    if (seen.has(key)) continue
    seen.add(key)
    const id = `reader-cloud-${book.id}`, url = workId ? `https://archiveofourown.org/works/${workId}` : ''
    const created = book.createdAt ?? snapshot.savedAt, updated = book.updatedAt ?? created
    const metadata = { ...blankMetadata, ...book.metadata }
    stories.push({
      id, user_id: snapshot.userId, work_id: id, original_url: url, detailsLoaded: true,
      metadata, collectionIds: [], personalTags: [], reading_status: book.status in statuses ? book.status : 'to_read',
      last_read_chapter: book.completedCount, notes: book.notes, personal_rating: null, is_favorite: Boolean(book.favorite), is_rec: Boolean(book.rec),
      metadata_overrides: {}, extension_metadata: {}, extension_chapters: {}, started_at: null, finished_at: null,
      last_update_notification_at: null, update_dismissed_at: null, created_at: created, updated_at: updated,
      work: { id, ao3_work_id: workId ? Number(workId) : null, canonical_url: url, canonical_verified_at: null,
        title: metadata.title, summary: metadata.summary, rating: metadata.rating, language: null, word_count: metadata.word_count,
        published_chapters: metadata.published_chapters, total_chapters: metadata.total_chapters, is_complete: metadata.publication_status === 'complete' ? true : metadata.publication_status === 'in_progress' ? false : null,
        ao3_published_at: null, ao3_updated_at: null, last_metadata_check: null, last_metadata_success: null,
        metadata_source: 'manual', field_provenance: {}, automatic_metadata: {}, verified_chapters: {}, created_at: created, updated_at: updated },
    })
  }
  return stories
}
