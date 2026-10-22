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

it('keeps deleted bookmarks and only updates existing deletion status during enabled full scans', async () => {
 const normal = readAo3Rows([{ title: 'The Stars Between Us', author: 'ExampleAuthor', fandoms: 'Star Wars', summary: 'Original summary', source_list: 'bookmarks', work_status: 'available', 'bookmark id': '8101', 'bookmark status': 'private', 'bookmark date': '2026-10-20', date: '2026-10-01', chapters: '8/8', 'bookmark notes': 'Loved chapter 8!', 'bookmark tags': 'Favorites, To Reread', link: 'https://archiveofourown.org/works/9990020' }]) as CsvWork[]
 await submitLibrarySync(normal)
 const before = (await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 9990020)!
 const gone = readAo3Rows([{ title: '', source_list: 'bookmarks', work_status: 'deleted', 'bookmark id': '8101', link: 'https://archiveofourown.org/bookmarks/8101', 'bookmark notes': 'Different notes', 'bookmark tags': 'Other' }]) as CsvWork[]
 await submitLibrarySync(gone, { mode: 'quick' })
 expect((await loadSampleLibrary()).stories.find(story => story.id === before.id)?.work_status).toBe('available')
 await submitLibrarySync(gone, { updateDeleted: false })
 expect((await loadSampleLibrary()).stories.find(story => story.id === before.id)?.work_status).toBe('available')
 const result = await submitLibrarySync(gone)
 expect(result).toMatchObject({ imported: 0, kept: 1, bookmarkConflicts: [{ workId: null, bookmarkId: 8101 }] })
 expect((await loadSampleLibrary()).stories.find(story => story.id === before.id)).toMatchObject({ work_status: 'deleted', metadata: before.metadata, notes: before.notes, personalTags: before.personalTags, reading_status: before.reading_status, last_read_chapter: before.last_read_chapter, finished_at: before.finished_at })
})
it('imports new bookmark-only deletions in Quick Sync and allows editing without a work URL', async () => {
 const deleted = (id: number) => ({ source_list: 'bookmarks', work_status: 'deleted', title: '', 'bookmark id': String(id), link: `https://archiveofourown.org/bookmarks/${id}`, 'bookmark notes': 'Saved note', 'bookmark tags': 'Favorite' })
 const rows = readAo3Rows([deleted(8201), deleted(8202)]) as CsvWork[]
 expect(await submitLibrarySync(rows, { mode: 'quick' })).toMatchObject({ imported: 2, kept: 0 })
 const saved = (await loadSampleLibrary()).stories.find(story => story.original_url === rows[0].url)!
 expect(saved).toMatchObject({ work_status: 'deleted', work: { ao3_work_id: null }, metadata: { title: 'Deleted Work — Bookmark #8201', authors: [], fandoms: [] }, notes: 'Saved note', personalTags: ['Favorite'], extension_metadata: { publication_status: 'unknown' }, metadata_overrides: {} })
 const { saveSampleStory } = await import('../library/sample/repository')
 await saveSampleStory({ id: saved.id, url: saved.original_url, metadata: saved.metadata, notes: 'Edited note', tags: ['Edited tag'], status: saved.reading_status, progress: saved.last_read_chapter, favorite: false, personalRating: null, collections: [] })
 expect((await loadSampleLibrary()).stories.find(story => story.id === saved.id)).toMatchObject({ notes: 'Edited note', personalTags: ['Edited tag'], work_status: 'deleted' })
 expect(await submitLibrarySync(rows)).toMatchObject({ imported: 0, kept: 2 })
 expect(rpc).not.toHaveBeenCalled()
})
