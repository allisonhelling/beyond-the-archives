import { saveSeriesImportBehavior } from './series-import-preferences'
import { LibrarySyncProvider } from './LibrarySyncProvider'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const mocks = vi.hoisted(() => ({ command: vi.fn(), connect: vi.fn(), submit: vi.fn(), collection: vi.fn(), preview: vi.fn(), reports: vi.fn(), sample: false }))
vi.mock('../../lib/sample-mode', () => ({ get sampleMode() { return mocks.sample } }))
vi.mock('./extension', () => ({ librarySyncCommand: mocks.command, connectExtension: mocks.connect }))
vi.mock('../library/repository', () => ({ saveCollection: mocks.collection }))
vi.mock('./library-sync-reports', () => ({ librarySyncReports: mocks.reports }))
vi.mock('./repository', () => ({ submitLibrarySync: mocks.submit, previewSeries: mocks.preview }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refreshSeries: vi.fn() }) }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ session: { user: { id: 'test' } } }) }))
import { LibrarySyncForm } from './LibrarySyncForm'
const ready = { id: 'scan', status: 'ready', pages: 2, count: 2, skipped: 0, error: '' }
beforeEach(() => {
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
 vi.clearAllMocks(); mocks.reports.mockResolvedValue({ reports: [], total: 0 }); mocks.sample = false; mocks.connect.mockResolvedValue(true)
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
 expect(mocks.reports).toHaveBeenCalledWith(1, ready)
 expect(mocks.reports.mock.invocationCallOrder[0]).toBeLessThan(mocks.command.mock.invocationCallOrder.at(-1)!)
 expect(screen.getByText(/Imported 2 works/)).toBeVisible()
})
it('keeps scan checkpoints available when the report cannot be saved', async () => {
 mocks.reports.mockRejectedValueOnce(new Error('Report save failed'))
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Report save failed')
 expect(mocks.command.mock.calls.some(([action]) => action === 'finish')).toBe(false)
 expect(screen.getByRole('button', { name: 'Import Scanned Works' })).toBeEnabled()
})

it('archives the latest completed legacy scan when opening saved reports', async () => {
 const legacy = { ...ready, status: 'complete', url: 'https://archiveofourown.org/users/alice/bookmarks', skipped: 4 }
 mocks.command.mockResolvedValue({ state: legacy })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 await screen.findByRole('button', { name: '4 Unsupported Entries Skipped' })
 fireEvent.click(screen.getByRole('button', { name: 'View Saved Sync Reports' }))
 await waitFor(() => expect(mocks.reports).toHaveBeenCalledWith(1, legacy))
})

it('loads saved reports without a live extension scan and opens detailed skipped and chapter-date results', async () => {
 mocks.command.mockResolvedValue({ state: null })
 const issue = { title: 'Hidden Bookmark', url: 'https://archiveofourown.org/bookmarks/12', sourceUrl: 'https://archiveofourown.org/users/alice/bookmarks?page=4', reason: 'No AO3 work link was available.' }
 const dates = { title: 'Incomplete Work', url: 'https://archiveofourown.org/works/34', sourceUrl: 'https://archiveofourown.org/works/34/navigate', reason: 'The index was incomplete.', expectedChapters: 5, foundChapters: 3 }
 mocks.reports.mockResolvedValue({ reports: [{ id: 'saved', completed_at: '2026-10-24T12:00:00Z', report: { ...ready, status: 'complete', autoImport: true, url: 'https://archiveofourown.org/users/alice/bookmarks', listPages: 117, pages: 117, count: 2037, skipped: 4, checkChapterDates: true, chapterDatesChecked: 201, chapterDatesUnavailable: 2, skippedEntries: [issue], chapterDateIssues: [dates] } }], total: 1 })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(screen.getByRole('button', { name: 'View Saved Sync Reports' }))
 expect(await screen.findByText(/117 Bookmark pages saved · 117 total pages saved · 2037 works collected/)).toBeVisible()
 fireEvent.click(screen.getByRole('button', { name: '4 Unsupported Entries Skipped' }))
 let dialog = screen.getByRole('dialog', { name: 'Skipped AO3 Entries' })
 expect(within(dialog).getByRole('link', { name: 'Hidden Bookmark' })).toHaveAttribute('href', issue.url)
 expect(within(dialog).getByRole('link', { name: 'Open Source Listing' })).toHaveAttribute('href', issue.sourceUrl)
 expect(within(dialog).getByText(issue.reason)).toBeVisible()
 expect(within(dialog).getByText(/Details for 3 entries were not captured/)).toBeVisible()
 fireEvent.click(within(dialog).getByRole('button', { name: /Close/ }))
 fireEvent.click(screen.getByRole('button', { name: '2 Unavailable or Incomplete' }))
 dialog = screen.getByRole('dialog', { name: 'Unavailable or Incomplete Chapter Dates' })
 expect(within(dialog).getByRole('link', { name: 'Incomplete Work' })).toHaveAttribute('href', dates.url)
 expect(within(dialog).getByRole('link', { name: 'Open Chapter Index' })).toHaveAttribute('href', dates.sourceUrl)
 expect(within(dialog).getByText('3 of 5 chapter dates available.')).toBeVisible()
})
it('preserves completed scan checkpoints and never acknowledges an incomplete upload', async () => {
 mocks.submit.mockResolvedValueOnce({ imported: 1, kept: 0, batch: 'first' }).mockRejectedValueOnce(new Error('Connection lost'))
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
 expect(mocks.command.mock.calls.some(([action]) => action === 'finish')).toBe(false)
 expect(screen.getByRole('button', { name: 'Import Scanned Works' })).toBeEnabled()
})

