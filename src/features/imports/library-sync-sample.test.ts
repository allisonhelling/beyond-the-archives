import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const extension = vi.hoisted(() => ({ connect: vi.fn(), series: vi.fn() }))
vi.mock('./extension', () => ({ connectExtension: extension.connect, previewSeriesWithExtension: extension.series }))
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/sample-mode', () => ({ sampleMode: true }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { submitLibrarySync } from './repository'
import { readAo3Rows, type CsvWork } from './ao3-csv'
import { loadSampleLibrary } from '../library/sample/repository'
beforeEach(() => {
 const items = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) })
 rpc.mockClear()
})
afterEach(() => vi.unstubAllGlobals())
it('routes sample listing imports to browser storage without calling the connected database', async () => {
 const rows = readAo3Rows([{ title: 'Sample extension import', link: 'https://archiveofourown.org/works/9990011', source_list: 'marked_for_later' }]) as CsvWork[]
 expect(await submitLibrarySync(rows)).toEqual({ batch: null, imported: 1, kept: 0 })
 expect(rpc).not.toHaveBeenCalled()
 expect((await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 9990011)?.metadata.title).toBe('Sample extension import')
})

it('previews pasted series locally through the existing parser without invoking the backend', async () => {
 const { readFile } = await import('node:fs/promises')
 const { previewSeries } = await import('./repository')
 const html = await readFile('server/ao3/fixtures/series.html', 'utf8')
 extension.connect.mockResolvedValue(true)
 extension.series.mockResolvedValue({ url: 'https://archiveofourown.org/series/77', html })
 const preview = await previewSeries('https://archiveofourown.org/series/77')
 expect(preview.seriesId).toBe(77)
 expect(preview.works.length).toBeGreaterThan(0)
 expect(rpc).not.toHaveBeenCalled()
})

it('refreshes sample work observations, reports personal differences, and preserves personal data', async () => {
 const rows = readAo3Rows([{ title: 'Original', summary: 'Original summary', kudos: '20', bookmarks: '4', author: 'Author', chapters: '2/2', date: '2026-10-01', 'bookmark date': '2026-10-20', 'bookmark notes': 'Personal notes', 'bookmark tags': 'Personal tag', link: 'https://archiveofourown.org/works/9990012', source_list: 'bookmarks' }]) as CsvWork[]
 await submitLibrarySync(rows)
 const before = (await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 9990012)!
 const newer = { ...rows[0], metadata: { title: 'Updated title', summary: 'Updated summary', kudos: 0, bookmark_count: 7, authors: [] }, notes: 'Different notes' }
 const result = await submitLibrarySync([newer])
 expect(result).toMatchObject({ imported: 0, kept: 1, bookmarkConflicts: [{ workId: 9990012 }] })
 let saved = (await loadSampleLibrary()).stories.find(story => story.id === before.id)!
 expect(saved).toMatchObject({ notes: before.notes, personalTags: before.personalTags, reading_status: before.reading_status, last_read_chapter: before.last_read_chapter, finished_at: before.finished_at, metadata: { title: 'Updated title', summary: 'Updated summary', kudos: 0, bookmark_count: 7, authors: ['Author'] } })
 // Restore identical personal fields: differences in AO3 fields alone are silent.
 expect(await submitLibrarySync([{ ...rows[0], metadata: { title: 'Newest title', summary: ' ', kudos: 1, bookmark_count: 0 } }])).not.toHaveProperty('bookmarkConflicts')
 saved = (await loadSampleLibrary()).stories.find(story => story.id === before.id)!
 expect(saved.metadata).toMatchObject({ title: 'Newest title', summary: 'Updated summary', kudos: 1, bookmark_count: 0 })
 expect(rpc).not.toHaveBeenCalled()
})

