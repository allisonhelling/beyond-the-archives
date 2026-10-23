import { LibrarySyncProvider } from './LibrarySyncProvider'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const mocks = vi.hoisted(() => ({ command: vi.fn(), connect: vi.fn(), submit: vi.fn(), collection: vi.fn(), preview: vi.fn(), sample: false }))
vi.mock('../../lib/sample-mode', () => ({ get sampleMode() { return mocks.sample } }))
vi.mock('./extension', () => ({ librarySyncCommand: mocks.command, connectExtension: mocks.connect }))
vi.mock('../library/repository', () => ({ saveCollection: mocks.collection }))
vi.mock('./repository', () => ({ submitLibrarySync: mocks.submit, previewSeries: mocks.preview }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refreshSeries: vi.fn() }) }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ session: { user: { id: 'test' } } }) }))
import { LibrarySyncForm } from './LibrarySyncForm'
const ready = { id: 'scan', status: 'ready', pages: 2, count: 2, skipped: 0, error: '' }
beforeEach(() => {
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
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
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', { url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', readingStatus: 'to_read', delaySeconds: 15, startPage: 2, endPage: 10 }))
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
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', { url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', readingStatus: 'to_read', delaySeconds: 60 }))
 expect(screen.getByText(/Ensure that bookmarks are sorted by "Date Bookmarked"/)).toBeVisible()
 expect(screen.queryByText(/Earlier or same-day bookmarks/)).not.toBeInTheDocument()
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
 mocks.submit.mockResolvedValue({ batch: null, imported: 0, kept: 1, bookmarkConflicts: [{ workId: 10, id: 'saved-bookmark', title: 'Changed bookmark', notes: 'Library note', tags: ['Library tag'], incomingNotes: 'AO3 note', incomingTags: ['AO3 tag'] }] })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 const summary = await screen.findByText('1 Bookmark Conflicts — Personal Data Kept')
 fireEvent.click(summary)
 expect(screen.getByRole('link', { name: 'Changed bookmark' })).toHaveAttribute('href', '/stories/saved-bookmark')
 expect(screen.getByText('Library note')).toBeVisible()
 expect(screen.getByText('AO3 note')).toBeVisible()
 expect(screen.getByText('Library tag')).toBeVisible()
 expect(screen.getByText('AO3 tag')).toBeVisible()
 expect(screen.getByText(/Non-empty AO3 metadata was refreshed; existing personal data was preserved/)).toBeVisible()
})

afterEach(() => vi.unstubAllGlobals())
it('prompts again when saving is declined, and prefills saved usernames for bookmark options', async () => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: 'Oceanbreeze7' } })
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ url: 'https://archiveofourown.org/users/Oceanbreeze7/bookmarks', autoImport: true })))
 fireEvent.click(screen.getByRole('button', { name: 'Import Marked for Later' }))
 expect(screen.getByRole('dialog')).toBeVisible()
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: 'Oceanbreeze7' } })
 fireEvent.click(screen.getByLabelText(/Save my AO3 username/))
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ url: 'https://archiveofourown.org/users/Oceanbreeze7/readings?show=to-read', autoImport: true })))
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 expect(screen.getByRole('dialog', { name: 'Import Bookmarks' })).toBeVisible()
 expect(screen.getByLabelText('AO3 Username')).toHaveValue('Oceanbreeze7')
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command.mock.calls.filter(([action]) => action === 'start')).toHaveLength(3))
 expect(screen.getByLabelText('AO3 List URL')).toBeEnabled()
})
it('automatically imports a completed username scan', async () => {
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state: { ...ready, autoImport: true } }
  if (action === 'page') return { rows: [{ title: 'Work', link: `https://archiveofourown.org/works/${options.page}`, source_list: 'marked_for_later' }] }
  return { state: { ...ready, status: 'complete' } }
 })
 const imported = vi.fn(async () => {})
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={imported} /></LibrarySyncProvider></MemoryRouter>)
 await waitFor(() => expect(imported).toHaveBeenCalledWith('batch'))
 expect(mocks.submit).toHaveBeenCalledTimes(2)
})