it.each(['discard now', 'reload older discarded scan'])('hides discarded scan details and stale errors: %s', async scenario => {
 const oldError = 'AO3 listing capture failed: Failed to construct URL: Invalid URL. Saved pages are preserved.'
 let state = { ...ready, status: scenario === 'discard now' ? 'ready' : 'discarded', error: oldError, limited: true, startPage: 1, endPage: 2, checkChapterDates: true, chapterDatesChecked: 0, chapterDatesUnavailable: 0 }
 mocks.command.mockImplementation(async action => {
  // Older builds keep the previous error in their discard reply and storage.
  if (action === 'discard') state = { ...state, status: 'discarded' }
  return { state }
 })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 if (scenario === 'discard now') {
  expect(await screen.findByText(oldError)).toBeVisible()
  expect(screen.getByText(/Partial scan · pages 1–2/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Discard Scan' }))
 }
 expect(await screen.findByText('Scan discarded.')).toHaveAttribute('role', 'status')
 expect(screen.queryByText(oldError)).not.toBeInTheDocument()
 expect(screen.queryByText(/total pages saved/)).not.toBeInTheDocument()
 expect(screen.queryByText(/Chapter Dates:/)).not.toBeInTheDocument()
 expect(screen.queryByText(/Partial scan ·/)).not.toBeInTheDocument()
 expect(screen.queryByRole('button', { name: 'Discard Scan' })).not.toBeInTheDocument()
 expect(screen.queryByRole('button', { name: 'Import Scanned Works' })).not.toBeInTheDocument()
 expect(screen.getByLabelText('AO3 List URL')).toBeEnabled()
 expect(screen.getByRole('button', { name: 'Import from List' })).toBeEnabled()
 expect(mocks.command.mock.calls.some(([action]) => ['start', 'resume', 'page'].includes(action))).toBe(false)
})

it('offers optional start/end pages in the full app and sends the inclusive range', async () => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByLabelText(/Start Page/), { target: { value: '2' } })
 fireEvent.change(screen.getByLabelText(/End Page/), { target: { value: '10' } })
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/alice/bookmarks' } })
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', { url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', seriesBehavior: 'choose', readingStatus: 'to_read', delaySeconds: 15, startPage: 2, endPage: 10 }))
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
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', { url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', seriesBehavior: 'choose', readingStatus: 'to_read', delaySeconds: 60 }))
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
 fireEvent.click(screen.getByLabelText(/Save My AO3 Username/))
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
 expect(mocks.submit).toHaveBeenCalledWith(expect.any(Array), collectionId, undefined, { id: ready.id, url: undefined })
})