it('automatically marks deleted bookmarks while preserving saved metadata and personal data', async () => {
 const normal = readAo3Rows([{ title: 'The Stars Between Us', author: 'ExampleAuthor', fandoms: 'Star Wars', summary: 'Original summary', source_list: 'bookmarks', work_status: 'available', 'bookmark id': '8101', 'bookmark status': 'private', 'bookmark date': '2026-10-20', date: '2026-10-01', chapters: '8/8', 'bookmark notes': 'Loved chapter 8!', 'bookmark tags': 'Favorites, To Reread', link: 'https://archiveofourown.org/works/9990020' }]) as CsvWork[]
 await submitLibrarySync(normal)
 const before = (await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 9990020)!
 const gone = readAo3Rows([{ title: '', summary: '', author: '', fandoms: '', source_list: 'bookmarks', work_status: 'deleted', 'bookmark id': '8101', link: 'https://archiveofourown.org/bookmarks/8101', 'bookmark notes': 'Different notes\nStill visible', 'bookmark tags': 'Other', 'bookmark date': '21 Oct 2026', 'bookmark user': 'alice', 'bookmark count': '0' }]) as CsvWork[]
 const result = await submitLibrarySync(gone)
 expect(result).toMatchObject({ imported: 0, kept: 1, bookmarkConflicts: [{ workId: null, bookmarkId: 8101 }] })
 expect((await loadSampleLibrary()).stories.find(story => story.id === before.id)).toMatchObject({ work_status: 'deleted', metadata: { ...before.metadata, publication_status: 'deleted' }, extension_metadata: before.extension_metadata, metadata_overrides: before.metadata_overrides,
  source_bookmark: { id: '8101', url: 'https://archiveofourown.org/bookmarks/8101', date: '2026-10-20', user: 'alice', count: 0, notes: 'Different notes\nStill visible', tags: ['Other'] },
  notes: before.notes, personalTags: before.personalTags, reading_status: before.reading_status, last_read_chapter: before.last_read_chapter, finished_at: before.finished_at })
})
it('imports new bookmark-only deletions in Quick Sync and allows editing without a work URL', async () => {
 const deleted = (id: number) => ({ source_list: 'bookmarks', work_status: 'deleted', title: '', 'bookmark id': String(id), link: `https://archiveofourown.org/bookmarks/${id}`, 'bookmark notes': 'Saved note', 'bookmark tags': 'Favorite' })
 const rows = readAo3Rows([deleted(8201), deleted(8202)]) as CsvWork[]
 expect(await submitLibrarySync(rows)).toMatchObject({ imported: 2, kept: 0 })
 const saved = (await loadSampleLibrary()).stories.find(story => story.original_url === rows[0].url)!
 expect(saved).toMatchObject({ work_status: 'deleted', work: { ao3_work_id: null }, metadata: { title: 'Deleted Work — Bookmark #8201', authors: [], fandoms: [] }, notes: 'Saved note', personalTags: ['Favorite'], extension_metadata: { publication_status: 'unknown' }, metadata_overrides: {} })
 const { saveSampleStory } = await import('../library/sample/repository')
 await saveSampleStory({ id: saved.id, url: saved.original_url, metadata: saved.metadata, notes: 'Edited note', tags: ['Edited tag'], status: saved.reading_status, progress: saved.last_read_chapter, favorite: false, personalRating: null, collections: [] })
 expect((await loadSampleLibrary()).stories.find(story => story.id === saved.id)).toMatchObject({ notes: 'Edited note', personalTags: ['Edited tag'], work_status: 'deleted' })
 expect(await submitLibrarySync(rows)).toMatchObject({ imported: 0, kept: 2 })
 expect(rpc).not.toHaveBeenCalled()
})

it('adds new and already saved works to the imported custom collection idempotently', async () => {
 const { saveCollection } = await import('../library/repository')
 const collectionId = await saveCollection('Imported AO3 Collection', undefined, undefined, 'Summary\n\nIntro')
 const rows = readAo3Rows([{ title: 'New work', link: 'https://archiveofourown.org/works/9990040', source_list: 'marked_for_later' }]) as CsvWork[]
 await submitLibrarySync(rows, collectionId)
 await submitLibrarySync(rows, collectionId)
 const library = await loadSampleLibrary()
 expect(library.stories.filter(story => story.work.ao3_work_id === 9990040)).toHaveLength(1)
 expect(library.stories.find(story => story.work.ao3_work_id === 9990040)?.collectionIds).toEqual([collectionId])
 expect(library.collections.find(collection => collection.id === collectionId)).toMatchObject({ name: 'Imported AO3 Collection', description: 'Summary\n\nIntro' })
})

it('combines saved and incoming Rec across sample imports and reloads', async () => {
 const { updateSampleEntry } = await import('../library/sample/repository')
 const rows = readAo3Rows([{ title: 'Personal Rec', link: 'https://archiveofourown.org/works/9990201', source_list: 'bookmarks', 'bookmark id': '9991201', 'bookmark rec': 'true' }]) as CsvWork[]
 await submitLibrarySync(rows)
 const saved = (await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 9990201)!
 expect(saved.is_rec).toBe(true)
 await updateSampleEntry(saved.id, { is_rec: false })
 await submitLibrarySync(rows)
 expect((await loadSampleLibrary()).stories.find(story => story.id === saved.id)?.is_rec).toBe(true)
 await updateSampleEntry(saved.id, { is_rec: true })
 await submitLibrarySync([{ ...rows[0], bookmarkRec: null }])
 expect((await loadSampleLibrary()).stories.find(story => story.id === saved.id)).toMatchObject({ is_rec: true, source_bookmark: { rec: null } })
})

