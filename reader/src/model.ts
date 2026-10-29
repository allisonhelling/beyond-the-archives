import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { caughtUpReadingStatus, type Metadata, type Status } from '../../src/features/library/model'
export { statuses, blankMetadata } from '../../src/features/library/model'
export type { Metadata, Status }
export type ReaderMetadata = Metadata & { ao3_collections?: string[]; published_at?: string; updated_at?: string; packaged_at?: string; publisher?: string; language_code?: string }
export type Chapter = { kind?: 'frontmatter' | 'chapter'; id: string; ao3Id: string | null; number: number | null; title: string; html: string; words: number | null; path: string }
export type Remote = { id: string; version: string; status: Status; progress: number; notes: string; collections?: string[]; tags?: string[] }
export type ReadingPosition = { chapter: string; fraction: number; textOffset?: number; textTop?: number; viewport?: { layout: Preferences['layout']; content: Preferences['content']; size: number; width: number; widthPx: number; heightPx: number; scrollHeight: number; scrollWidth: number; scrollTop: number; scrollLeft: number } }
export function chapterNumber(chapter: ChapterSummary, chapters: ChapterSummary[]): number | null {
  if (chapter.kind === 'frontmatter') return null
  return chapter.number ?? (Number(chapter.title.match(/^Chapter\s+(\d+)(?:\b|:)/i)?.[1]) || chapters.slice(0, chapters.indexOf(chapter) + 1).filter(item => item.kind !== 'frontmatter').length)
}
export type Book = { id: string; workId: string | null; active: boolean; metadata: ReaderMetadata; metadataVersion?: number; chapters: Chapter[]; resources: Record<string, Blob>; file: Blob | null; importedAt: string; metadataAt: string; position: ReadingPosition; completed: string[]; history: { id: string; chapter: string; at: string; words: number | null; reread: boolean }[]; status: Status; notes: string; collections: string[]; remote?: Remote; account?: string; resumeRequired?: boolean }
export type ChapterSummary = Omit<Chapter, 'html'>
export type BookDetails = Omit<Book, 'file' | 'resources' | 'chapters'> & { hasFile: boolean; chapters: ChapterSummary[] }
export type BookContent = Pick<Book, 'id' | 'file' | 'resources' | 'chapters'>
export type CatalogBook = Omit<BookDetails, 'chapters' | 'history' | 'completed' | 'notes' | 'remote' | 'position'> & { position: Pick<ReadingPosition, 'chapter' | 'fraction'>; chapterCount: number; wordCount: number; completedCount: number }
export function bookDetails(book: Book): BookDetails {
  const { file, resources: _resources, chapters, ...details } = book
  void _resources
  return { ...details, hasFile: Boolean(file), chapters: chapters.map(({ html: _html, ...chapter }) => { void _html; return chapter }) }
}
export function catalogBook(book: BookDetails): CatalogBook {
  const { chapters, history: _history, completed, notes: _notes, remote: _remote, position, ...catalog } = book
  void _history; void _notes; void _remote
  return { ...catalog, position: { chapter: position.chapter, fraction: position.fraction }, chapterCount: chapters.length, wordCount: chapters.reduce((sum, chapter) => sum + (chapter.words ?? 0), 0), completedCount: completed.length }
}
export type Connection = { backend: string; key: string; secret: string; account: string; label: string; name: string }
export type Pending = { id: string; book: string; work: string; account: string; base: Remote; input: Record<string, unknown>; action?: 'save' | 'progress'; error?: string }
export type Preferences = { content: 'chapter' | 'entire'; layout: 'scroll' | 'pages'; size: number; width: number; dark: boolean; chapterBar?: boolean; tagAppearance?: TagAppearance; tagSyncAccount?: string }
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
export function completionStatus(book: BookDetails | Book): Status {
  const published = book.metadata.published_chapters
  if (!published || !['complete', 'in_progress'].includes(book.metadata.publication_status)) return book.status
  for (let n = 1; n <= published; n++) if (!book.chapters.some(c => c.number === n && c.ao3Id && book.completed.includes(c.id))) return book.status === 'to_read' ? 'reading' : book.status
  return caughtUpReadingStatus(book.status, book.metadata)
}
export function replaceBook(previous: BookDetails | Book, next: Book): Book {
  const old = previous.chapters.find(c => c.id === previous.position.chapter)
  const mapped = old && mapChapter(old, next.chapters)
  return { ...next, workId: previous.workId, account: previous.account, remote: previous.remote, notes: previous.notes, collections: previous.collections, status: previous.status, history: previous.history,
    completed: previous.completed.filter(id => next.chapters.some(c => c.id === id)), position: mapped ? { ...previous.position, chapter: mapped.id } : next.position, resumeRequired: !mapped }
}