const seriesUrl = 'https://archiveofourown.org/series/99'
function scannedSeries(autoImport = false, direct = true) {
 const state = { ...ready, autoImport, seenSeries: [seriesUrl], seriesReviewVersion: 1 }
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state }
  if (action === 'page') return options.page === 1 ? { rows: direct ? [{ title: 'Direct work', link: 'https://archiveofourown.org/works/1', source_list: 'marked_for_later' }] : [] } : {
   seriesUrl, seriesPreview: { seriesId: 99, normalizedUrl: seriesUrl, title: 'Series example', description: '', works: [1, 2, 3].map(id => ({ workId: id, url: `https://archiveofourown.org/works/${id}`, title: `Work ${id}`, position: id, authors: [], summary: '', tags: [], wordCount: null, chapters: '1/1', complete: true })) }, rows: [1, 2, 3].map(id => ({ title: `Work ${id}`, link: `https://archiveofourown.org/works/${id}`, source_list: 'marked_for_later' })),
  }
  return { state: { ...state, status: 'complete' } }
 })
 mocks.preview.mockResolvedValue({ seriesId: 99, normalizedUrl: seriesUrl, title: 'Series example', description: '', works: [1, 2, 3].map(id => ({ workId: id, url: `https://archiveofourown.org/works/${id}`, title: `Work ${id}`, position: id, authors: [], summary: '', tags: [], wordCount: null, chapters: '1/1', complete: true })) })
}

it('reviews scanned series with the shared picker before importing only chosen installments and direct works', async () => {
 scannedSeries()
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('heading', { name: 'Choose Works From Series' })).toBeVisible()
 expect(mocks.preview).not.toHaveBeenCalled()
 expect(mocks.submit).not.toHaveBeenCalled()
 expect(await screen.findByRole('checkbox', { name: 'Part 1: Work 1' })).toBeDisabled()
 fireEvent.click(screen.getByRole('checkbox', { name: 'Part 2: Work 2' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected Works' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('finish', { scanId: 'scan' }))
 expect(mocks.submit.mock.calls.map(([rows]) => rows.map((row: { workId: number }) => row.workId))).toEqual([[1], [2]])
})

it('loads the name once for older series checkpoints and preserves their combined scanned works', async () => {
 mocks.preview.mockResolvedValue({ seriesId: 99, normalizedUrl: seriesUrl, title: 'The actual series name', description: '', works: [{ workId: 999, title: 'New unscanned work' }] })
 const state = { ...ready, seenSeries: [seriesUrl], seriesReviewVersion: 1 }
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state }
  if (action === 'page') return { seriesUrl, rows: [options.page, options.page + 1].map(id => ({ title: `Work ${id}`, link: `https://archiveofourown.org/works/${id}`, source_list: 'marked_for_later' })) }
  return { state: { ...state, status: 'complete' } }
 })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('link', { name: 'The actual series name • Series 99' })).toHaveAttribute('href', seriesUrl)
 expect(within(screen.getByRole('dialog')).getAllByRole('checkbox')).toHaveLength(3)
 expect(screen.getByRole('checkbox', { name: 'Work 3' })).toBeEnabled()
 expect(screen.queryByRole('checkbox', { name: 'New unscanned work' })).not.toBeInTheDocument()
 expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(seriesUrl, { firstPageOnly: true, viaExtension: true })
 expect(mocks.submit).not.toHaveBeenCalled()
})

it('keeps scanned works available when an older checkpoint’s series name cannot be retrieved', async () => {
 mocks.preview.mockRejectedValue(new Error('AO3 unavailable'))
 const state = { ...ready, seenSeries: [seriesUrl], seriesReviewVersion: 1 }
 mocks.command.mockImplementation(async action => action === 'page' ? { seriesUrl, rows: [{ title: 'Saved installment', link: 'https://archiveofourown.org/works/1', source_list: 'marked_for_later' }] } : { state })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 expect(await screen.findByRole('link', { name: 'Series Name Unavailable • Series 99' })).toHaveAttribute('href', seriesUrl)
 expect(screen.getByRole('checkbox', { name: 'Saved installment' })).toBeEnabled()
 expect(screen.getByRole('alert')).toHaveTextContent('Your scanned works are still available')
 expect(screen.getByRole('alert')).toHaveTextContent('AO3 unavailable')
 expect(mocks.submit).not.toHaveBeenCalled()
})

