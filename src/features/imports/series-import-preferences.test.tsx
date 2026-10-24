import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SeriesImportOptions, SeriesImportSettings } from './SeriesImportOptions'
import { saveSeriesImportBehavior, useSeriesImportBehavior } from './series-import-preferences'
import { SeriesImportReview } from './SeriesImportReview'
const mocks = vi.hoisted(() => ({ preview: vi.fn(), remember: vi.fn() }))
vi.mock('../library/series/series-repository', () => ({ rememberSeries: mocks.remember }))
vi.mock('./repository', () => ({ previewSeries: mocks.preview }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refreshSeries: vi.fn() }) }))
beforeEach(() => {
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
 vi.clearAllMocks()
 mocks.preview.mockImplementation(async (url: string) => ({ seriesId: Number(url.split('/').at(-1)), title: 'Series', works: [1, 2].map(workId => ({ workId, url: `https://archiveofourown.org/works/${workId}`, title: `Work ${workId}`, authors: [], tags: [], summary: '', wordCount: null, chapters: '1/1', complete: true })) }))
})
afterEach(() => vi.unstubAllGlobals())
function Options() {
 const behavior = useSeriesImportBehavior()
 return <><SeriesImportOptions defaultBehavior={behavior.defaultBehavior} override={behavior.override} onChange={behavior.setOverride} /><output>{behavior.behavior}</output></>
}
it('saves the settings default and reverses checkbox wording without persisting an override', () => {
 const view = render(<><SeriesImportSettings /><Options /></>)
 expect(screen.getByText('Current series default: Choose works from each series.')).toBeVisible()
 fireEvent.click(screen.getByRole('checkbox', { name: 'Automatically save all series works for this import only' }))
 expect(screen.getByRole('status')).toHaveTextContent('all')
 fireEvent.change(screen.getByLabelText('When a series is encountered'), { target: { value: 'all' } })
 expect(screen.getByRole('checkbox', { name: 'Choose series works for this import only' })).toBeChecked()
 view.unmount()
 render(<Options />)
 expect(screen.getByRole('checkbox', { name: 'Choose series works for this import only' })).not.toBeChecked()
 expect(screen.getByRole('status')).toHaveTextContent('all')
})
it('automatically loads multiple series once, deduplicates overlaps and excludes saved/direct works', async () => {
 const confirm = vi.fn()
 render(<SeriesImportReview automatic text={'https://archiveofourown.org/series/7\nhttps://archiveofourown.org/series/8\nhttps://archiveofourown.org/works/1'} savedIds={new Set()} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
 expect(mocks.preview).toHaveBeenCalledTimes(2)
 expect(confirm.mock.calls[0][0].map((work: { workId: number }) => work.workId)).toEqual([2])
 expect(confirm.mock.calls[0][2]).toEqual([7, 8])
})
it('waits for a failed series preview to be retried before importing all works', async () => {
 mocks.preview.mockRejectedValueOnce(new Error('AO3 unavailable'))
 const confirm = vi.fn()
 render(<SeriesImportReview automatic text="https://archiveofourown.org/series/7" savedIds={new Set([1])} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(await screen.findByRole('alert')).toHaveTextContent('AO3 unavailable')
 expect(confirm).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }))
 await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
 expect(confirm.mock.calls[0][0].map((work: { workId: number }) => work.workId)).toEqual([2])
})
it('updates mounted import defaults when settings change', () => {
 render(<Options />)
 act(() => saveSeriesImportBehavior('all'))
 expect(screen.getByRole('checkbox', { name: 'Choose series works for this import only' })).not.toBeChecked()
})

it('keeps already saved series works without submitting an empty automatic import', async () => {
 const confirm = vi.fn()
 render(<SeriesImportReview automatic text="https://archiveofourown.org/series/7" savedIds={new Set([1, 2])} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(await screen.findByText('No new available series works to import. Already saved works are kept.')).toBeVisible()
 expect(confirm).not.toHaveBeenCalled()
})

it('opens a popup, loads every series, and provides bulk controls without importing works', async () => {
 const confirm = vi.fn()
 render(<SeriesImportReview text={'https://archiveofourown.org/series/7\nhttps://archiveofourown.org/series/8'} savedIds={new Set([1])} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(await screen.findByRole('dialog', { name: 'Choose Works From Series' })).toBeVisible()
 const saveAll = screen.getByRole('button', { name: 'Save All Series' })
 await waitFor(() => expect(saveAll).toBeEnabled())
 expect(mocks.preview).toHaveBeenCalledTimes(2)
 expect(screen.queryByRole('button', { name: 'Load works' })).not.toBeInTheDocument()
 const save = screen.getAllByRole('button', { name: 'Save' })[0]
 expect(saveAll).toHaveAccessibleDescription(save.getAttribute('aria-describedby') ? document.getElementById(save.getAttribute('aria-describedby')!)!.textContent! : '')
 fireEvent.click(screen.getByRole('button', { name: 'Hide All' }))
 await waitFor(() => expect(screen.getAllByText('Summary').every(node => !node.parentElement!.hasAttribute('open'))).toBe(true))
 expect(screen.getAllByText('Tags').every(node => !node.parentElement!.hasAttribute('open'))).toBe(true)
 fireEvent.click(screen.getAllByText('Summary')[0])
 await waitFor(() => expect(screen.getAllByText('Summary')[0].parentElement).toHaveAttribute('open'))
 expect(screen.getAllByText('Tags')[0].parentElement).not.toHaveAttribute('open')
 fireEvent.click(screen.getByRole('button', { name: 'Select All' }))
 expect(screen.getAllByRole('checkbox', { name: 'Work 2' }).every(input => (input as HTMLInputElement).checked)).toBe(true)
 fireEvent.click(saveAll)
 await waitFor(() => expect(mocks.remember).toHaveBeenCalledTimes(2))
 expect(confirm).not.toHaveBeenCalled()
 expect(screen.getAllByRole('button', { name: 'Full series details saved' })).toHaveLength(2)
})
