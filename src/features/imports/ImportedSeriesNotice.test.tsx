import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ history: vi.fn(), submit: vi.fn(), preview: vi.fn(), remember: vi.fn(), refresh: vi.fn(), stories: [{ id: 'saved-101', work: { ao3_work_id: 101 }, metadata: { title: 'Saved fic', series_memberships: [{ id: 77, name: 'Related series', url: 'https://archiveofourown.org/series/77', position: 1 }] } }] }))
vi.mock('./repository', () => ({ importHistory: mocks.history, submitImport: mocks.submit, previewSeries: mocks.preview }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ stories: mocks.stories, refresh: mocks.refresh, refreshSeries: mocks.refresh }) }))
vi.mock('../library/series/series-repository', () => ({ rememberSeries: mocks.remember }))
import { ImportedSeriesNotice, CompletedImportSeriesNotice } from './ImportedSeriesNotice'
const showModal = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close
beforeAll(() => {
 HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
 HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterAll(() => { HTMLDialogElement.prototype.showModal = showModal; HTMLDialogElement.prototype.close = close })
beforeEach(() => {
 vi.resetAllMocks(); vi.useFakeTimers()
 mocks.remember.mockResolvedValue('series-record')
 mocks.refresh.mockResolvedValue(undefined); mocks.submit.mockResolvedValue('related-batch')
 mocks.history.mockResolvedValue({ items: [{ entry_id: 'saved-101', status: 'completed', metadata_status: 'pending' }], jobs: [{ status: 'pending' }] })
 mocks.preview.mockResolvedValue({ seriesId: 77, normalizedUrl: 'https://archiveofourown.org/series/77', title: 'Related series', works: [101, 102].map(id => ({ workId: id, url: `https://archiveofourown.org/works/${id}`, position: id - 100, title: `Fic ${id}`, authors: [], wordCount: 0, chapters: '1/1', complete: true, summary: '', tags: [] })) })
})
afterEach(() => vi.useRealTimers())
it('waits for completed metadata, then offers an explicit picker that excludes saved works', async () => {
 await act(async () => { render(<CompletedImportSeriesNotice reviewRelatedSeries batchId="original-batch" />) })
 expect(screen.queryByRole('dialog', { name: 'Related Series' })).not.toBeInTheDocument()
 expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled()
 mocks.history.mockResolvedValue({ items: [{ entry_id: 'saved-101', status: 'completed', metadata_status: 'completed' }], jobs: [{ status: 'completed' }] })
 await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
 expect(screen.getByRole('dialog', { name: 'Related Series' })).toBeVisible()
 expect(screen.getByText('Saved fic')).toBeVisible()
 expect(mocks.refresh).toHaveBeenCalledOnce()
 expect(mocks.preview).toHaveBeenCalledWith('https://archiveofourown.org/series/77', { signal: expect.any(AbortSignal) })
 fireEvent.click(screen.getAllByRole('button', { name: 'Show Series Works' })[0])
 expect(screen.getByRole('checkbox', { name: 'Part 1: Fic 101' })).toBeDisabled()
 expect(screen.getByRole('checkbox', { name: 'Part 2: Fic 102' })).not.toBeChecked()
 expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.remember).not.toHaveBeenCalled()
 fireEvent.click(screen.getAllByRole('button', { name: 'Select All' })[0])
 await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import Selected Works' })) })
 expect(mocks.submit).toHaveBeenCalledWith('https://archiveofourown.org/works/102', false, 'to_read', [77])
})

it('keeps related-series selection without offering Save for a series already represented in the library', async () => {
 await act(async () => { render(<ImportedSeriesNotice reviewRelatedSeries stories={mocks.stories as never} />) })
 expect(mocks.remember).not.toHaveBeenCalled()
 fireEvent.click(screen.getAllByRole('button', { name: 'Show Series Works' })[0])
 fireEvent.click(screen.getByRole('checkbox', { name: 'Part 2: Fic 102' }))
 expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
 expect(screen.queryByRole('button', { name: 'Save All Series' })).not.toBeInTheDocument()
 expect(screen.getByRole('checkbox', { name: 'Part 2: Fic 102' })).toBeChecked()
 expect(mocks.submit).not.toHaveBeenCalled()
})
it('deduplicates shared series and stays dismissed when the library refreshes', async () => {
 const stories = [...mocks.stories, { ...mocks.stories[0], id: 'second', metadata: { ...mocks.stories[0].metadata, title: 'Other fic' } }]
 let view!: ReturnType<typeof render>
 await act(async () => { view = render(<ImportedSeriesNotice reviewRelatedSeries stories={stories as never} />) })
 expect(screen.getAllByRole('link', { name: 'Related series • Series 77' })).toHaveLength(1)
 fireEvent.click(screen.getByRole('button', { name: 'Close Dialog' }))
 view.rerender(<ImportedSeriesNotice reviewRelatedSeries stories={[...stories] as never} />)
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(mocks.preview).toHaveBeenCalledOnce()
 expect(mocks.remember).not.toHaveBeenCalled()
})
it('keeps the preview and selections available after a failed selected-work import', async () => {
 mocks.submit.mockRejectedValue(new Error('Import unavailable'))
 await act(async () => { render(<ImportedSeriesNotice reviewRelatedSeries stories={mocks.stories as never} />) })
 fireEvent.click(screen.getAllByRole('button', { name: 'Show Series Works' })[0])
 fireEvent.click(screen.getByRole('checkbox', { name: 'Part 2: Fic 102' }))
 await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import Selected Works' })) })
 expect(screen.getByRole('alert')).toHaveTextContent('Import unavailable')
 expect(screen.getByRole('checkbox', { name: 'Part 2: Fic 102' })).toBeEnabled()
 expect(mocks.submit).toHaveBeenCalledOnce()
})

it('does not discover or retrieve related series unless the import opted in', async () => {
 await act(async()=>{render(<><CompletedImportSeriesNotice batchId="original-batch" /><ImportedSeriesNotice stories={mocks.stories as never} /></>)})
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000)})
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(mocks.history).not.toHaveBeenCalled()
 expect(mocks.preview).not.toHaveBeenCalled()
 expect(mocks.refresh).not.toHaveBeenCalled()
})

it('does not request another review for directly supplied series already reviewed in this import', async () => {
 await act(async()=>{render(<ImportedSeriesNotice reviewRelatedSeries reviewedSeriesIds={[77]} stories={mocks.stories as never} />)})
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(mocks.preview).not.toHaveBeenCalled()
})
