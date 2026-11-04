import { beforeAll, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { epubBuffer } from '../../src/test/epub-fixture'
import { importEpub } from '../src/epub'
import { anthologyLabel, chapterContent, hasWorkOrder, retainedContents, reviewContents, withWorkProgress, workBook, workProgress, type ReviewedSection } from '../src/anthology'
import { progressNumber, bookDetails, catalogBook, completionStatus, hasVerifiedMapping, readerProgress, readerChapterLabel, repairChapterState, withReadingProgress } from '../src/model'
import { cloudBookFields } from '../src/cloud-model'
import { savedWorkIdentity } from '../src/metadata'
import { anthologyFiles } from './anthology-fixture'

beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto }) })
async function anthology() { const buffer = await epubBuffer(anthologyFiles()); return importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File) }

it('detects three separate works and five chapters without counting title pages or notes', async () => {
  const book = await anthology()
  expect(book.metadata.title).toBe('Three Fic Anthology')
  expect(anthologyLabel(book)).toBe('Anthology · 3 Works · 5 Chapters')
  expect(book.metadata).toMatchObject({ published_chapters: 5, total_chapters: 5, one_shot: false })
  expect(book.workId).toBeNull()
  expect(savedWorkIdentity({ ...book, metadata: { ...book.metadata, calibre_work_link: 'https://archiveofourown.org/works/91001' } })).toBeNull()
  expect(book.works?.map(work => work.workId)).toEqual(['91001', '91002', '91003'])
  expect(book.works?.map(work => work.metadata.published_chapters)).toEqual([3, 1, 1])
  expect(catalogBook(bookDetails(book)).chapterCount).toBe(5)
  const prose = book.chapters.filter(chapter => chapter.kind !== 'frontmatter')
  expect(prose.map(chapter => progressNumber(chapter, book.chapters))).toEqual([1, 2, 3, 4, 5])
  expect(prose.map(chapter => readerChapterLabel(chapter, book.chapters))).toEqual(['1. Fic 1 Part 1', '2. Fic 1 Part 2', '3. Fic 1 Part 3', '1. Fic 2 Part 1', '1. Fic 3 Part 1'])
  expect(prose.every(chapter => hasVerifiedMapping(chapter, book.chapters))).toBe(true)
})

it('keeps per-work organizer corrections separate from aggregate progress and history', async () => {
  const original = await anthology(), first = original.works![0], second = original.works![1]
  const remote = { id: 'fic-1', version: '1', status: 'finished' as const, progress: 3, notes: '' }
  const next = withWorkProgress(original, first.key, remote, 'owner')
  expect(readerProgress(next)).toBe(3)
  expect(workProgress(next, next.works![0])).toBe(3)
  expect(workProgress(next, second)).toBe(0)
  expect(completionStatus(next)).not.toBe('finished')
  expect(next.history).toEqual([])
  expect(next.workId).toBeNull()
  const reread = withWorkProgress(next, first.key, { ...remote, version: '2', status: 're_reading', progress: 0 }, 'owner')
  expect(readerProgress(reread)).toBe(0)
  const allRead = withReadingProgress(original, 5)
  expect(readerProgress(allRead)).toBe(5)
  expect(completionStatus(allRead)).toBe('finished')
  expect(workBook(next, first).chapters.filter(chapter => chapter.kind !== 'frontmatter')).toHaveLength(3)
  const fields = cloudBookFields(bookDetails(next))
  expect(JSON.stringify(fields.manifest)).not.toContain('"remote"')
  expect(JSON.stringify(fields.manifest)).not.toContain('"account"')
})

