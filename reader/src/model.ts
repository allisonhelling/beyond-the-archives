import type { DisplayPreference, TagAppearance } from '../../src/features/library/display/display-settings'
import { caughtUpReadingStatus, type Metadata, type Status } from '../../src/features/library/model'
export { statuses, blankMetadata } from '../../src/features/library/model'
export type { Metadata, Status }
export type ReaderMetadata = Metadata & { calibre_work_link?: string; ao3_collections?: string[]; published_at?: string; updated_at?: string; packaged_at?: string; publisher?: string; language_code?: string }
export type Chapter = { kind?: 'frontmatter' | 'chapter'; id: string; ao3Id: string | null; number: number | null; title: string; html: string; words: number | null; path: string }
export type Remote = { favorite?: boolean; rec?: boolean; publication?: { metadata: Metadata; at: string }; id: string; version: string; status: Status; progress: number; notes: string; collections?: string[]; tags?: string[] }
export type ReadingPosition = { chapter: string; fraction: number; textOffset?: number; textTop?: number; viewport?: { layout: Preferences['layout']; content: Preferences['content']; size: number; width: number; widthPx: number; heightPx: number; scrollHeight: number; scrollWidth: number; scrollTop: number; scrollLeft: number } }
export function chapterNumber(chapter: ChapterSummary, chapters: ChapterSummary[]): number | null {
  if (chapter.kind === 'frontmatter') return null
  return chapter.number ?? (Number(chapter.title.match(/^Chapter\s+(\d+)(?:\b|:)/i)?.[1]) || chapters.slice(0, chapters.indexOf(chapter) + 1).filter(item => item.kind !== 'frontmatter').length)
}
export type Book = { favorite?: boolean; rec?: boolean; progress?: number; unavailableImages?: number; calibreId?: string; fileBytes?: number; id: string; workId: string | null; active: boolean; metadata: ReaderMetadata; metadataVersion?: number; chapterVersion?: number; chapters: Chapter[]; resources: Record<string, Blob>; file: Blob | null; importedAt: string; metadataAt: string; position: ReadingPosition; completed: string[]; history: { id: string; chapter: string; at: string; words: number | null; reread: boolean }[]; status: Status; notes: string; collections: string[]; remote?: Remote; account?: string; resumeRequired?: boolean }
export type ChapterSummary = Omit<Chapter, 'html'>
export type BookDetails = Omit<Book, 'file' | 'resources' | 'chapters'> & { hasFile: boolean; chapters: ChapterSummary[] }
export type BookContent = Pick<Book, 'id' | 'file' | 'resources' | 'chapters' | 'chapterVersion'>
export type CatalogBook = { organizerEntryId?: string } & Omit<BookDetails, 'chapters' | 'history' | 'completed' | 'notes' | 'remote' | 'position'> & { position: Pick<ReadingPosition, 'chapter' | 'fraction'>; chapterCount: number; wordCount: number; completedCount: number }
export function bookDetails(book: Book): BookDetails {
  const { file, resources: _resources, chapters, ...details } = book
  void _resources
  return { ...details, fileBytes: file?.size ?? details.fileBytes, hasFile: Boolean(file), chapters: chapters.map(({ html: _html, ...chapter }) => { void _html; return chapter }) }
}
/** Explicit numeric corrections can include chapters absent from an older EPUB. */
export function readerProgress(book: Pick<BookDetails, 'progress' | 'completed' | 'chapters'>): number {
  return Number.isSafeInteger(book.progress) && book.progress! >= 0 ? book.progress! : book.chapters.filter(chapter => chapter.kind !== 'frontmatter' && book.completed.includes(chapter.id)).length
}
export function catalogBook(book: BookDetails): CatalogBook {
  const { chapters, history: _history, completed: _completed, notes: _notes, remote: _remote, position, ...catalog } = book
  void _history; void _completed; void _notes; void _remote
  return { ...catalog, organizerEntryId: book.remote?.id, position: { chapter: position.chapter, fraction: position.fraction }, chapterCount: chapters.filter(chapter => chapter.kind !== 'frontmatter').length, wordCount: chapters.reduce((sum, chapter) => sum + (chapter.words ?? 0), 0), completedCount: readerProgress(book) }
}
export type Connection = { expiresAt?: string | null; backend: string; key: string; secret: string; account: string; label: string; name: string }
export type Pending = { id: string; book: string; work: string; account: string; base: Remote; input: Record<string, unknown>; action?: 'save' | 'progress'; error?: string }
export type Preferences = { tileLayouts?: Partial<Record<'mobile' | 'desktop', DisplayPreference>>; storageColumns?: string[]; storageSort?: { key: string; ascending: boolean }; content: 'chapter' | 'entire'; layout: 'scroll' | 'pages'; size: number; width: number; dark: boolean; chapterBar?: boolean; tagAppearance?: TagAppearance; tagSyncAccount?: string }
export const defaultTagAppearance: TagAppearance = { shape: 'filled', colors: {} }
export const readingRanges = {
  size: { label: 'Font Size', min: 14, max: 30, step: 0.01, initial: 17.28 },
  width: { label: 'Reading Width', min: 480, max: 1100, step: 20, initial: 1100 },
} as const
export const defaultPreferences: Preferences = { content: 'chapter', layout: 'scroll', size: readingRanges.size.initial, width: readingRanges.width.initial, dark: false }
export function mapChapter(chapter: ChapterSummary, chapters: ChapterSummary[]) {
  const matches = chapters.filter(next => next.id === chapter.id)
  return matches.length === 1 ? matches[0] : undefined
}
export function hasVerifiedMapping(chapter: ChapterSummary, chapters: ChapterSummary[]): boolean {
  return chapter.kind !== 'frontmatter' && Number.isSafeInteger(chapter.number) && chapter.number! > 0 &&
    Boolean(chapter.ao3Id && /^[1-9]\d*$/.test(chapter.ao3Id)) &&
    chapters.filter(other => other.kind !== 'frontmatter' && (other.number === chapter.number || other.ao3Id === chapter.ao3Id)).length === 1
}
export function completionStatus(book: BookDetails | Book): Status {
  const published = book.metadata.published_chapters
  if (!published || !['complete', 'in_progress', 'deleted'].includes(book.metadata.publication_status)) return book.status
  const mapped = new Map(book.chapters.filter(chapter => hasVerifiedMapping(chapter, book.chapters)).map(chapter => [chapter.number, chapter]))
  for (let n = 1; n <= published; n++) {
    const chapter = mapped.get(n)
    if (!chapter || !book.completed.includes(chapter.id)) return book.status === 'to_read' ? 'reading' : book.status
  }
  return caughtUpReadingStatus(book.status, book.metadata)
}
export function replaceBook<T extends BookDetails | Book>(previous: BookDetails | Book, next: T): T {
  const old = previous.chapters.find(c => c.id === previous.position.chapter)
  const mapped = old && mapChapter(old, next.chapters)
  // Re-importing an older EPUB must not discard a newer organizer observation.
  const publication = previous.remote?.publication
  const retainPublication = publication && (next.metadata.published_chapters ?? 0) <= (publication.metadata.published_chapters ?? 0)
  const metadata = retainPublication ? { ...next.metadata, publication_status: publication.metadata.publication_status, published_chapters: publication.metadata.published_chapters, total_chapters: publication.metadata.total_chapters } : next.metadata
  return { ...next, metadata, metadataAt: retainPublication ? publication.at : next.metadataAt, workId: previous.workId ?? next.workId, account: previous.account, remote: previous.remote, notes: previous.notes, collections: previous.collections, favorite: previous.favorite, rec: previous.rec, status: previous.status, progress: previous.progress, history: previous.history,
    completed: previous.completed.filter(id => next.chapters.some(c => c.id === id)), position: mapped ? { ...previous.position, chapter: mapped.id } : next.position, resumeRequired: !mapped }
}

