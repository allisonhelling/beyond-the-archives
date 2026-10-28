import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SeriesImportOptions, SeriesImportSettings } from './SeriesImportOptions'
import { saveSeriesImportBehavior, useSeriesImportBehavior } from './series-import-preferences'
import { SeriesImportReview } from './SeriesImportReview'
const mocks = vi.hoisted(() => ({ preview: vi.fn(), remember: vi.fn(), series: [] as { ao3_series_id: number }[], stories: [] as { metadata?: { series_memberships?: { id: number; name: string; url: string; position: number | null }[] }; work: { ao3_work_id: number } }[] }))
vi.mock('../library/series/series-repository', () => ({ rememberSeries: mocks.remember }))
vi.mock('./repository', () => ({ previewSeries: mocks.preview }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refreshSeries: vi.fn(), stories: mocks.stories, series: mocks.series }) }))
beforeEach(() => {
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
 mocks.stories = []; mocks.series = []
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
 expect(screen.getByText('Current series default: Choose Works from Each Series.')).toBeVisible()
 fireEvent.click(screen.getByRole('checkbox', { name: 'Automatically Save All Series Works for This Import Only' }))
 expect(screen.getByRole('status')).toHaveTextContent('all')
 fireEvent.change(screen.getByLabelText('When a Series Is Encountered'), { target: { value: 'all' } })
 expect(screen.getByRole('checkbox', { name: 'Choose Series Works for This Import Only' })).toBeChecked()
 view.unmount()
 render(<Options />)
 expect(screen.getByRole('checkbox', { name: 'Choose Series Works for This Import Only' })).not.toBeChecked()
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
 fireEvent.click(screen.getByRole('button', { name: 'Retry Preview' }))
 await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
 expect(confirm.mock.calls[0][0].map((work: { workId: number }) => work.workId)).toEqual([2])
})
it('updates mounted import defaults when settings change', () => {
 render(<Options />)
 act(() => saveSeriesImportBehavior('all'))
 expect(screen.getByRole('checkbox', { name: 'Choose Series Works for This Import Only' })).not.toBeChecked()
})