it('lets readers correct classifications and boundaries without changing chapter IDs or reading history', async () => {
  const original = await anthology()
  original.completed = original.chapters.filter(chapter => chapter.kind !== 'frontmatter').map(chapter => chapter.id)
  original.history = [{ id: 'event', chapter: original.completed[0], at: '2026-11-03T00:00:00Z', words: 9, reread: false }]
  const sections: ReviewedSection[] = original.chapters.map(chapter => {
    const work = original.works!.find(work => work.key === chapter.workKey)!
    return { path: chapter.path, kind: chapter.kind === 'frontmatter' ? chapter.sectionType ?? 'title' : 'chapter', beginsWork: Boolean(chapter.workStart), title: work.title, url: `https://archiveofourown.org/works/${work.workId}` }
  })
  sections[2].kind = 'notes'
  const corrected = reviewContents(bookDetails(original), sections)
  expect(corrected.metadata.published_chapters).toBe(4)
  expect(readerProgress(corrected)).toBe(4)
  expect(corrected.history).toEqual(original.history)
  expect(corrected.chapters.map(chapter => chapter.id)).toEqual(original.chapters.map(chapter => chapter.id))
  expect(readerChapterLabel(corrected.chapters[3], corrected.chapters)).toBe('2. Fic 1 Part 3')
  expect(hasWorkOrder(corrected, corrected.works![0])).toBe(false)
  const restored = retainedContents(corrected, original.chapters)
  expect(restored[2].sectionType).toBe('notes')
  expect(restored[3].displayNumber).toBe(2)
  expect(chapterContent(original.chapters, restored)[2].html).toBe(original.chapters[2].html)
  const boundary = sections.findIndex((section, index) => index > 0 && section.beginsWork)
  sections[boundary].url = sections[0].url
  expect(() => reviewContents(bookDetails(original), sections)).toThrow('different work')
  sections[boundary].url = 'https://example.com/not-ao3'
  expect(() => reviewContents(bookDetails(original), sections)).toThrow()
  const merged = sections.map((section, index) => ({ ...section, beginsWork: index === 0 }))
  expect(() => reviewContents(bookDetails(original), merged)).toThrow('different AO3 works')
  merged[0].url = ''
  const standalone = reviewContents(bookDetails(original), merged)
  expect(standalone.workId).toBeNull()
  expect(progressNumber(standalone.chapters.at(-2)!, standalone.chapters)).toBe(4)
})

it('distinguishes equal work titles and projects one-shot progress without source chapter IDs', async () => {
  const files = anthologyFiles().map(file => ({ ...file, content: file.content.replaceAll('Fic 2', 'Fic 1').replace(/<a href="https:\/\/archiveofourown\.org\/works\/\d+\/chapters\/\d+">([^<]+)<\/a>/g, '$1') }))
  const buffer = await epubBuffer(files), book = await importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)
  expect(book.works).toHaveLength(3)
  expect(book.works![0].title).toBe(book.works![1].title)
  expect(new Set(book.works!.map(work => work.key)).size).toBe(3)
  expect(hasWorkOrder(book, book.works![1])).toBe(true)
  const next = withWorkProgress(book, book.works![1].key, { id: 'one-shot', version: '1', progress: 1, status: 'finished', notes: '' }, 'owner')
  expect(readerProgress(next)).toBe(1)
  expect(next.completed.every(id => next.chapters.find(chapter => chapter.id === id)?.workKey === book.works![1].key)).toBe(true)
  expect(cloudBookFields(bookDetails(next)).completed).toEqual(next.completed)
  expect(next.history).toEqual([])
})

it('retains newer cloud chapter IDs while repairing an older local anthology download', async () => {
  const book = await anthology(), target = book.chapters.find(chapter => chapter.ao3Id === '910021')!
  const legacy = { ...bookDetails(book), chapters: book.chapters.map(chapter => ({ ...chapter, id: `legacy:${chapter.path}` })), position: { chapter: target.id, fraction: .5 }, completed: [target.id], history: [{ id: 'cloud-read', chapter: target.id, at: '2026-11-03', words: target.words, reread: false }] }
  const repaired = repairChapterState(legacy, book.chapters)
  expect(repaired.position).toEqual(legacy.position)
  expect(repaired.completed).toEqual([target.id])
  expect(repaired.history).toEqual(legacy.history)
  expect(repaired.resumeRequired).toBe(false)
})
