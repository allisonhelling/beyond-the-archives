import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { exampleWork } from './display/display-examples'
import { StoryForm } from './StoryForm'
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }))
vi.mock('./repository', () => ({ saveStory: mocks.save }))
vi.mock('./LibraryProvider', () => ({ useLibrary: () => ({ collections: [], refreshStory: mocks.refresh }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue(exampleWork.id); mocks.refresh.mockResolvedValue(undefined) })
it.each([6, null])('finishes the published chapters, preserving progress when counts are unknown (%s)', async published => {
 const story = { ...exampleWork, reading_status: 'reading' as const, last_read_chapter: 2, metadata: { ...exampleWork.metadata, published_chapters: published, total_chapters: null } }
 render(<MemoryRouter><StoryForm story={story} section="reading" onCancel={() => {}} /></MemoryRouter>)
 fireEvent.change(screen.getByRole('combobox', { name: 'Reading status' }), { target: { value: 'finished' } })
 const progress = screen.getByRole('spinbutton', { name: /^Last fully read chapter/ })
 expect(progress).toHaveValue(published ?? 2)
 fireEvent.submit(progress.closest('form')!)
 await waitFor(() => expect(mocks.save).toHaveBeenCalled())
 expect(mocks.save.mock.calls[0][0]).toMatchObject({ status: 'finished', progress: published ?? 2, notes: story.notes })
})

it('includes rating help and a Rec choice in manual entry and sends the saved choice', async () => {
 render(<MemoryRouter><StoryForm /></MemoryRouter>)
 expect(screen.getByRole('button', { name: 'Personal rating info' })).toBeVisible()
 fireEvent.change(screen.getByLabelText('AO3 URL'), { target: { value: 'https://archiveofourown.org/works/456' } })
 fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Manual story' } })
 fireEvent.click(screen.getByRole('button', { name: 'Mark as Rec' }))
 fireEvent.click(screen.getByRole('button', { name: 'Save story' }))
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ rec: true })))
})
