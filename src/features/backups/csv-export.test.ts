import { exportWork } from '../library/work-export'
import { Blob as NodeBlob } from 'node:buffer'
import { crc32 } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { blankMetadata, type Story, type Collection } from '../library/model'
import type { SeriesRecord } from '../library/series/series'
import { applyAutomaticCollections, automaticCollectionRules } from '../library/collections/automatic-collections'
import { defaultReadingFilters } from '../library/reading-search'
import { createZip } from '../../lib/zip'
import { csvFiles, exportLibraryCsv, libraryCsvFiles } from './csv-export'

const mocks = vi.hoisted(() => ({ loadLibrary: vi.fn(), downloadFile: vi.fn() }))
vi.mock('../library/repository', () => ({ loadLibrary: mocks.loadLibrary }))
vi.mock('../../lib/download', () => ({ downloadFile: mocks.downloadFile }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

// Parse quoted RFC 4180 cells, including embedded commas, quotes, and newlines.
function rows(content: string) {
  const parsed: string[][] = [[]]
  let quoted = false, cell = ''
  const text = content.replace(/^\ufeff/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (!quoted && (char === ',' || char === '\r')) {
      parsed.at(-1)!.push(cell); cell = ''
      if (char === '\r') { i++; if (i + 1 < text.length) parsed.push([]) }
    } else cell += char
  }
  return parsed.slice(1).map(row => Object.fromEntries(parsed[0].map((key, index) => [key, row[index]])))
}

function fixture() {
  const rules = automaticCollectionRules({ ...defaultReadingFilters, favorites: true })
  const collections = [
    { id: 'manual', name: 'Custom, "shelf"', description: 'My shelf', color: '#ffffff', symbol: '✦', sort_position: 4, automatic_rules: null },
    { id: 'auto', name: 'Favorites', automatic_rules: rules },
  ] as Collection[]
  const story = { id: 'entry', work_id: 'work', notes: 'Renée, "private"\nSecond line', personal_rating: 4.5,
    reading_status: 'reading', last_read_chapter: 3, is_favorite: true, is_rec: true, source_bookmark: { rec: false }, personalTags: ['Fluff', '私のタグ'], collectionIds: ['manual'],
    work: { id: 'work', ao3_work_id: 123, language: 'English', verified_chapters: { 1: '456' } },
    metadata: { ...blankMetadata, title: '=HYPERLINK("unsafe")', authors: ['Author'], word_count: 1234 }, metadata_overrides: { title: '=HYPERLINK("unsafe")' },
  } as unknown as Story
  const series = [{ id: 'series', ao3_series_id: 7, metadata: { title: 'Saved series', works: [{ workId: 123, position: 1 }] },
    notes: 'Series note', is_favorite: true, reading_status: 'finished', collectionIds: ['manual'] }] as unknown as SeriesRecord[]
  return { stories: applyAutomaticCollections([story], collections), collections, series }
}

it.each([123, null])('preserves version 1 work identity and original source URLs in JSON and CSV for AO3 ID %s', async ao3Id => {
  vi.stubGlobal('Blob', NodeBlob)
  const original = ao3Id === null
    ? 'https://archiveofourown.org/bookmarks/456'
    : 'https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/123/chapters/987'
  const base = fixture().stories[0]
  const story: Story = { ...base, original_url: original, detailsLoaded: true,
    work: { ...base.work, ao3_work_id: ao3Id, canonical_url: null, canonical_verified_at: null },
  }
  exportWork(story, 'json', [])
  const [blob, filename] = mocks.downloadFile.mock.calls[0] as [Blob, string]
  const value = JSON.parse(await blob.text())
  expect(value).toMatchObject({ format: 'beyond-the-archives-work', version: 1,
    work: { id: story.id, work_id: story.work_id, original_url: original,
      work: { id: story.work.id, ao3_work_id: ao3Id, canonical_url: null, canonical_verified_at: null },
      metadata_overrides: story.metadata_overrides },
  })
  expect(value.work).not.toHaveProperty('detailsLoaded')
  expect(value.source_version).toMatchObject({ contractVersion: 1, storyId: story.id, sourceVersionId: story.id,
    workId: story.work.id, canonicalUrl: null, publishedChapters: { value: null, manualOverride: false } })
  expect(value.source_version.identity).toEqual(ao3Id === null ? null : { kind: 'native', platform: 'ao3', nativeWorkId: String(ao3Id) })
  expect(filename).toBe(`beyond-the-archives-work-${ao3Id ?? story.id}.json`)
  const [csv] = libraryCsvFiles({ stories: [story], series: [], collections: [] }, ['works.csv'])
  expect(rows(csv.content)[0]).toMatchObject({ id: story.id, work_id: story.work.id,
    original_url: original, work_ao3_work_id: ao3Id === null ? '' : String(ao3Id),
    work_canonical_url: '', work_canonical_verified_at: '' },
  )
})

it('exports private fields, rich metadata, custom collections, rules, and both membership types', () => {
  const library = fixture()
  const files = libraryCsvFiles(library, csvFiles.map(file => file.name))
  const exported = Object.fromEntries(files.map(file => [file.name, rows(file.content)]))
  const work = exported['works.csv'][0]
  expect(work).toMatchObject({ notes: library.stories[0].notes, personal_rating: '4.5', reading_status: 'reading', last_read_chapter: '3',
    rec: 'true', word_count: '1234', work_language: 'English', title: '\'=HYPERLINK("unsafe")' })
  expect(work).not.toHaveProperty('is_rec')
  expect(JSON.parse(work.personal_tags)).toEqual(['Fluff', '私のタグ'])
  expect(JSON.parse(work.collection_names)).toEqual(['Custom, "shelf"', 'Favorites'])
  expect(JSON.parse(work.work_verified_chapters)).toEqual({ 1: '456' })
  expect(JSON.parse(work.metadata_overrides)).toEqual(library.stories[0].metadata_overrides)
  expect(exported['series.csv'][0]).toMatchObject({ title: 'Saved series', notes: 'Series note', is_favorite: 'true', reading_status: 'finished' })
  expect(JSON.parse(exported['series.csv'][0].collection_names)).toEqual(['Custom, "shelf"'])
  expect(exported['collections.csv'][0]).toMatchObject({ name: 'Custom, "shelf"', color: '#ffffff', symbol: '✦', sort_position: '4' })
  expect(JSON.parse(exported['collections.csv'][1].automatic_rules)).toEqual(library.collections[1].automatic_rules)
  expect(exported['collection_memberships.csv']).toEqual([
    expect.objectContaining({ collection_id: 'manual', item_type: 'work', library_entry_id: 'entry', membership_type: 'manual' }),
    expect.objectContaining({ collection_id: 'auto', item_type: 'work', library_entry_id: 'entry', membership_type: 'automatic' }),
    expect.objectContaining({ collection_id: 'manual', item_type: 'series', library_series_id: 'series', membership_type: 'manual' }),
  ])
})

it('exports only selected files and writes headers for empty lists', () => {
  const result = libraryCsvFiles({ stories: [], series: [], collections: [] }, ['collections.csv', 'collection_memberships.csv'])
  expect(result.map(file => file.name)).toEqual(['collections.csv', 'collection_memberships.csv'])
  expect(result[0].content).toContain('"automatic_rules"')
  expect(result[1].content).toContain('"library_series_id"')
  expect(rows(result[0].content)).toEqual([])
})

it('loads the complete library for one ZIP download and propagates failure without downloading', async () => {
  vi.stubGlobal('Blob', NodeBlob)
  mocks.loadLibrary.mockResolvedValue(fixture())
  await exportLibraryCsv(['works.csv'])
  expect(mocks.loadLibrary).toHaveBeenCalledOnce()
  expect(mocks.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/zip' }), expect.stringMatching(/\.zip$/))
  mocks.downloadFile.mockClear()
  mocks.loadLibrary.mockRejectedValue(new Error('offline'))
  await expect(exportLibraryCsv(['works.csv'])).rejects.toThrow('offline')
  await expect(exportLibraryCsv([])).rejects.toThrow('Choose at least one')
  expect(mocks.downloadFile).not.toHaveBeenCalled()
})

it('packages UTF-8 CSVs with valid ZIP checksums, directory entries, and offsets', async () => {
  vi.stubGlobal('Blob', NodeBlob)
  const files = [{ name: 'works.csv', content: '\ufeff"Renée 私"\r\n' }, { name: 'series.csv', content: '' }]
  const bytes = Buffer.from(await createZip(files).arrayBuffer())
  let offset = 0
  const localOffsets: number[] = []
  for (const file of files) {
    localOffsets.push(offset)
    expect(bytes.readUInt32LE(offset)).toBe(0x04034b50)
    expect(bytes.readUInt16LE(offset + 6)).toBe(0x800)
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26)
    expect(bytes.subarray(offset + 30, offset + 30 + nameLength).toString()).toBe(file.name)
    const content = bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size)
    expect(content.toString()).toBe(file.content)
    expect(bytes.readUInt32LE(offset + 14)).toBe(crc32(content))
    offset += 30 + nameLength + size
  }
  const directoryStart = offset
  files.forEach((file, index) => {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50)
    expect(bytes.readUInt32LE(offset + 42)).toBe(localOffsets[index])
    expect(bytes.subarray(offset + 46, offset + 46 + bytes.readUInt16LE(offset + 28)).toString()).toBe(file.name)
    offset += 46 + bytes.readUInt16LE(offset + 28)
  })
  expect(bytes.readUInt32LE(offset)).toBe(0x06054b50)
  expect(bytes.readUInt16LE(offset + 10)).toBe(files.length)
  expect(bytes.readUInt32LE(offset + 12)).toBe(offset - directoryStart)
  expect(bytes.readUInt32LE(offset + 16)).toBe(directoryStart)
})

it.each(['json','csv'] as const)('exports one saved work as %s without loading the complete library', async format => {
 vi.stubGlobal('Blob', NodeBlob)
 const library=fixture(),story={...library.stories[0],detailsLoaded:true}
 exportWork(story,format,library.collections)
 expect(mocks.loadLibrary).not.toHaveBeenCalled()
 const [blob,filename]=mocks.downloadFile.mock.calls[0] as [Blob,string]
 expect(filename).toBe(`beyond-the-archives-work-123.${format}`)
 const text=await blob.text()
 if(format==='json') {
  const value=JSON.parse(text)
  expect(value.work).toMatchObject({id:story.id,metadata:story.metadata,notes:story.notes})
  expect(value.work).not.toHaveProperty('detailsLoaded')
 } else {
  const exported=rows(text)
  expect(exported).toHaveLength(1)
  expect(exported[0].title).toBe(`'${story.metadata.title}`)
  expect(exported[0].notes).toBe(story.notes)
  expect(JSON.parse(exported[0].collection_names)).toContain('Custom, "shelf"')
 }
})
