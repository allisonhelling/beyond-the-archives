import { LibrarySyncProvider } from './LibrarySyncProvider'
import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const mocks = vi.hoisted(() => ({ command: vi.fn(), connect: vi.fn(), submit: vi.fn(), sample: false }))
vi.mock('../../lib/sample-mode', () => ({ get sampleMode() { return mocks.sample } }))
vi.mock('./extension', () => ({ librarySyncCommand: mocks.command, connectExtension: mocks.connect }))
vi.mock('./repository', () => ({ submitLibrarySync: mocks.submit }))
import { LibrarySyncForm } from './LibrarySyncForm'
const ready = { id: 'scan', status: 'ready', pages: 2, count: 2, skipped: 0, error: '' }
beforeEach(() => {
 vi.clearAllMocks(); mocks.sample = false; mocks.connect.mockResolvedValue(true)
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state: ready }
  if (action === 'page') return { rows: [{ title: `Work ${options.page}`, link: `https://archiveofourown.org/works/${options.page}`, source_list: 'marked_for_later' }] }
  return { state: { ...ready, status: 'complete' } }
 })
 mocks.submit.mockResolvedValue({ batch: 'batch', imported: 1, kept: 0 })
})
it('imports saved listing pages through the shared row conversion and acknowledges only after all pages save', async () => {
 const onImported = vi.fn(async () => {})
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={onImported} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 await waitFor(() => expect(onImported).toHaveBeenCalledWith('batch'))
 expect(mocks.submit).toHaveBeenCalledTimes(2)
 expect(mocks.submit.mock.calls[0][0][0]).toMatchObject({ workId: 1, source: 'marked_for_later', metadata: { title: 'Work 1' } })
 expect(mocks.command).toHaveBeenLastCalledWith('finish', { scanId: 'scan' })
 expect(screen.getByText(/Imported 2 works/)).toBeVisible()
})
it('preserves completed scan checkpoints and never acknowledges an incomplete upload', async () => {
 mocks.submit.mockResolvedValueOnce({ imported: 1, kept: 0, batch: 'first' }).mockRejectedValueOnce(new Error('Connection lost'))
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
 expect(mocks.command.mock.calls.some(([action]) => action === 'finish')).toBe(false)
 expect(screen.getByRole('button', { name: 'Import Scanned Works' })).toBeEnabled()
})

it('offers optional start/end pages in the full app and sends the inclusive range', async () => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByLabelText(/Start Page/), { target: { value: '2' } })
 fireEvent.change(screen.getByLabelText(/End Page/), { target: { value: '10' } })
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/alice/bookmarks' } })
 fireEvent.click(screen.getByRole('button', { name: 'Start Library Scan' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', { url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', delaySeconds: 15, startPage: 2, endPage: 10 }))
})
it('shows page limits only for Full Library Scan and clears them for Quick Sync', () => {
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByLabelText(/Start Page/), { target: { value: '7' } })
 fireEvent.change(screen.getByLabelText('Scan Mode'), { target: { value: 'quick' } })
 expect(screen.queryByRole('group', { name: 'Limit Full Library Scan (Optional)' })).not.toBeInTheDocument()
 expect(screen.queryByLabelText(/Start Page/)).not.toBeInTheDocument()
 expect(screen.queryByLabelText(/End Page/)).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Scan Mode'), { target: { value: 'full' } })
 expect(screen.getByRole('group', { name: 'Limit Full Library Scan (Optional)' })).toBeVisible()
 expect(screen.queryByLabelText('Update Deleted Work Status')).not.toBeInTheDocument()
 expect(screen.queryByText(/Deleted-work bookmarks are kept/)).not.toBeInTheDocument()
 expect(screen.getByLabelText(/Start Page/)).toHaveValue(null)
 expect(screen.getByLabelText(/End Page/)).toHaveValue(null)
})
it('imports ranged checkpoints using their original AO3 page numbers', async () => {
 mocks.command.mockImplementation(async action => action === 'status' ? { state: { ...ready, startPage: 8 } } : action === 'page' ? { rows: [] } : { state: { ...ready, status: 'complete' } })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('finish', { scanId: 'scan' }))
 expect(mocks.command).toHaveBeenCalledWith('page', { page: 8, scanId: 'scan' })
 expect(mocks.command).toHaveBeenCalledWith('page', { page: 9, scanId: 'scan' })
})
it('connects sample mode to the local extension without a sign-in', async () => {
 mocks.sample = true
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 await waitFor(() => expect(mocks.connect).toHaveBeenCalled())
 expect(screen.getByText(/save only to this browser’s sample library/)).toBeVisible()
 expect(await screen.findByRole('button', { name: 'Import Scanned Works' })).toBeEnabled()
})

it('sends the chosen request interval and explains bookmark sorting and reading status', async () => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/alice/bookmarks' } })
 fireEvent.change(screen.getByLabelText(/^Time Between Page Requests/), { target: { value: '60' } })
 fireEvent.click(screen.getByRole('button', { name: 'Start Library Scan' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', { url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', delaySeconds: 60 }))
 expect(screen.getByText(/Ensure that bookmarks are sorted by "Date Bookmarked"/)).toBeVisible()
 expect(screen.getByText(/Earlier or same-day bookmarks are marked Reading/)).toBeVisible()
 expect(screen.queryByText(/CSV importer’s reading-status rules/)).not.toBeInTheDocument()
})

it('lets a paused scan use a new interval without losing its saved pages', async () => {
 mocks.command.mockImplementation(async action => ({ state: { ...ready, status: 'paused', delaySeconds: action === 'set-delay' ? 120 : 60 } }))
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 await screen.findByRole('button', { name: 'Apply Request Interval' })
 expect(screen.getByLabelText(/^Time Between Page Requests/)).toHaveValue(60)
 fireEvent.change(screen.getByLabelText(/^Time Between Page Requests/), { target: { value: '120' } })
 fireEvent.click(screen.getByRole('button', { name: 'Apply Request Interval' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('set-delay', { scanId: 'scan', delaySeconds: 120 }))
 expect(screen.getByLabelText(/^Time Between Page Requests/)).toHaveValue(120)
})

it('reports affected bookmark works after sync while keeping existing personal data', async () => {
 mocks.submit.mockResolvedValue({ batch: null, imported: 0, kept: 1, bookmarkConflicts: [{ workId: 10, id: 'saved-bookmark', title: 'Changed bookmark' }] })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 const summary = await screen.findByText('1 Bookmark Conflicts — Personal Data Kept')
 fireEvent.click(summary)
 expect(screen.getByRole('link', { name: 'Changed bookmark' })).toHaveAttribute('href', '/stories/saved-bookmark')
 expect(screen.getByText(/Non-empty AO3 metadata was refreshed; existing personal data was preserved/)).toBeVisible()
})