it('pauses automatic username imports for series review and preserves the scan when canceled', async () => {
 scannedSeries(true)
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 await screen.findByRole('heading', { name: 'Choose Works From Series' })
 expect(mocks.submit).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
 expect(screen.getByRole('button', { name: 'Import Scanned Works' })).toBeEnabled()
 expect(mocks.command.mock.calls.some(([action]) => ['finish', 'discard'].includes(action))).toBe(false)
})

it('can skip every series without importing any installments', async () => {
 scannedSeries(false, false)
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 fireEvent.click(await screen.findByRole('button', { name: 'Skip Series' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected Works' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('finish', { scanId: 'scan' }))
 expect(mocks.submit).not.toHaveBeenCalled()
})

it('keeps the chosen series works through an interrupted upload and retry', async () => {
 scannedSeries()
 mocks.submit.mockResolvedValueOnce({ imported: 1, kept: 0, batch: 'first' }).mockRejectedValueOnce(new Error('Connection lost'))
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 fireEvent.click(await screen.findByRole('checkbox', { name: 'Part 2: Work 2' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected Works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
 expect(mocks.command.mock.calls.some(([action]) => action === 'finish')).toBe(false)
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected Works' }))
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
 expect(within(screen.getByRole('group', { name: 'Scan Options' })).getByRole('checkbox', { name: 'Automatically Save All Series Works for This Import Only' })).not.toBeChecked()
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 const dialog = screen.getByRole('dialog', { name: 'Import Bookmarks' })
 expect(within(dialog).getByText('Earlier or same-day bookmarks are marked Currently Reading; chapter progress stays unconfirmed unless you enable the chapter-date check. Missing dates also mark bookmarks as Currently Reading with unconfirmed progress.')).toBeVisible()
 expect(within(dialog).getByText(/Earlier or same-day bookmarks/).compareDocumentPosition(within(dialog).getByLabelText('AO3 Username')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 const option = within(dialog).getByRole('checkbox', { name: 'Check chapter publication dates' })
 expect(option).not.toBeChecked()
 fireEvent.focus(within(dialog).getByRole('button', { name: 'Chapter Publication Dates Information' }))
 expect(screen.getByRole('tooltip')).toHaveTextContent('Estimates chapters read by comparing each chapter’s publication date with the bookmark date. Chapters published on the bookmark date or with missing dates remain unconfirmed. Uses the scan tab to open eligible works’ Chapter Index pages so scans will take longer than usual.')
 fireEvent.blur(within(dialog).getByRole('button', { name: 'Chapter Publication Dates Information' }))
 fireEvent.focus(within(dialog).getByRole('button', { name: 'Saved Username Information' }))
 expect(screen.getByRole('tooltip')).toHaveTextContent('View, change, or delete your saved username in Settings.')
 expect(within(dialog).getByRole('checkbox', { name: 'Save My AO3 Username for Future Imports' })).toBeVisible()
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
 fireEvent.click(screen.getByRole('button', { name: 'Close Dialog' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import Marked for Later' }))
 expect(within(screen.getByRole('dialog')).getByText(/New Marked for Later works are saved as To Read/)).toBeVisible()
 expect(screen.queryByRole('checkbox', { name: 'Check chapter publication dates' })).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ url: 'https://archiveofourown.org/users/reader/readings?show=to-read' })))
 expect(mocks.command.mock.calls.find(([name]) => name === 'start')?.[1]).not.toHaveProperty('checkChapterDates')
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/reader/works' } })
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 await waitFor(() => expect(mocks.command.mock.calls.filter(([name]) => name === 'start')).toHaveLength(2))
 expect(mocks.command.mock.calls.filter(([name]) => name === 'start')[1][1]).not.toHaveProperty('checkChapterDates')
})

it.each([
 [true, 'https://archiveofourown.org/users/alice/bookmarks', 'Bookmark'],
 [true, 'https://archiveofourown.org/users/alice/readings?show=to-read', 'Marked for Later'],
 [false, 'https://archiveofourown.org/users/alice/bookmarks', 'List'],
])('shows separate primary and total page counts for autoImport=%s, %s', async (autoImport, url, label) => {
 mocks.command.mockResolvedValue({ state: { ...ready, status: 'running', autoImport, url, listPages: 2, pages: 4 } })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 expect(await screen.findByText(`running · 2 ${label} pages saved · 4 total pages saved · 2 works collected · 0 unsupported entries skipped`)).toBeVisible()
})

it('shows only the total when an older extension cannot supply a primary-list count', async () => {
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 expect(await screen.findByText('ready · 2 total pages saved · 2 works collected · 0 unsupported entries skipped')).toBeVisible()
})

it('imports all series checkpoints with the all default without reopening series previews', async () => {
 saveSeriesImportBehavior('all')
 scannedSeries()
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('finish', { scanId: 'scan' }))
 expect(mocks.submit.mock.calls.flatMap(([rows]) => rows.map((row: { workId: number }) => row.workId))).toEqual([1, 1, 2, 3])
 expect(mocks.preview).not.toHaveBeenCalled()
 expect(screen.queryByRole('heading', { name: 'Choose Works From Series' })).not.toBeInTheDocument()
})

it('can temporarily choose works when the saved default imports all', async () => {
 saveSeriesImportBehavior('all')
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(screen.getByRole('checkbox', { name: 'Choose Series Works for This Import Only' }))
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/alice/bookmarks' } })
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ seriesBehavior: 'choose' })))
})

it.each(['Import Bookmarks', 'Import Marked for Later'])('%s always opens the username popup with defaults independent of the list status', async label => {
 mocks.command.mockResolvedValue({ state: null })
 localStorage.setItem('between-chapters:ao3-username:test', 'SavedReader')
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' }), { target: { value: 'paused_reading' } })
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/OtherReader/works' } })
 fireEvent.click(screen.getByRole('button', { name: label }))
 const dialog = within(screen.getByRole('dialog', { name: label }))
 expect(dialog.getByLabelText('AO3 Username')).toHaveValue('SavedReader')
 expect(dialog.getByRole('checkbox', { name: 'Save My AO3 Username for Future Imports' })).toBeChecked()
 expect(dialog.getByRole('checkbox', { name: 'Manually Set Reading Status' })).not.toBeChecked()
 expect(dialog.queryByRole('combobox', { name: 'Reading Status for Username Import' })).not.toBeInTheDocument()
 expect(mocks.command.mock.calls.some(([action]) => action === 'start')).toBe(false)
 fireEvent.click(dialog.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ autoImport: true, url: `https://archiveofourown.org/users/SavedReader/${label === 'Import Bookmarks' ? 'bookmarks' : 'readings?show=to-read'}` })))
 expect(mocks.command.mock.calls.find(([action]) => action === 'start')![1]).not.toHaveProperty('readingStatus')
 expect(screen.getByLabelText('AO3 List URL')).toHaveValue('https://archiveofourown.org/users/OtherReader/works')
 expect(screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' })).toHaveValue('paused_reading')
})