export function withPublication<T extends BookDetails | Book>(book: T, remote?: Remote): T {
  const publication = remote?.publication
  if (!publication || Date.parse(publication.at) < Date.parse(book.metadataAt)) return book
  return { ...book, metadata: { ...book.metadata, publication_status: publication.metadata.publication_status, published_chapters: publication.metadata.published_chapters, total_chapters: publication.metadata.total_chapters }, metadataAt: publication.at }
}

/** Project synced numeric progress onto verified chapters without inventing history. */
export function withReadingProgress<T extends BookDetails | Book>(book: T, progress: number, replace = true): T {
  if (!Number.isSafeInteger(progress) || progress < 0) return book
  const completed = new Set(book.completed)
  for (const chapter of book.chapters) {
    if (!hasVerifiedMapping(chapter, book.chapters)) continue
    if (chapter.number! <= progress) completed.add(chapter.id)
    else if (replace) completed.delete(chapter.id)
  }
  return { ...book, completed: [...completed], progress: replace ? progress : Math.max(readerProgress(book), progress) }
}

/** Mirror checked organizer progress without manufacturing local reading-history events. */
export function withOrganizerProgress<T extends BookDetails | Book>(book: T, remote: Remote): T {
  const next = withPublication(book, remote)
  if (!Number.isSafeInteger(remote.progress) || remote.progress < 0) return next
  // A first association keeps standalone reads; later corrections are authoritative.
  const changed = book.remote && (book.remote.progress !== remote.progress || remote.status === 're_reading' && book.remote.status !== 're_reading')
  const projected = withReadingProgress(next, remote.progress, Boolean(changed))
  const linked = Boolean(book.remote)
  const rank: Record<Status, number> = { to_read: 0, reading: 1, paused_reading: 3, did_not_finish: 4, waiting_for_updates: 5, finished: 6, re_reading: 2 }
  const status = linked ? book.status === book.remote!.status ? remote.status : book.status : rank[remote.status] >= rank[book.status] ? remote.status : book.status
  return { ...projected, status, favorite: !linked ? Boolean(book.favorite || remote.favorite) : Boolean(book.favorite) === Boolean(book.remote?.favorite) ? Boolean(remote.favorite) : book.favorite, rec: !linked ? Boolean(book.rec || remote.rec) : Boolean(book.rec) === Boolean(book.remote?.rec) ? Boolean(remote.rec) : book.rec }
}

/** An unchanged file's resource paths can repair old section IDs without guessing. */
export function repairChapterState(previous: Book | BookDetails, chapters: ChapterSummary[]): Pick<Book, 'position' | 'completed' | 'history' | 'resumeRequired'> {
  function mapped(id: string) {
    const old = previous.chapters.filter(chapter => chapter.id === id)
    if (old.length !== 1) return
    const matches = chapters.filter(chapter => chapter.path === old[0].path)
    return matches.length === 1 ? matches[0] : undefined
  }
  const position = mapped(previous.position.chapter)
  return {
    position: position ? { ...previous.position, chapter: position.id } : { chapter: chapters[0].id, fraction: 0 },
    completed: previous.completed.flatMap(id => { const chapter = mapped(id); return chapter ? [chapter.id] : [] }),
    history: previous.history.map(event => ({ ...event, chapter: mapped(event.chapter)?.id ?? event.chapter })),
    resumeRequired: Boolean(previous.resumeRequired || !position),
  }
}
