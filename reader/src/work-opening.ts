import { containsWork, workChapters } from './anthology'
import { chapterNumber, isAnthology, progressNumber, type BookDetails, type CatalogBook, type ReadingPosition } from './model'

export type WorkOpening = { target: string; chapter?: number }
export function requestedWork(search: string): WorkOpening | undefined {
  const params = new URLSearchParams(search), target = params.get('work') ?? params.get('book')
  if (!target || !(/^[1-9]\d*$/.test(target) && Number.isSafeInteger(Number(target))) && !/^[a-f0-9]{64}$/.test(target)) return
  const chapter = Number(params.get('chapter'))
  return { target, ...(Number.isSafeInteger(chapter) && chapter > 0 && { chapter }) }
}
/** Prefer active downloads, then retained downloads, before requiring a cloud download. */
export function workVersions(books: CatalogBook[], target: string): CatalogBook[] {
  const rank = (book: CatalogBook) => book.hasFile ? book.active ? 0 : 1 : book.active ? 2 : 3
  return books.filter(book => containsWork(book, target)).sort((a, b) => rank(a) - rank(b) || b.importedAt.localeCompare(a.importedAt) || a.id.localeCompare(b.id))
}
export function openingPosition(book: Pick<BookDetails, 'id' | 'metadata' | 'workId' | 'works' | 'chapters' | 'position' | 'completed'>, opening: WorkOpening): ReadingPosition | undefined {
  if (!containsWork(book, opening.target)) throw new Error('The selected EPUB no longer identifies this work. Choose another EPUB or review its work links.')
  const members = book.works?.filter(work => work.workId === opening.target) ?? []
  if (members.length > 1) throw new Error('This AO3 work appears more than once in the anthology. Review Anthology Contents to confirm its work links.')
  const chapters = members[0] ? workChapters(book, members[0]) : book.chapters
  if (!members.length && opening.chapter === undefined) return
  const requested = opening.chapter === undefined ? [] : chapters.filter(chapter => (members.length || !isAnthology(book) ? chapterNumber(chapter, chapters) : progressNumber(chapter, chapters)) === opening.chapter)
  const prose = chapters.filter(chapter => chapter.kind !== 'frontmatter')
  const chapter = requested.length === 1 ? requested[0] : prose.find(chapter => !book.completed.includes(chapter.id)) ?? prose[0] ?? chapters[0]
  if (!chapter) return
  return book.position.chapter === chapter.id ? book.position : { chapter: chapter.id, fraction: 0 }
}
export const openingPreferenceKey = (target: string) => `reader-work-epub:${target}`