it.each(['Import Bookmarks', 'Import Marked for Later'])('%s applies only its own explicit manual status and can return to default logic', async label => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' }), { target: { value: 'finished' } })
 fireEvent.click(screen.getByRole('button', { name: label }))
 const dialog = within(screen.getByRole('dialog', { name: label }))
 fireEvent.change(dialog.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.click(dialog.getByRole('checkbox', { name: 'Manually Set Reading Status' }))
 fireEvent.change(dialog.getByRole('combobox', { name: 'Reading Status for Username Import' }), { target: { value: 'paused_reading' } })
 fireEvent.click(dialog.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ autoImport: true, readingStatus: 'paused_reading' })))
 fireEvent.click(screen.getByRole('button', { name: label }))
 const reopened = within(screen.getByRole('dialog', { name: label }))
 expect(reopened.getByRole('checkbox', { name: 'Manually Set Reading Status' })).not.toBeChecked()
 fireEvent.change(reopened.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.click(reopened.getByRole('checkbox', { name: 'Manually Set Reading Status' }))
 fireEvent.change(reopened.getByRole('combobox', { name: 'Reading Status for Username Import' }), { target: { value: 'to_read' } })
 fireEvent.click(reopened.getByRole('checkbox', { name: 'Manually Set Reading Status' }))
 fireEvent.click(reopened.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command.mock.calls.filter(([action]) => action === 'start')).toHaveLength(2))
 expect(mocks.command.mock.calls.filter(([action]) => action === 'start')[1][1]).not.toHaveProperty('readingStatus')
})

