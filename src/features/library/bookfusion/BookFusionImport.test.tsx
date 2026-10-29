import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { exampleWork } from '../display/display-examples'
import { BookFusionImport } from './BookFusionImport'

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), details: vi.fn(), save: vi.fn(), refresh: vi.fn() }))
vi.mock('../repository', () => ({ loadCatalog: mocks.catalog, loadStories: mocks.details, saveStory: mocks.save }))
vi.mock('../LibraryProvider', () => ({ useLibrary: () => ({ refresh: mocks.refresh }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.catalog.mockResolvedValue({ stories: [exampleWork] }); mocks.details.mockResolvedValue([exampleWork]); mocks.save.mockResolvedValue(exampleWork.id); mocks.refresh.mockResolvedValue(undefined) })
async function preview(url = 'https://www.bookfusion.com/reader/123') {
  render(<MemoryRouter><BookFusionImport /></MemoryRouter>)
  const file = new File([], 'mapping.csv')
  Object.defineProperty(file, 'text', { value: async () => `link,title,author,bookfusion_id,bookfusion_url\n${exampleWork.original_url},Title,Author,upload-id,${url}` })
  fireEvent.change(screen.getByLabelText('BookFusion Mapping CSV'), { target: { files: [file] } })
  await screen.findByRole('table')
}
it('previews exact matches without writing and saves only confirmed associations', async () => {
  await preview()
  expect(mocks.save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save Selected Links' }))
  await screen.findByText('Saved')
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: exampleWork.id, notes: exampleWork.notes, progress: exampleWork.last_read_chapter, metadataChanges: { bookfusion_link: { url: 'https://www.bookfusion.com/reader/123', kind: 'book' } } }))
})
it('requires a copied URL for upload identifiers and explicit selection after correction', async () => {
  await preview('')
  expect(screen.getByRole('checkbox')).toBeDisabled()
  fireEvent.change(screen.getByLabelText('BookFusion Link'), { target: { value: 'https://www.bookfusion.com/reader/456' } })
  expect(screen.getByRole('checkbox')).toBeEnabled()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})
it('retains failed rows for review without reporting success', async () => {
  mocks.save.mockRejectedValue(new Error('This fic changed on another device.'))
  await preview()
  fireEvent.click(screen.getByRole('button', { name: 'Save Selected Links' }))
  expect(await screen.findByText(/changed on another device/)).toBeVisible()
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  expect(within(screen.getByRole('table')).queryByText('Saved')).toBeNull()
})