it('keeps already saved series works without submitting an empty automatic import', async () => {
 const confirm = vi.fn()
 render(<SeriesImportReview automatic text="https://archiveofourown.org/series/7" savedIds={new Set([1, 2])} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(await screen.findByText('No new available series works to import. Already saved works are kept.')).toBeVisible()
 expect(confirm).not.toHaveBeenCalled()
})

async function openSeriesReview() {
 const confirm = vi.fn()
 render(<SeriesImportReview text={'https://archiveofourown.org/series/7\nhttps://archiveofourown.org/series/8'} savedIds={new Set([1])} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(await screen.findByRole('dialog', { name: 'Choose Works From Series' })).toBeVisible()
 const saveAll = screen.getByRole('button', { name: 'Save All Series' })
 await waitFor(() => expect(saveAll).toBeEnabled())
 expect(mocks.preview).toHaveBeenCalledTimes(2)
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
 for (const button of screen.getAllByRole('button', { name: 'Show Series Works' })) fireEvent.click(button)
 expect(screen.queryByRole('button', { name: 'Load works' })).not.toBeInTheDocument()
 return { confirm, saveAll }
}

it('opens a popup, loads every series, and applies top controls to all series', async () => {
 const { confirm } = await openSeriesReview()
 const globalTop = within(screen.getByRole('group', { name: 'All Series Top Controls' }))
 expect(globalTop.getAllByRole('button').map(button => button.textContent)).toEqual(['Select All', 'Clear Selection', 'View All', 'Hide All'])
 for (const button of globalTop.getAllByRole('button')) expect(button).toHaveAccessibleDescription('Applies to all series')
 fireEvent.mouseEnter(globalTop.getByRole('button', { name: 'Hide All' }).parentElement!)
 expect(screen.getByRole('tooltip')).toHaveTextContent('Applies to all series')
 fireEvent.mouseLeave(globalTop.getByRole('button', { name: 'Hide All' }).parentElement!)
 fireEvent.click(globalTop.getByRole('button', { name: 'Select All' }))
 expect(screen.getAllByRole('checkbox', { name: 'Work 2' }).every(input => (input as HTMLInputElement).checked)).toBe(true)
 fireEvent.click(globalTop.getByRole('button', { name: 'Clear Selection' }))
 expect(screen.getAllByRole('checkbox', { name: 'Work 2' }).every(input => !(input as HTMLInputElement).checked)).toBe(true)
 fireEvent.click(globalTop.getByRole('button', { name: 'Hide All' }))
 await waitFor(() => expect(screen.getAllByText('Summary').every(node => !node.parentElement!.hasAttribute('open'))).toBe(true))
 fireEvent.click(globalTop.getByRole('button', { name: 'View All' }))
 await waitFor(() => expect(screen.getAllByText('Summary').every(node => node.parentElement!.hasAttribute('open'))).toBe(true))
 expect(confirm).not.toHaveBeenCalled()
 expect(mocks.remember).not.toHaveBeenCalled()
})

it('applies series controls only to their series and synchronizes top and footer controls', async () => {
 const { confirm } = await openSeriesReview()
 const firstSeries = within(screen.getByRole('region', { name: 'Series • Series 7' }))
 const secondSeries = within(screen.getByRole('region', { name: 'Series • Series 8' }))
 const top = within(firstSeries.getByRole('group', { name: 'Series Selection Controls' }))
 const footer = within(firstSeries.getByRole('group', { name: 'Series Footer Controls' }))
 for (const button of top.getAllByRole('button').filter(button => button.textContent !== 'Hide Series Works')) expect(button).toHaveAccessibleDescription('Applies to Series')
 fireEvent.focus(top.getByRole('button', { name: 'Select All' }))
 expect(screen.getByRole('tooltip')).toHaveTextContent('Applies to Series')
 fireEvent.blur(top.getByRole('button', { name: 'Select All' }))
 fireEvent.click(top.getByRole('button', { name: 'Select All' }))
 expect(firstSeries.getByRole('checkbox', { name: 'Work 2' })).toBeChecked()
 expect(secondSeries.getByRole('checkbox', { name: 'Work 2' })).not.toBeChecked()
 fireEvent.click(footer.getByRole('button', { name: 'Clear Selection' }))
 expect(firstSeries.getByRole('checkbox', { name: 'Work 2' })).not.toBeChecked()
 fireEvent.click(top.getByRole('button', { name: 'Hide All' }))
 await waitFor(() => expect(footer.getByRole('button', { name: 'View All' })).toHaveAttribute('aria-expanded', 'false'))
 expect(top.queryByRole('button', { name: 'Hide All' })).not.toBeInTheDocument()
 fireEvent.click(footer.getByRole('button', { name: 'View All' }))
 await waitFor(() => expect(top.getByRole('button', { name: 'Hide All' })).toHaveAttribute('aria-expanded', 'true'))
 expect(screen.queryByRole('button', { name: 'Skip Series' })).not.toBeInTheDocument()
 expect(footer.getAllByRole('button')[0]).toHaveTextContent('Save')
 expect(confirm).not.toHaveBeenCalled()
 expect(mocks.remember).not.toHaveBeenCalled()
})

it('applies footer controls to all series and saves details without importing works', async () => {
 const { confirm, saveAll } = await openSeriesReview()
 const allControls = document.querySelector('[aria-label="All Series Controls"]')!
 expect(within(allControls as HTMLElement).getAllByRole('button').map(button => button.textContent)).toEqual(['Save All Series', 'Hide All', 'Select All'])
 for (const name of ['Hide All', 'Select All']) expect(within(allControls as HTMLElement).getByRole('button', { name })).toHaveAccessibleDescription('Applies to all series')
 const save = screen.getAllByRole('button', { name: 'Save' })[0]
 expect(saveAll).toHaveAccessibleDescription(save.getAttribute('aria-describedby') ? document.getElementById(save.getAttribute('aria-describedby')!)!.textContent! : '')
 fireEvent.click(within(allControls as HTMLElement).getByRole('button', { name: 'Hide All' }))
 await waitFor(() => expect(screen.getAllByText('Summary').every(node => !node.parentElement!.hasAttribute('open'))).toBe(true))
 expect(screen.getAllByText('Tags').every(node => !node.parentElement!.hasAttribute('open'))).toBe(true)
 fireEvent.click(screen.getAllByText('Summary')[0])
 await waitFor(() => expect(screen.getAllByText('Summary')[0].parentElement).toHaveAttribute('open'))
 expect(screen.getAllByText('Tags')[0].parentElement).not.toHaveAttribute('open')
 fireEvent.click(within(allControls as HTMLElement).getByRole('button', { name: 'Select All' }))
 expect(screen.getAllByRole('checkbox', { name: 'Work 2' }).every(input => (input as HTMLInputElement).checked)).toBe(true)
 fireEvent.click(saveAll)
 await waitFor(() => expect(mocks.remember).toHaveBeenCalledTimes(2))
 expect(confirm).not.toHaveBeenCalled()
 expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
 expect(screen.queryByRole('button', { name: 'Save All Series' })).not.toBeInTheDocument()
})

function longPreview(seriesId = 7, count = 65) {
 return { seriesId, normalizedUrl: `https://archiveofourown.org/series/${seriesId}`, title: `Series ${seriesId}`, description: '', works: Array.from({ length: count }, (_, index) => ({ workId: index + 1, url: `https://archiveofourown.org/works/${index + 1}`, title: `Work ${index + 1}`, position: index + 1, authors: [], tags: [], summary: '', wordCount: null, chapters: '1/1', complete: true })) }
}
it('marks library works and direct links unavailable and keeps counts current when an individual import finishes', () => {
 const preview = longPreview(7, 4), confirm = vi.fn()
 const props = { text: `${preview.normalizedUrl}\nhttps://archiveofourown.org/works/3`, initialPreviews: [preview], busy: false, onConfirm: confirm, onCancel: vi.fn() }
 const view = render(<SeriesImportReview {...props} savedIds={new Set([1])} />)
 const series = within(screen.getByRole('region', { name: 'Series 7 • Series 7' }))
 expect(series.getByText('4 visible works · 1 in library · 0 selected. AO3 may hide unavailable or restricted works.')).toBeVisible()
 fireEvent.click(series.getAllByRole('button', { name: 'Show Series Works' })[0])
 const choice = (id: number) => series.getByRole('checkbox', { name: `Part ${id}: Work ${id}` })
 for (const id of [1, 3]) {
  expect(choice(id)).toBeDisabled()
  expect(choice(id)).toBeChecked()
  expect(choice(id).closest('label')).toHaveClass('check-label')
  expect(choice(id).closest('label')).toHaveAttribute('aria-disabled', 'true')
 }
 expect(series.getByText(/Already saved/)).toBeVisible()
 expect(series.getByText(/Included via pasted work link/)).toBeVisible()
 const controls = within(series.getByRole('group', { name: 'Series Selection Controls' }))
 fireEvent.click(controls.getByRole('button', { name: 'Select All' }))
 expect(series.getByText(/4 visible works · 1 in library · 2 selected/)).toBeVisible()
 // A separately imported work can enter the library while the chooser stays open.
 view.rerender(<SeriesImportReview {...props} savedIds={new Set([1, 2])} />)
 expect(choice(2)).toBeDisabled()
 expect(choice(2).closest('label')).toHaveAttribute('aria-disabled', 'true')
 expect(series.getByText(/4 visible works · 2 in library · 1 selected/)).toBeVisible()
 fireEvent.click(controls.getByRole('button', { name: 'Clear Selection' }))
 expect(choice(1)).toBeChecked()
 expect(choice(2)).toBeChecked()
 expect(choice(3)).toBeChecked()
 expect(choice(4)).not.toBeChecked()
 expect(series.getByText(/4 visible works · 2 in library · 0 selected/)).toBeVisible()
 fireEvent.click(choice(4))
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected' }))
 expect(confirm.mock.calls[0][0].map((work: { workId: number }) => work.workId)).toEqual([4])
 expect(confirm.mock.calls[0][3][0].works.map((work: { workId: number }) => work.workId)).toEqual([4])
})
it('keeps a series larger than the page target together and preserves selections when hidden', () => {
 const preview = longPreview(), confirm = vi.fn()
 render(<SeriesImportReview text={preview.normalizedUrl} initialPreviews={[preview]} savedIds={new Set()} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
 const toggle = screen.getAllByRole('button', { name: 'Show Series Works' })[0]
 expect(toggle).toHaveAttribute('aria-expanded', 'false')
 fireEvent.click(toggle)
 expect(toggle).toHaveTextContent(/^Hide Series Works$/)
 expect(toggle).toHaveAttribute('aria-expanded', 'true')
 expect(screen.getAllByRole('checkbox')).toHaveLength(65)
 expect(screen.queryByRole('navigation', { name: 'Result Pages' })).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('checkbox', { name: 'Part 65: Work 65' }))
 fireEvent.click(toggle)
 expect(toggle).toHaveTextContent(/^Show Series Works$/)
 expect(toggle).toHaveAttribute('aria-expanded', 'false')
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
 fireEvent.click(toggle)
 expect(screen.getByRole('checkbox', { name: 'Part 65: Work 65' })).toBeChecked()
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected' }))
 expect(confirm.mock.calls[0][0].map((work: { workId: number }) => work.workId)).toEqual([65])
})
it.each([
 { preceding: 28, firstPage: 28, nextPage: 17, stays: false },
 { preceding: 20, firstPage: 32, nextPage: 5, stays: true },
 { preceding: 24, firstPage: 36, nextPage: 5, stays: true },
])('keeps a 12-work series together after $preceding entries, with accurate ranges and selections', ({ preceding, firstPage, nextPage, stays }) => {
 const previews = [longPreview(7, preceding), longPreview(8, 12), longPreview(9, 5)], confirm = vi.fn()
 render(<SeriesImportReview text={previews.map(item => item.normalizedUrl).join('\n')} initialPreviews={previews} savedIds={new Set()} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 const pagination = () => within(screen.getAllByRole('navigation', { name: 'Result Pages' })[0])
 expect(pagination().getByRole('status')).toHaveTextContent(`1–${firstPage} of ${preceding + 17}`)
 expect(screen.queryByRole('region', { name: 'Series 8 • Series 8' }) !== null).toBe(stays)
 const first = within(screen.getByRole('region', { name: 'Series 7 • Series 7' }))
 fireEvent.click(first.getAllByRole('button', { name: 'Show Series Works' })[0])
 fireEvent.click(first.getByRole('checkbox', { name: 'Part 1: Work 1' }))
 fireEvent.click(pagination().getByRole('button', { name: 'Next' }))
 expect(screen.queryByRole('region', { name: 'Series 7 • Series 7' })).not.toBeInTheDocument()
 expect(screen.queryByRole('region', { name: 'Series 8 • Series 8' }) !== null).toBe(!stays)
 expect(pagination().getByRole('status')).toHaveTextContent(`${firstPage + 1}–${preceding + 17} of ${preceding + 17}`)
 while (screen.queryAllByRole('button', { name: 'Show Series Works' }).length) fireEvent.click(screen.getAllByRole('button', { name: 'Show Series Works' })[0])
 expect(screen.getAllByRole('checkbox')).toHaveLength(nextPage)
 const last = within(screen.getByRole('region', { name: 'Series 9 • Series 9' }))
 fireEvent.click(last.getByRole('checkbox', { name: 'Part 5: Work 5' }))
 fireEvent.click(pagination().getByRole('button', { name: 'Prev' }))
 expect(within(screen.getByRole('region', { name: 'Series 7 • Series 7' })).getByRole('checkbox', { name: 'Part 1: Work 1' })).toBeChecked()
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected' }))
 expect(confirm.mock.calls[0][0].map((work: { workId: number }) => work.workId)).toEqual([1, 5])
})
it('applies bulk selection and saving across hidden series pages and deduplicates overlapping works', async () => {
 const previews = Array.from({ length: 35 }, (_, index) => longPreview(index + 1, 1)), confirm = vi.fn()
 render(<SeriesImportReview text={previews.map(preview => preview.normalizedUrl).join('\n')} initialPreviews={previews} savedIds={new Set()} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(screen.getAllByRole('region', { name: /• Series/, hidden: true })).toHaveLength(30)
 fireEvent.click(within(screen.getByRole('group', { name: 'All Series Top Controls' })).getByRole('button', { name: 'Select All' }))
 // Scope queries to avoid computing visibility for every per-series control.
 const saveAll = within(screen.getByLabelText('All Series Controls')).getByRole('button', { name: 'Save All Series' })
 await act(async () => { fireEvent.click(saveAll) })
 expect(mocks.remember.mock.calls.map(([preview]) => preview.seriesId)).toEqual(previews.map(preview => preview.seriesId))
 fireEvent.click(screen.getByText('Import Selected', { selector: 'button' }))
 expect(confirm.mock.calls[0][0]).toHaveLength(1)
 expect(confirm.mock.calls[0][2]).toHaveLength(35)
 // This deliberately renders 30 series and saves 35; allow for full-suite contention.
}, 15000)

it('shows footer controls only while series works are shown', async () => {
 const preview = longPreview(7, 2)
 render(<SeriesImportReview text={preview.normalizedUrl} initialPreviews={[preview]} savedIds={new Set()} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
 expect(screen.queryByRole('group', { name: 'Series Footer Controls' })).not.toBeInTheDocument()
 const top = within(screen.getByRole('group', { name: 'Series Selection Controls' }))
 expect(top.getAllByRole('button').slice(0, 2).map(button => button.textContent)).toEqual(['Show Series Works', 'Select All'])
 fireEvent.click(top.getByRole('button', { name: 'Show Series Works' }))
 const footer = within(screen.getByRole('group', { name: 'Series Footer Controls' }))
 expect(footer.getAllByRole('button').slice(0, 2).map(button => button.textContent)).toEqual(['Save', 'Hide Series Works'])
 expect(footer.getByRole('button', { name: 'Save' })).toHaveAccessibleDescription('Load and save full series details from AO3')
 expect(screen.getAllByRole('button', { name: 'Hide Series Works' })).toHaveLength(2)
 expect(footer.getByRole('button', { name: 'Hide Series Works' })).toHaveAttribute('aria-expanded', 'true')
 fireEvent.click(footer.getByRole('button', { name: 'Hide Series Works' }))
 expect(screen.getAllByRole('button', { name: 'Show Series Works' })).toHaveLength(1)
 expect(screen.queryByRole('group', { name: 'Series Footer Controls' })).not.toBeInTheDocument()
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
 expect(mocks.remember).toHaveBeenCalledWith(preview)
 expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
 expect(screen.queryByRole('button', { name: 'Save All Series' })).not.toBeInTheDocument()
})

it.each([
 { bookmarked: [8], order: [8, 7, 9], headings: ['Bookmarked Series', 'Series Containing Bookmarked Works'] },
 { bookmarked: [], order: [7, 8, 9], headings: ['Series Containing Bookmarked Works'] },
 { bookmarked: [7, 8, 9], order: [7, 8, 9], headings: ['Bookmarked Series'] },
])('groups explicitly bookmarked series first without duplication: $bookmarked', ({ bookmarked, order, headings }) => {
 const previews = [7, 8, 9].map(id => longPreview(id, 1)), confirm = vi.fn()
 render(<SeriesImportReview text={previews.map(preview => preview.normalizedUrl).join('\n')} initialPreviews={previews} bookmarkedSeriesIds={new Set(bookmarked)} savedIds={new Set()} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(screen.getAllByRole('region', { name: /• Series/ }).map(region => region.getAttribute('aria-label'))).toEqual(order.map(id => `Series ${id} • Series ${id}`))
 expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Choose Works From Series', ...headings])
 const review = screen.getByRole('region', { name: 'Review Series Imports' })
 const ordered = Array.from(review.children).filter(node => node.tagName === 'H2' || node.classList.contains('series-import-preview'))
 expect(ordered[0]).toHaveTextContent(headings[0])
 fireEvent.click(within(screen.getByRole('group', { name: 'All Series Top Controls' })).getByRole('button', { name: 'Select All' }))
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected' }))
 expect(confirm.mock.calls[0][2]).toEqual(order)
 expect(confirm.mock.calls[0][0]).toHaveLength(1)
})

it('keeps bookmark group order and headings across whole-series pages', () => {
 const previews = [longPreview(7, 5), longPreview(8, 32)]
 render(<SeriesImportReview text={previews.map(preview => preview.normalizedUrl).join('\n')} initialPreviews={previews} bookmarkedSeriesIds={new Set([8])} savedIds={new Set()} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
 expect(screen.getByRole('heading', { name: 'Bookmarked Series' })).toBeVisible()
 expect(screen.getByRole('region', { name: 'Series 8 • Series 8' })).toBeVisible()
 expect(screen.queryByRole('region', { name: 'Series 7 • Series 7' })).not.toBeInTheDocument()
 fireEvent.click(within(screen.getAllByRole('navigation', { name: 'Result Pages' })[0]).getByRole('button', { name: 'Next' }))
 expect(screen.getByRole('heading', { name: 'Series Containing Bookmarked Works' })).toBeVisible()
 expect(screen.getByRole('region', { name: 'Series 7 • Series 7' })).toBeVisible()
 expect(screen.queryByRole('region', { name: 'Series 8 • Series 8' })).not.toBeInTheDocument()
})

it('counts and marks catalog works already saved even when the import path supplies no saved IDs', () => {
 mocks.stories = [{ work: { ao3_work_id: 1 } }]
 const preview = longPreview(7, 2), confirm = vi.fn()
 render(<SeriesImportReview text={preview.normalizedUrl} initialPreviews={[preview]} savedIds={new Set()} busy={false} onConfirm={confirm} onCancel={vi.fn()} />)
 expect(screen.getByText(/2 visible works · 1 in library · 0 selected/)).toBeVisible()
 fireEvent.click(within(screen.getByRole('group', { name: 'Series Selection Controls' })).getByRole('button', { name: 'Show Series Works' }))
 const saved = screen.getByRole('checkbox', { name: 'Part 1: Work 1' })
 expect(saved).toBeChecked()
 expect(saved).toBeDisabled()
 fireEvent.click(within(screen.getByRole('group', { name: 'Series Selection Controls' })).getByRole('button', { name: 'Select All' }))
 expect(screen.getByText(/2 visible works · 1 in library · 1 selected/)).toBeVisible()
 fireEvent.click(screen.getByRole('button', { name: 'Import Selected' }))
 expect(confirm.mock.calls[0][0].map((work: { workId: number }) => work.workId)).toEqual([2])
})

it.each(['saved record', 'saved work membership'])('hides Save for a series already in the library through a %s', async source => {
 if (source === 'saved record') mocks.series = [{ ao3_series_id: 7 }]
 else mocks.stories = [{ work: { ao3_work_id: 100 }, metadata: { series_memberships: [{ id: 7, name: 'Series', url: 'https://archiveofourown.org/series/7', position: 1 }] } }]
 const first = longPreview(7, 2), second = longPreview(8, 2)
 render(<SeriesImportReview text={`${first.normalizedUrl}\n${second.normalizedUrl}`} initialPreviews={[first, second]} savedIds={new Set()} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
 const saved = within(screen.getByRole('region', { name: 'Series 7 • Series 7' }))
 expect(saved.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
 fireEvent.click(saved.getByRole('button', { name: 'Show Series Works' }))
 expect(saved.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
 expect(within(screen.getByRole('region', { name: 'Series 8 • Series 8' })).getByRole('button', { name: 'Save' })).toBeVisible()
 fireEvent.click(screen.getByRole('button', { name: 'Save All Series' }))
 await waitFor(() => expect(mocks.remember).toHaveBeenCalledExactlyOnceWith(second))
 expect(screen.queryByRole('button', { name: 'Save All Series' })).not.toBeInTheDocument()
})

it('keeps Save and work selections available when saving a missing series fails', async () => {
 const preview = longPreview(7, 2)
 mocks.remember.mockRejectedValueOnce(new Error('Save unavailable'))
 render(<SeriesImportReview text={preview.normalizedUrl} initialPreviews={[preview]} savedIds={new Set()} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
 fireEvent.click(screen.getByRole('button', { name: 'Show Series Works' }))
 fireEvent.click(screen.getByRole('checkbox', { name: 'Part 2: Work 2' }))
 fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
 expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable')
 expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeEnabled()
 expect(screen.getByRole('checkbox', { name: 'Part 2: Work 2' })).toBeChecked()
})
