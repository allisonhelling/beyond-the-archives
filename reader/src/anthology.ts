import { parseWorkUrl } from '../../src/features/imports/urls'
import { blankMetadata, bookDetails, chapterNumber, completionStatus, isAnthology, withOrganizerProgress, type AnthologyWork, type Book, type BookDetails, type ChapterSummary, type Remote } from './model'
import { progressReadingStatus } from '../../src/features/library/model'
import { readerWorkIdentities } from '../../src/lib/reader-work-identities'

type Contents = Pick<BookDetails, 'works' | 'chapters'>
export function containsWork(book: Pick<BookDetails, 'works' | 'workId' | 'metadata' | 'id'>, id: string | undefined) { return Boolean(id && (book.id === id || readerWorkIdentities(book).includes(id))) }
export function workChapters(book: Contents, work: AnthologyWork) { return book.chapters.filter(chapter => chapter.workKey === work.key) }
export function hasWorkOrder(book: Contents & Pick<BookDetails, 'contentsReviewed'>, work: AnthologyWork) {
  const chapters = workChapters(book, work).filter(chapter => chapter.kind !== 'frontmatter')
  return chapters.length > 0 && (book.contentsReviewed || work.metadata.published_chapters === chapters.length)
    && chapters.every((chapter, index) => (!chapter.sourceWorkId || chapter.sourceWorkId === work.workId) && chapterNumber(chapter, chapters) === index + 1)
}
export function anthologyLabel(book: Pick<BookDetails, 'works' | 'metadata'>) {
  return isAnthology(book) ? `Anthology · ${book.works!.length} Works · ${book.metadata.published_chapters ?? 0} Chapters` : undefined
}
export function progressMetadata<T extends Pick<BookDetails, 'works' | 'metadata'>>(book: T) {
  return isAnthology(book) ? { ...book.metadata, publication_status: 'complete' as const } : book.metadata
}
export function workBook(book: BookDetails | Book, work: AnthologyWork): BookDetails {
  const chapters = workChapters(book, work)
  const details = 'hasFile' in book ? book : bookDetails(book)
  const progress = workProgress(book, work)
  return { ...details, works: undefined, chapters, workId: work.workId, metadata: work.metadata, status: work.status ?? progressReadingStatus(progress, work.metadata, book.status === 're_reading' ? 're_reading' : undefined), progress, completed: book.completed.filter(id => chapters.some(chapter => chapter.id === id)), remote: work.remote, account: work.account }
}
export function workProgress(book: Pick<BookDetails, 'works' | 'chapters' | 'completed'>, work: AnthologyWork) {
  if (work.progress !== undefined) return work.progress
  let count = 0
  const chapters = workChapters(book, work)
  for (const chapter of chapters.filter(chapter => chapter.kind !== 'frontmatter')) {
    if (chapterNumber(chapter, chapters) !== count + 1 || !book.completed.includes(chapter.id)) break
    count++
  }
  return count
}
/** Only the matched work receives organizer state; aggregate progress is never projected. */
export function withWorkProgress<T extends Book | BookDetails>(book: T, key: string, remote: Remote, account: string): T {
  const work = book.works?.find(work => work.key === key)
  if (!work) return book
  const projected = withOrganizerProgress(workBook(book, work), remote)
  const prose = workChapters(book, work).filter(chapter => chapter.kind !== 'frontmatter')
  if (hasWorkOrder(book, work)) {
    const completed = new Set(projected.completed)
    const replace = work.remote && (work.remote.progress !== remote.progress || remote.status === 're_reading' && work.remote.status !== 're_reading')
    for (const [index, chapter] of prose.entries()) {
      if (index < remote.progress) completed.add(chapter.id)
      else if (replace) completed.delete(chapter.id)
    }
    projected.completed = [...completed]
  }
  const ids = new Set(workChapters(book, work).map(chapter => chapter.id))
  const next = { ...book, completed: [...book.completed.filter(id => !ids.has(id)), ...projected.completed], works: book.works!.map(item => item.key === key ? { ...item, metadata: projected.metadata, progress: projected.progress, status: projected.status, remote, account } : item) }
  return { ...next, progress: next.chapters.filter(chapter => chapter.kind !== 'frontmatter' && next.completed.includes(chapter.id)).length, status: completionStatus(next) }
}
/** Keep the package title and calculate counts from readable content, not metadata pages. */
export function withAnthologyMetadata<T extends Book | BookDetails>(book: T): T {
  if (!isAnthology(book)) return book
  const prose = book.chapters.filter(chapter => chapter.kind !== 'frontmatter')
  return { ...book, workId: null, remote: undefined, metadata: { ...book.metadata, published_chapters: prose.length, total_chapters: prose.length, one_shot: false, word_count: prose.reduce((sum, chapter) => sum + (chapter.words ?? 0), 0), publication_status: book.works!.every(work => work.metadata.publication_status === 'complete') ? 'complete' : 'unknown' } }
}

