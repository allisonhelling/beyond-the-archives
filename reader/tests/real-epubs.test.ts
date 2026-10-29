import { createHash, webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, expect, it } from 'vitest'
import { importEpub } from '../src/epub'

type Fixture = { file: string; bytes: number; sha256: string; title: string; source: string; authors: string[]; words: number; chapters: number }
const fixtureDirectory = join(__dirname, 'fixtures', 'epubs')
const fixtures: Fixture[] = JSON.parse(readFileSync(join(fixtureDirectory, 'manifest.json'), 'utf8'))
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto }) })

it.each(fixtures)('imports the original $title EPUB with its expected metadata', async fixture => {
  const bytes = readFileSync(join(fixtureDirectory, fixture.file))
  expect(bytes.byteLength).toBe(fixture.bytes)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256)
  const buffer = new Uint8Array(bytes).buffer
  const book = await importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)
  expect(book.id).toBe(fixture.sha256)
  expect(book.workId).toBe(new URL(fixture.source).pathname.split('/')[2])
  expect(book.metadata).toMatchObject({ title: fixture.title, authors: fixture.authors, word_count: fixture.words, published_chapters: fixture.chapters, publication_status: 'complete' })
  expect(book.chapters.filter(chapter => chapter.kind === 'chapter')).toHaveLength(fixture.chapters)
  expect(book.metadata.fandoms.length).toBeGreaterThan(0)
  expect(book.metadata.character_tags?.length).toBeGreaterThan(0)
  expect(book.metadata.additional_tags?.length).toBeGreaterThan(0)
  expect(book.completed).toEqual([])
  expect(book.history).toEqual([])
})