it('reuses a created collection when a page upload must be retried', async () => {
 const collectionId = '00000000-0000-4000-8000-000000000001'
 const collection = { name: 'AO3 Collection', description: 'Summary\n\nIntro' }
 const state = { ...ready, importToCollection: true, collection }
 mocks.collection.mockResolvedValue(collectionId)
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state }
  if (action === 'set-collection') return { state: { ...state, collectionId } }
  if (action === 'page') return { rows: [{ title: 'Work', link: `https://archiveofourown.org/works/${options.page}`, source_list: 'marked_for_later' }] }
  return { state: { ...state, status: 'complete' } }
 })
 mocks.submit.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue({ batch: 'batch', imported: 1, kept: 0 })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
 fireEvent.click(screen.getByRole('button', { name: 'Import Scanned Works' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('finish', { scanId: 'scan' }))
 expect(mocks.collection).toHaveBeenCalledTimes(1)
 expect(mocks.collection).toHaveBeenCalledWith('AO3 Collection', undefined, undefined, 'Summary\n\nIntro')
 expect(mocks.submit).toHaveBeenCalledWith(expect.any(Array), collectionId, undefined)
})

const seriesUrl = 'https://archiveofourown.org/series/99'
function scannedSeries(autoImport = false, direct = true) {
 const state = { ...ready, autoImport, seenSeries: [seriesUrl], seriesReviewVersion: 1 }
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state }
  if (action === 'page') return options.page === 1 ? { rows: direct ? [{ title: 'Direct work', link: 'https://archiveofourown.org/works/1', source_list: 'marked_for_later' }] : [] } : {
   seriesUrl, rows: [1, 2, 3].map(id => ({ title: `Work ${id}`, link: `https://archiveofourown.org/works/${id}`, source_list: 'marked_for_later' })),
  }
  return { state: { ...state, status: 'complete' } }
 })
 mocks.preview.mockResolvedValue({ seriesId: 99, normalizedUrl: seriesUrl, title: 'Series example', description: '', works: [1, 2, 3].map(id => ({ workId: id, url: `https://archiveofourown.org/works/${id}`, title: `Work ${id}`, position: id, authors: [], summary: '', tags: [], wordCount: null, chapters: '1/1', complete: true })) })
}

it('reviews scanned series with the shared picker before importing only chosen installments and direct works', async () => {
 scannedSeries()
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('heading', { name: 'Choose works from series' })).toBeVisible()
 expect(mocks.submit).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: 'Load works' }))
 expect(await screen.findByRole('checkbox', { name: 'Part 1: Work 1' })).toBeDisabled()
 fireEvent.click(screen.getByRole('checkbox', { name: 'Part 2: Work 2' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import selected scanned works' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('finish', { scanId: 'scan' }))
 expect(mocks.submit.mock.calls.map(([rows]) => rows.map((row: { workId: number }) => row.workId))).toEqual([[1], [2]])
})

it('pauses automatic username imports for series review and preserves the scan when canceled', async () => {
 scannedSeries(true)
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 await screen.findByRole('heading', { name: 'Choose works from series' })
 expect(mocks.submit).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: 'Back to scan' }))
 expect(screen.getByRole('button', { name: 'Import Scanned Works' })).toBeEnabled()
 expect(mocks.command.mock.calls.some(([action]) => ['finish', 'discard'].includes(action))).toBe(false)
})

