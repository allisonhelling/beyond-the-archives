import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { epubBuffer, epubFiles } from '../../src/test/epub-fixture'
import { importEpub, sanitize } from '../src/epub'
import { completionStatus, replaceBook } from '../src/model'
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
