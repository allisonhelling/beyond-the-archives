import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const mocks = vi.hoisted(() => ({ command: vi.fn(), connect: vi.fn(), submit: vi.fn() }))
vi.mock('./extension', () => ({ librarySyncCommand: mocks.command, connectExtension: mocks.connect }))
vi.mock('./repository', () => ({ submitLibrarySync: mocks.submit }))
import { LibrarySyncForm } from './LibrarySyncForm'
const ready = { id: 'scan', status: 'ready', pages: 2, count: 2, skipped: 0, error: '' }
beforeEach(() => {
 vi.clearAllMocks(); mocks.connect.mockResolvedValue(true)
 mocks.command.mockImplementation(async (action, options) => {
  if (action === 'status') return { state: ready }
  if (action === 'page') return { rows: [{ title: `Work ${options.page}`, link: `https://archiveofourown.org/works/${options.page}`, source_list: 'marked_for_later' }] }
  return { state: { ...ready, status: 'complete' } }
 })
 mocks.submit.mockResolvedValue({ batch: 'batch', imported: 1, kept: 0 })
})
it('imports saved listing pages through the shared row conversion and acknowledges only after all pages save', async () => {
 const onImported = vi.fn(async () => {})
 render(<MemoryRouter><LibrarySyncForm onImported={onImported} /></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import scanned works' }))
 await waitFor(() => expect(onImported).toHaveBeenCalledWith('batch'))
 expect(mocks.submit).toHaveBeenCalledTimes(2)
 expect(mocks.submit.mock.calls[0][0][0]).toMatchObject({ workId: 1, source: 'marked_for_later', metadata: { title: 'Work 1' } })
 expect(mocks.command).toHaveBeenLastCalledWith('finish', { scanId: 'scan' })
 expect(screen.getByText(/Imported 2 works/)).toBeVisible()
})
it('preserves completed scan checkpoints and never acknowledges an incomplete upload', async () => {
 mocks.submit.mockResolvedValueOnce({ imported: 1, kept: 0, batch: 'first' }).mockRejectedValueOnce(new Error('Connection lost'))
 render(<MemoryRouter><LibrarySyncForm onImported={vi.fn()} /></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: 'Import scanned works' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
 expect(mocks.command.mock.calls.some(([action]) => action === 'finish')).toBe(false)
 expect(screen.getByRole('button', { name: 'Import scanned works' })).toBeEnabled()
})