it('keeps a manually entered list URL status through import submission', async () => {
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state: null }
  if (action === 'start') return { state: { ...ready, ...options, autoImport: false, pages: 1 } }
  if (action === 'page') return { rows: [{ title: 'Bookmark', link: 'https://archiveofourown.org/works/20', source_list: 'bookmarks' }] }
  return { state: { ...ready, status: 'complete' } }
 })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/reader/bookmarks' } })
 fireEvent.change(screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' }), { target: { value: 'finished' } })
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 fireEvent.click(await screen.findByRole('button', { name: 'Import Scanned Works' }))
 await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith([expect.objectContaining({ source: 'bookmarks' })], undefined, 'finished', { id: ready.id, url: 'https://archiveofourown.org/users/reader/bookmarks' }))
})

it('keeps a username manual status through automatic saved-page import without changing the list selector', async () => {
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state: null }
  if (action === 'start') return { state: { ...ready, ...options, pages: 1 } }
  if (action === 'page') return { rows: [{ title: 'Bookmark', link: 'https://archiveofourown.org/works/20', source_list: 'bookmarks' }] }
  return { state: { ...ready, status: 'complete' } }
 })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' }), { target: { value: 'finished' } })
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.click(screen.getByRole('checkbox', { name: 'Manually Set Reading Status' }))
 fireEvent.change(screen.getByRole('combobox', { name: 'Reading Status for Username Import' }), { target: { value: 'paused_reading' } })
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith([expect.objectContaining({ source: 'bookmarks' })], undefined, 'paused_reading', { id: ready.id, url: 'https://archiveofourown.org/users/reader/bookmarks' }))
 expect(screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' })).toHaveValue('finished')
})

it('rejects an older extension that would drop a username manual status', async () => {
 mocks.command.mockImplementation(async action => action === 'start' ? { state: { ...ready, status: 'running', autoImport: true } } : { state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.click(screen.getByRole('checkbox', { name: 'Manually Set Reading Status' }))
 fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('before using manual reading status')
 expect(mocks.command).toHaveBeenCalledWith('discard', { scanId: 'scan' })
 expect(mocks.submit).not.toHaveBeenCalled()
})

it.each([false, true])('uses dynamic bookmark inference for list URLs with chapter-date checks %s', async checkDates => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 const select = screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' })
 expect(within(select).getByRole('option', { name: 'Dynamic (Bookmarks)' })).toBeInTheDocument()
 expect(screen.queryByRole('checkbox', { name: 'Check chapter publication dates' })).not.toBeInTheDocument()
 fireEvent.change(select, { target: { value: 'dynamic_bookmarks' } })
 const check = screen.getByRole('checkbox', { name: 'Check chapter publication dates' })
 expect(check).not.toBeChecked()
 if (checkDates) fireEvent.click(check)
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/reader/bookmarks' } })
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', {
  url: 'https://archiveofourown.org/users/reader/bookmarks', mode: 'full', seriesBehavior: 'choose', delaySeconds: 15, ...(checkDates ? { checkChapterDates: true } : {}),
 }))
})