it('can skip every series without importing any installments', async () => {
 scannedSeries(false, false)
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 fireEvent.click(await screen.findByRole('button', { name: 'Skip series' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import selected scanned works' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('finish', { scanId: 'scan' }))
 expect(mocks.submit).not.toHaveBeenCalled()
})

it('keeps the chosen series works through an interrupted upload and retry', async () => {
 scannedSeries()
 mocks.submit.mockResolvedValueOnce({ imported: 1, kept: 0, batch: 'first' }).mockRejectedValueOnce(new Error('Connection lost'))
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 fireEvent.click(await screen.findByRole('button', { name: 'Load works' }))
 fireEvent.click(await screen.findByRole('checkbox', { name: 'Part 2: Work 2' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import selected scanned works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
 expect(mocks.command.mock.calls.some(([action]) => action === 'finish')).toBe(false)
 fireEvent.click(screen.getByRole('button', { name: 'Import selected scanned works' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('finish', { scanId: 'scan' }))
 expect(mocks.submit.mock.calls.map(([rows]) => rows.map((row: { workId: number }) => row.workId))).toEqual([[1], [2], [1], [2]])
})

it('requires a new scan when legacy series checkpoints cannot identify their source', async () => {
 mocks.command.mockResolvedValue({ state: { ...ready, seenSeries: [seriesUrl] } })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('This scan predates series work selection')
 expect(mocks.submit).not.toHaveBeenCalled()
})

it('does not import direct works if a later checkpoint cannot be prepared for series review', async () => {
 scannedSeries()
 const command = mocks.command.getMockImplementation()!
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'page' && options.page === 2) throw new Error('Saved page is missing')
  return command(action, options)
 })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Saved page is missing')
 expect(mocks.submit).not.toHaveBeenCalled()
 expect(mocks.command.mock.calls.some(([action]) => action === 'finish')).toBe(false)
})

it('leaves chapter-date checks off by default and includes the option for an opted-in bookmark scan', async () => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 expect(within(screen.getByRole('group', { name: 'Scan Options' })).queryByRole('checkbox')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 const dialog = screen.getByRole('dialog', { name: 'Import Bookmarks' })
 expect(within(dialog).getByText('Earlier or same-day bookmarks are marked Currently Reading; chapter progress stays unconfirmed unless you enable the chapter-date check. Missing dates also mark bookmarks as Currently Reading with unconfirmed progress.')).toBeVisible()
 expect(within(dialog).getByText(/Earlier or same-day bookmarks/).compareDocumentPosition(within(dialog).getByLabelText('AO3 Username')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 const option = within(dialog).getByRole('checkbox', { name: 'Check chapter publication dates' })
 expect(option).not.toBeChecked()
 fireEvent.focus(within(dialog).getByRole('button', { name: 'Chapter publication dates information' }))
 expect(screen.getByRole('tooltip')).toHaveTextContent('Estimates chapters read by comparing each chapter’s publication date with the bookmark date. Chapters published on the bookmark date or with missing dates remain unconfirmed. Uses the scan tab to open eligible works’ Chapter Index pages so scans will take longer than usual.')
 fireEvent.blur(within(dialog).getByRole('button', { name: 'Chapter publication dates information' }))
 fireEvent.focus(within(dialog).getByRole('button', { name: 'Saved username information' }))
 expect(screen.getByRole('tooltip')).toHaveTextContent('View, change, or delete your saved username in Settings.')
 expect(within(dialog).getByRole('checkbox', { name: 'Save my AO3 username for future imports' })).toBeVisible()
 fireEvent.click(option)
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ autoImport: true, checkChapterDates: true })))
})

it('rejects an older extension that would silently ignore the requested chapter-date check', async () => {
 mocks.command.mockImplementation(async action => action === 'start' ? { state: { ...ready, status: 'running' } } : { state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 fireEvent.click(screen.getByRole('checkbox', { name: 'Check chapter publication dates' }))
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Rebuild and reload AO3 Library Companion')
 expect(mocks.command).toHaveBeenCalledWith('discard', { scanId: 'scan' })
})

it('does not carry bookmark chapter checks into Marked for Later or list URL imports', async () => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 fireEvent.click(screen.getByRole('checkbox', { name: 'Check chapter publication dates' }))
 fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import Marked for Later' }))
 expect(within(screen.getByRole('dialog')).getByText(/New Marked for Later works are saved as To Read/)).toBeVisible()
 expect(screen.queryByRole('checkbox', { name: 'Check chapter publication dates' })).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ url: 'https://archiveofourown.org/users/reader/readings?show=to-read' })))
 expect(mocks.command.mock.calls.find(([name]) => name === 'start')?.[1]).not.toHaveProperty('checkChapterDates')
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 await waitFor(() => expect(mocks.command.mock.calls.filter(([name]) => name === 'start')).toHaveLength(2))
 expect(mocks.command.mock.calls.filter(([name]) => name === 'start')[1][1]).not.toHaveProperty('checkChapterDates')
})
