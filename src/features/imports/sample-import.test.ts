import { readFileSync } from 'node:fs'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ connect: vi.fn(), capture: vi.fn() }))
vi.mock('./extension', () => ({ connectExtension: mocks.connect, captureWorkWithExtension: mocks.capture }))
import { importSampleWorkUrls } from './sample-import'
import { importSampleWorks, loadSampleLibrary, updateSampleEntry } from '../library/sample/repository'
const html = readFileSync('server/ao3/fixtures/work.html', 'utf8')
beforeEach(() => {
 const items = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) })
 vi.clearAllMocks(); mocks.connect.mockResolvedValue(true); mocks.capture.mockResolvedValue({ url: 'https://archiveofourown.org/works/123', html })
})
afterEach(() => vi.unstubAllGlobals())
it('reuses the AO3 parser and sample store for pasted links, verified chapter progress and series membership', async () => {
 await importSampleWorkUrls(['https://archiveofourown.org/works/123/chapters/960', 'https://archiveofourown.org/works/123'], 'to_read', [77])
 const library = await loadSampleLibrary(), saved = library.stories.find(story => story.work.ao3_work_id === 123)!
 expect(saved).toMatchObject({ metadata: { title: 'A & B', authors: ['One', 'Two'], word_count: 12345 }, last_read_chapter: 0 })
 expect(mocks.capture).toHaveBeenCalledTimes(1)
 expect(library.series.some(series => series.ao3_series_id === 77)).toBe(true)
 await updateSampleEntry(saved.id, { notes: 'Personal note' })
 await importSampleWorkUrls(['https://archiveofourown.org/works/123'], 'finished', [])
 expect(mocks.capture).toHaveBeenCalledTimes(1)
 expect((await loadSampleLibrary()).stories.find(story => story.id === saved.id)?.notes).toBe('Personal note')
})
it('sets progress only when the pasted chapter identity is verified', async () => {
 await importSampleWorkUrls(['https://archiveofourown.org/works/123/chapters/960'], 'to_read', [])
 expect((await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 123)).toMatchObject({ reading_status: 'reading', last_read_chapter: 5 })
})
it('keeps progress unchanged for a metadata-only request and rejects mismatched captures', async () => {
 await importSampleWorkUrls(['https://archiveofourown.org/works/123/chapters/960'], 'to_read', [], false)
 expect((await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 123)?.last_read_chapter).toBe(0)
 mocks.capture.mockResolvedValue({ url: 'https://archiveofourown.org/works/999', html })
 await expect(importSampleWorkUrls(['https://archiveofourown.org/works/456'], 'to_read', [])).rejects.toThrow('another work')
})

it('allows later bookmark imports to refresh automatically captured sample metadata', async () => {
 await importSampleWorkUrls(['https://archiveofourown.org/works/123'], 'to_read', [])
 await importSampleWorks([{ source: 'bookmarks', workId: 123, url: 'https://archiveofourown.org/works/123', metadata: { title: 'Latest AO3 title', kudos: 0 }, bookmarkDate: null, updatedDate: null, notes: 'Bookmark notes', tags: [] }])
 expect((await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 123)).toMatchObject({ metadata: { title: 'Latest AO3 title', kudos: 0 }, notes: '', reading_status: 'to_read', metadata_overrides: {} })
})

it('imports a Wayback snapshot into the sample library using its original archived destination', async () => {
 const url = 'https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/123?view_full_work=true'
 mocks.capture.mockResolvedValue({ url, html })
 await importSampleWorkUrls([url], 'to_read', [])
 expect(mocks.capture).toHaveBeenCalledWith(url)
 expect((await loadSampleLibrary()).stories.find(story => story.work.ao3_work_id === 123)).toMatchObject({ original_url: url, metadata: { title: 'A & B', authors: ['One', 'Two'] }, last_read_chapter: 0 })
})
