import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { exampleWork } from './display/display-examples'
import { StoryForm } from './StoryForm'
import { epubBuffer, epubFiles } from '../../test/epub-fixture'
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }))
vi.mock('./repository', () => ({ saveStory: mocks.save }))
vi.mock('./LibraryProvider', () => ({ useLibrary: () => ({ collections: [], refreshStory: mocks.refresh }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue(exampleWork.id); mocks.refresh.mockResolvedValue(undefined) })
it.each([6, null])('finishes the published chapters, preserving progress when counts are unknown (%s)', async published => {
 const story = { ...exampleWork, reading_status: 'reading' as const, last_read_chapter: 2, metadata: { ...exampleWork.metadata, published_chapters: published, total_chapters: null } }
 render(<MemoryRouter><StoryForm story={story} section="reading" onCancel={() => {}} /></MemoryRouter>)
 fireEvent.change(screen.getByRole('combobox', { name: 'Reading Status' }), { target: { value: 'finished' } })
 const progress = screen.getByRole('spinbutton', { name: /^Last Fully Read Chapter/ })
 expect(progress).toHaveValue(published ?? 2)
 fireEvent.submit(progress.closest('form')!)
 await waitFor(() => expect(mocks.save).toHaveBeenCalled())
 expect(mocks.save.mock.calls[0][0]).toMatchObject({ status: 'finished', progress: published ?? 2, notes: story.notes })
})

it('includes rating help and a Rec choice in manual entry and sends the saved choice', async () => {
 render(<MemoryRouter><StoryForm /></MemoryRouter>)
 expect(screen.getByRole('button', { name: 'Personal Rating Info' })).toBeVisible()
 fireEvent.change(screen.getByLabelText('AO3 URL'), { target: { value: 'https://archiveofourown.org/works/456' } })
 fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Manual story' } })
 fireEvent.click(screen.getByRole('button', { name: 'Mark as Rec' }))
 fireEvent.click(screen.getByRole('button', { name: 'Save Story' }))
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ rec: true })))
})

async function uploadEpub(files = epubFiles()) {
 const buffer = await epubBuffer(files)
 const file = new File([buffer], 'recovered.epub', { type: 'application/epub+zip' })
 Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
 fireEvent.change(screen.getByLabelText('Recover Metadata from EPUB'), { target: { files: [file] } })
}
it('populates a new work for review and saves only after confirmation, including a corrected summary and Deleted status', async () => {
 render(<MemoryRouter><StoryForm /></MemoryRouter>)
 await uploadEpub()
 await screen.findByText(/EPUB metadata loaded/)
 expect(mocks.save).not.toHaveBeenCalled()
 expect(screen.getByLabelText('AO3 URL')).toHaveValue('https://archiveofourown.org/works/8001')
 expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('Recovered & Remembered')
 expect(screen.getByLabelText('Relationship Tags (one per line)')).toHaveValue('A/B')
 fireEvent.change(screen.getByLabelText('Summary', { exact: true }), { target: { value: 'My corrected summary' } })
 fireEvent.change(screen.getByLabelText('AO3 Publication Status'), { target: { value: 'deleted' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save Story' }))
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://archiveofourown.org/works/8001', metadata: expect.objectContaining({ summary: 'My corrected summary', publication_status: 'deleted', word_count: 12345 }), status: 'to_read', progress: 0 })))
 expect(JSON.stringify(mocks.save.mock.calls[0][0])).not.toContain('PRIVATE CHAPTER')
})
it('recovers an existing deleted work through the metadata editor while preserving personal fields and its edit baseline', async () => {
 const story = { ...exampleWork, metadata: { ...exampleWork.metadata, publication_status: 'deleted' as const }, notes: 'Personal notes', last_read_chapter: 2, personal_rating: 4, is_favorite: true }
 render(<MemoryRouter><StoryForm story={story} section="metadata" onCancel={() => {}} /></MemoryRouter>)
 await uploadEpub(epubFiles({ source: story.original_url }))
 await screen.findByText(/EPUB metadata loaded/)
 expect(screen.getByLabelText('AO3 Publication Status')).toHaveValue('deleted')
 fireEvent.submit(screen.getByLabelText('Title', { exact: true }).closest('form')!)
 await waitFor(() => expect(mocks.save).toHaveBeenCalled())
 expect(mocks.save.mock.calls[0][0]).toMatchObject({ id: story.id, status: story.reading_status, progress: 2, notes: 'Personal notes', personalRating: 4, favorite: true, tags: story.personalTags, collections: story.collectionIds, base: { progress: 2 }, metadataChanges: { title: 'Recovered & Remembered' } })
})
it('rejects another work’s EPUB without replacing the current metadata draft', async () => {
 render(<MemoryRouter><StoryForm story={exampleWork} section="metadata" /></MemoryRouter>)
 fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'My unsaved title' } })
 await uploadEpub()
 expect(await screen.findByRole('alert')).toHaveTextContent('different AO3 work')
 expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('My unsaved title')
 expect(mocks.save).not.toHaveBeenCalled()
})
it('preserves missing metadata and draft fields and requests the original URL when absent', async () => {
 render(<MemoryRouter><StoryForm /></MemoryRouter>)
 fireEvent.change(screen.getByLabelText('Fandoms (one per line)'), { target: { value: 'My fandom' } })
 await uploadEpub(epubFiles({ source: '', preface: false }))
 expect(await screen.findByText(/The original AO3 URL was not found/)).toBeVisible()
 expect(screen.getByLabelText('Fandoms (one per line)')).toHaveValue('My fandom')
 expect(screen.getByLabelText('AO3 URL')).toHaveValue('')
 expect(mocks.save).not.toHaveBeenCalled()
})

it('saves, distinguishes, and removes BookFusion links through private metadata overrides', async () => {
 render(<MemoryRouter><StoryForm story={exampleWork} section="metadata" onCancel={() => {}} /></MemoryRouter>)
 const url = 'https://www.bookfusion.com/reader/123?location=chapter-2'
 fireEvent.change(screen.getByLabelText('BookFusion Link'), { target: { value: url } })
 fireEvent.click(screen.getByRole('button', { name: 'Save Story' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Choose Bookmark')
 expect(mocks.save).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('BookFusion Link Type'), { target: { value: 'bookmark' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save Story' }))
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ metadataChanges: expect.objectContaining({ bookfusion_link: { url, kind: 'bookmark' } }) })))
 fireEvent.change(screen.getByLabelText('BookFusion Link'), { target: { value: '' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save Story' }))
 await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ metadataChanges: expect.objectContaining({ bookfusion_link: null }) })))
})