it('migrates old sample Rec observations once without overwriting later local choices', async () => {
 const key = 'between-chapters:sample-library:v1'
 const library = await loadSampleLibrary(), saved = library.stories[0]
 const legacy = { ...saved, source_bookmark: { rec: true } } as Partial<typeof saved>
 delete legacy.is_rec
 localStorage.setItem(key, JSON.stringify({ ...library, stories: [legacy] }))
 expect((await loadSampleLibrary()).stories[0].is_rec).toBe(true)
 const { updateSampleEntry } = await import('../library/sample/repository')
 await updateSampleEntry(saved.id, { is_rec: false })
 expect((await loadSampleLibrary()).stories[0].is_rec).toBe(false)
})

it('uses captured chapter dates for new sample bookmarks while keeping existing progress', async () => {
 const rows = readAo3Rows([{ source_list: 'bookmarks', title: 'Dated sample', link: 'https://archiveofourown.org/works/9990040', chapters: '3/3', date: '2026-10-20', 'bookmark date': '2026-10-10', 'chapter dates': JSON.stringify({ '1': '2026-09-01', '2': '2026-10-01', '3': '2026-10-10' }) }]) as CsvWork[]
 await submitLibrarySync(rows)
 const saved = (await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 9990040)!
 expect(saved).toMatchObject({ reading_status: 'reading', last_read_chapter: 2 })
 await submitLibrarySync(rows)
 expect((await loadSampleLibrary()).stories.find(story => story.id === saved.id)?.last_read_chapter).toBe(2)
})

it('uses default bookmark date logic and saves Marked for Later works as To Read when no status is selected', async () => {
 const rows = readAo3Rows([
  { title: 'Finished bookmark', link: 'https://archiveofourown.org/works/9990090', source_list: 'bookmarks', chapters: '3/3', date: '2026-10-01', 'bookmark date': '2026-10-20' },
  { title: 'Earlier bookmark', link: 'https://archiveofourown.org/works/9990091', source_list: 'bookmarks', chapters: '3/3', date: '2026-10-20', 'bookmark date': '2026-10-10', 'chapter dates': '{"1":"2026-10-01","2":"2026-10-09","3":"2026-10-20"}' },
  { title: 'Other list', link: 'https://archiveofourown.org/works/9990092', source_list: 'marked_for_later' },
 ]) as CsvWork[]
 await submitLibrarySync(rows)
 const saved = (await loadSampleLibrary()).stories
 expect(saved.find(story => story.work.ao3_work_id === 9990090)).toMatchObject({ reading_status: 'finished', last_read_chapter: 3, finished_at: '2026-10-20T00:00:00Z' })
 expect(saved.find(story => story.work.ao3_work_id === 9990091)).toMatchObject({ reading_status: 'reading', last_read_chapter: 2, finished_at: null })
 expect(saved.find(story => story.work.ao3_work_id === 9990092)).toMatchObject({ reading_status: 'to_read', last_read_chapter: 0 })
})


it.each(['to_read', 'paused_reading', 'finished'] as const)('honors an explicit %s status for bookmark and Marked for Later imports', async status => {
 vi.useFakeTimers({ toFake: ['Date'] })
 vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
 try {
  const rows = readAo3Rows([
   { title: 'Bookmark', link: 'https://archiveofourown.org/works/9990093', source_list: 'bookmarks', chapters: '3/3', date: '2026-10-01', 'bookmark date': '2026-10-20' },
   { title: 'Marked for Later', link: 'https://archiveofourown.org/works/9990094', source_list: 'marked_for_later', chapters: '3/3' },
  ]) as CsvWork[]
  await submitLibrarySync(rows, undefined, status)
  const saved = (await loadSampleLibrary()).stories
  for (const id of [9990093, 9990094]) expect(saved.find(story => story.work.ao3_work_id === id)).toMatchObject({ reading_status: status, last_read_chapter: status === 'finished' ? 3 : 0, finished_at: status === 'finished' ? '2026-10-24T12:00:00.000Z' : null })
  await submitLibrarySync(rows, undefined, status === 'finished' ? 'to_read' : 'finished')
  expect((await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 9990093)?.reading_status).toBe(status)
 } finally { vi.useRealTimers() }
})