it('hides and ignores dynamic chapter-date checks when a fixed list status is selected', async () => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 const select = screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' })
 fireEvent.change(select, { target: { value: 'dynamic_bookmarks' } })
 fireEvent.click(screen.getByRole('checkbox', { name: 'Check chapter publication dates' }))
 fireEvent.change(select, { target: { value: 'paused_reading' } })
 expect(screen.queryByRole('checkbox', { name: 'Check chapter publication dates' })).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('AO3 List URL'), { target: { value: 'https://archiveofourown.org/users/reader/bookmarks' } })
 fireEvent.click(screen.getByRole('button', { name: 'Import from List' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', { url: 'https://archiveofourown.org/users/reader/bookmarks', mode: 'full', seriesBehavior: 'choose', delaySeconds: 15, readingStatus: 'paused_reading' }))
})

it('restores dynamic list selections from saved scans and sends no fixed status when importing their pages', async () => {
 const state = { ...ready, autoImport: false, checkChapterDates: true, pages: 1 }
 mocks.command.mockImplementation(async action => {
  if (action === 'status') return { state }
  if (action === 'page') return { rows: [{ title: 'Dated bookmark', source_list: 'bookmarks', link: 'https://archiveofourown.org/works/20', chapters: '3/3', date: '2026-10-20', 'bookmark date': '2026-10-10', 'chapter dates': '{"1":"2026-10-01","2":"2026-10-09","3":"2026-10-20"}' }] }
  return { state: { ...state, status: 'complete' } }
 })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 const importButton = await screen.findByRole('button', { name: 'Import Scanned Works' })
 expect(screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' })).toHaveValue('dynamic_bookmarks')
 const check = screen.getByRole('checkbox', { name: 'Check chapter publication dates' })
 expect(check).toBeChecked()
 expect(check).toBeDisabled()
 fireEvent.click(importButton)
 await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith([expect.objectContaining({ source: 'bookmarks', metadata: expect.objectContaining({ chapter_dates: { '1': '2026-10-01', '2': '2026-10-09', '3': '2026-10-20' } }) })], undefined, undefined, { id: ready.id, url: undefined }))
})

it.each(['Import Bookmarks', 'Import Marked for Later'])('keeps Dynamic (Bookmarks) and list chapter preferences out of the %s status selector', async title => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.change(screen.getByRole('combobox', { name: 'Reading Status for AO3 list URL' }), { target: { value: 'dynamic_bookmarks' } })
 fireEvent.click(screen.getByRole('checkbox', { name: 'Check chapter publication dates' }))
 fireEvent.click(screen.getByRole('button', { name: title }))
 const dialog = within(screen.getByRole('dialog', { name: title }))
 fireEvent.click(dialog.getByRole('checkbox', { name: 'Manually Set Reading Status' }))
 expect(within(dialog.getByRole('combobox', { name: 'Reading Status for Username Import' })).queryByRole('option', { name: 'Dynamic (Bookmarks)' })).not.toBeInTheDocument()
 if (title === 'Import Bookmarks') expect(dialog.getByRole('checkbox', { name: 'Check chapter publication dates' })).not.toBeChecked()
 else expect(dialog.queryByRole('checkbox', { name: 'Check chapter publication dates' })).not.toBeInTheDocument()
 fireEvent.change(dialog.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.change(dialog.getByRole('combobox', { name: 'Reading Status for Username Import' }), { target: { value: 'finished' } })
 fireEvent.click(dialog.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ autoImport: true, readingStatus: 'finished' })))
 expect(mocks.command.mock.calls.find(([action]) => action === 'start')![1]).not.toHaveProperty('checkChapterDates')
})


it('places manual bookmark status below chapter dates, disables date checks, and omits them from manual imports', async () => {
 mocks.command.mockResolvedValue({ state: null })
 render(<MemoryRouter><LibrarySyncProvider><LibrarySyncForm onImported={vi.fn()} /></LibrarySyncProvider></MemoryRouter>)
 fireEvent.click(screen.getByRole('button', { name: 'Import Bookmarks' }))
 const dialog = within(screen.getByRole('dialog', { name: 'Import Bookmarks' }))
 const dates = dialog.getByRole('checkbox', { name: 'Check chapter publication dates' })
 const manual = dialog.getByRole('checkbox', { name: 'Manually Set Reading Status' })
 expect(dates.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.click(dates)
 fireEvent.click(manual)
 expect(dates).toBeDisabled()
 expect(dates.closest('label')).toHaveAttribute('aria-disabled', 'true')
 fireEvent.click(manual)
 expect(dates).toBeEnabled()
 expect(dates).toBeChecked()
 fireEvent.click(manual)
 fireEvent.change(dialog.getByLabelText('AO3 Username'), { target: { value: 'reader' } })
 fireEvent.change(dialog.getByRole('combobox', { name: 'Reading Status for Username Import' }), { target: { value: 'reading' } })
 fireEvent.click(dialog.getByRole('button', { name: 'Start Import' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('start', expect.objectContaining({ autoImport: true, readingStatus: 'reading' })))
 expect(mocks.command.mock.calls.find(([action]) => action === 'start')![1]).not.toHaveProperty('checkChapterDates')
})
