import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { chapterNotesFiles, epubBuffer, epubFiles } from '../../src/test/epub-fixture'
import { importEpub, sanitize } from '../src/epub'
import { completionStatus, replaceBook, withPublication, repairChapterState } from '../src/model'
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto }) })
async function book() { const buffer = await epubBuffer(); return importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File) }
describe('EPUB import and rendering', () => {
  it('reuses AO3 metadata and ignores story recommendations when matching identity', async () => {
    const imported = await book()
    expect(imported.workId).toBe('8001')
    expect(imported.metadata.fandoms).toEqual(['Recovered Fandom'])
    expect(imported.chapters).toHaveLength(2)
    expect(imported.chapters.map(c => c.html).join('')).not.toContain('<script')
    expect(imported.id).toHaveLength(64)
  })
  it('keeps books with no AO3 identifier standalone', async () => {
    const buffer = await epubBuffer(epubFiles({ source: 'urn:isbn:1234', preface: false }))
    const imported = await importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)
    expect(imported.workId).toBeNull()
    expect(imported.chapters.length).toBeGreaterThan(0)
  })
  it('removes active content, handlers, styles, remote images, and dangerous links', () => {
    const doc = new DOMParser().parseFromString('<html><body><p onclick="evil()" style="color:red">Text<script>evil()</script><a href="javascript:evil()">Link</a><svg><script>evil()</script></svg></p></body></html>', 'application/xml')
    const html = sanitize(doc, 'chapter.xhtml', {})
    expect(html).not.toMatch(/onclick|style=|javascript:|<script|<svg/)
    const image = new DOMParser().parseFromString('<html><body><img src="https://evil.invalid/tracking.png" /></body></html>', 'application/xml')
    expect(() => sanitize(image, 'chapter.xhtml', {})).toThrow('External')
  })
  it('rejects missing and corrupt chapter resources without returning a partial book', async () => {
    const buffer = await epubBuffer(epubFiles().filter(f => !f.name.endsWith('chapter.xhtml')))
    await expect(importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)).rejects.toThrow('Missing EPUB resource')
  })
})
describe('Reading progress and versions', () => {
  it('never treats the EPUB end as the latest published chapter', async () => {
    const b = await book()
    b.chapters = [{ ...b.chapters[1], id: 'ao3:1', ao3Id: '1', number: 1 }]
    b.completed = ['ao3:1']; b.metadata.published_chapters = 10
    expect(completionStatus(b)).toBe('reading')
    b.metadata.published_chapters = 1
    expect(completionStatus(b)).toBe('finished')
    b.metadata.publication_status = 'in_progress'
    expect(completionStatus(b)).toBe('waiting_for_updates')
    b.metadata.publication_status = 'unknown'; b.status = 'paused_reading'
    expect(completionStatus(b)).toBe('paused_reading')
  })
  it('requires reliable mapping before inferring completion', async () => {
    const b = await book(); b.metadata.published_chapters = 2; b.completed = b.chapters.map(c => c.id); b.status = 'reading'
    expect(completionStatus(b)).toBe('reading')
  })
  it('preserves history and maps stable identities instead of chapter numbers', async () => {
    const old = await book(); old.position = { chapter: old.chapters[1].id, fraction: .6 }; old.completed = [old.chapters[1].id]; old.notes = 'Personal'
    const reordered = { ...old, id: 'new', chapters: [...old.chapters].reverse() }
    const mapped = replaceBook(old, reordered)
    expect(mapped.position).toEqual(old.position); expect(mapped.notes).toBe('Personal')
    const changed = replaceBook(old, { ...reordered, chapters: [{ ...old.chapters[1], id: 'changed' }] })
    expect(changed.resumeRequired).toBe(true); expect(changed.completed).toEqual([]); expect(changed.history).toEqual(old.history)
  })
})

it('rejects ambiguous chapter identities and uses newer publication snapshots without changing history', async () => {
  const b = await book()
  b.chapters = [{ ...b.chapters[1], id: 'ao3:1', ao3Id: '1', number: 1 }, { ...b.chapters[1], id: 'ao3:2', ao3Id: '1', number: 2 }]
  b.completed = b.chapters.map(c => c.id); b.metadata.published_chapters = 2
  expect(completionStatus(b)).toBe('reading')
  const next = withPublication(b, { id: 'entry', version: '1', status: 'reading', progress: 0, notes: '', publication: { at: '2099-01-01T00:00:00Z', metadata: { ...b.metadata, published_chapters: 10, publication_status: 'in_progress' } } })
  expect(next.metadata.published_chapters).toBe(10)
  expect(next.history).toEqual(b.history)
  const replaced = replaceBook({ ...next, remote: { id: 'entry', version: '1', status: 'reading', progress: 0, notes: '', publication: { metadata: next.metadata, at: next.metadataAt } } }, b)
  expect(replaced.metadata.published_chapters).toBe(10)
  expect(completionStatus(next)).toBe('reading')
})

it('keeps notes and chapters distinct even when notes or chapter prose repeat', async () => {
  const buffer = await epubBuffer(chapterNotesFiles())
  const imported = await importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)
  expect(new Set(imported.chapters.map(chapter => chapter.id)).size).toBe(imported.chapters.length)
  const notes = imported.chapters.find(chapter => chapter.title === 'Notes:')!
  expect(notes.kind).toBe('frontmatter')
  const first = imported.chapters.find(chapter => chapter.title === 'Chapter 1')!
  const second = imported.chapters.find(chapter => chapter.title === 'Chapter 2')!
  expect(first.id).not.toBe(second.id)
  expect(second.id).not.toBe(notes.id)
  expect(second.words).toBe(3)
  expect(second.ao3Id).toBeNull()
  expect(second.number).toBeNull()
})
it('repairs old section identities by file path while preserving history and flagging ambiguous resume positions', async () => {
  const buffer = await epubBuffer(chapterNotesFiles())
  const imported = await importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)
  const second = imported.chapters.find(chapter => chapter.title === 'Chapter 2')!
  const old = { ...imported, chapters: imported.chapters.map(chapter => chapter === second || chapter.title === 'Notes:' ? { ...chapter, id: 'colliding-notes-id' } : chapter), position: { chapter: 'colliding-notes-id', fraction: .5 }, completed: ['colliding-notes-id'], history: [{ id: 'read', chapter: 'colliding-notes-id', at: imported.importedAt, words: 3, reread: false }] }
  const ambiguous = repairChapterState(old, imported.chapters)
  expect(ambiguous.resumeRequired).toBe(true)
  expect(ambiguous.completed).toEqual([])
  expect(ambiguous.history).toEqual(old.history)
  old.chapters = old.chapters.map(chapter => chapter.path === second.path ? { ...chapter, id: 'old-chapter-two' } : chapter)
  const clear = repairChapterState({ ...old, position: { chapter: 'old-chapter-two', fraction: .5 }, completed: ['old-chapter-two'] }, imported.chapters)
  expect(clear.resumeRequired).toBe(false)
  expect(clear.position).toEqual({ chapter: second.id, fraction: .5 })
  expect(clear.completed).toEqual([second.id])
})