export type ReviewedSection = { path: string; kind: 'chapter' | 'title' | 'notes' | 'other'; beginsWork: boolean; title: string; url: string }
/** Review changes section membership, never file contents or past reading observations. */
export function reviewContents<T extends BookDetails>(book: T, sections: ReviewedSection[]): T {
  if (sections.length !== book.chapters.length || sections.some((section, index) => section.path !== book.chapters[index].path)) throw new Error('The EPUB contents changed. Open the review again.')
  const works: AnthologyWork[] = []
  let work: AnthologyWork | undefined
  let displayNumber = 0
  const chapters = book.chapters.map((chapter, index) => {
    const section = sections[index]
    if (section.beginsWork) {
      if (!section.title.trim()) throw new Error('Enter a title for each work.')
      const workId = section.url.trim() ? String(parseWorkUrl(section.url.trim()).workId) : null
      const previous = book.works?.find(item => item.key === `work:${chapter.path}`) ?? (!book.works?.length && !works.length && book.workId && book.workId === workId ? { ...book, key: `work:${chapter.path}`, title: book.metadata.title } : undefined)
      work = { key: `work:${chapter.path}`, title: section.title.trim(), workId, metadata: { ...blankMetadata, ...previous?.metadata, title: section.title.trim() }, ...(previous?.workId === workId ? { status: previous?.status, remote: previous?.remote, account: previous?.account } : {}) }
      works.push(work)
      displayNumber = 0
    }
    if (!work && section.kind === 'chapter') throw new Error('Mark where the first work begins before its chapters.')
    return { ...chapter, displayNumber: section.kind === 'chapter' ? ++displayNumber : undefined, kind: section.kind === 'chapter' ? 'chapter' as const : 'frontmatter' as const, sectionType: section.kind === 'chapter' ? undefined : section.kind, workKey: work?.key, workTitle: work?.title, workStart: section.beginsWork }
  })
  if (!works.length || works.some(work => !chapters.some(chapter => chapter.workKey === work.key && chapter.kind !== 'frontmatter'))) throw new Error('Each work must contain at least one chapter.')
  for (const work of works) {
    const sources = new Set(chapters.filter(chapter => chapter.workKey === work.key && chapter.kind !== 'frontmatter').map(chapter => chapter.sourceWorkId).filter(Boolean))
    if (work.workId && sources.size > 1) throw new Error('Chapters from different AO3 works cannot share one work link. Correct the boundaries or clear that link.')
  }
  // A work URL must identify one member only; duplicate identities require review before syncing.
  const ids = works.flatMap(work => work.workId ? [work.workId] : [])
  if (new Set(ids).size !== ids.length) throw new Error('Each AO3 work link must identify a different work.')
  const completed = book.completed.filter(id => chapters.some(chapter => chapter.id === id && chapter.kind !== 'frontmatter'))
  const prose = chapters.filter(chapter => chapter.kind !== 'frontmatter')
  const next = { ...book, works, chapters, completed, contentsReviewed: true, metadata: { ...book.metadata, published_chapters: prose.length, word_count: prose.reduce((sum, chapter) => sum + (chapter.words ?? 0), 0) }, progress: chapters.filter(chapter => completed.includes(chapter.id)).length, workId: works.length === 1 ? works[0].workId : null, remote: works.length === 1 && works[0].workId === book.workId ? book.remote : undefined }
  return withAnthologyMetadata(next)
}

/** Reviewed structure survives downloads and reparsing of the same original EPUB. */
export function retainedContents(previous: BookDetails, chapters: ChapterSummary[]) {
  if (!previous.contentsReviewed) return chapters
  return chapters.map(chapter => {
    const saved = previous.chapters.find(item => item.path === chapter.path)
    return saved ? { ...chapter, displayNumber: saved.displayNumber, kind: saved.kind, sectionType: saved.sectionType, workKey: saved.workKey, workTitle: saved.workTitle, workStart: saved.workStart } : chapter
  })
}

/** Local HTML stays in contents storage; reviewed summaries remain authoritative. */
export function chapterContent(chapters: Book['chapters'], summaries: ChapterSummary[]): Book['chapters'] {
  return chapters.map(chapter => ({ ...chapter, ...summaries.find(item => item.path === chapter.path && item.id === chapter.id) }))
}
