import { SeriesSummaryContext } from './series-summary-context'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { blankMetadata, type Story } from '../model'
import type { SeriesRecord } from './series'
import type { SeriesPreview } from '../../imports/urls'

const mocks = vi.hoisted(() => ({
 preview: vi.fn(), remember: vi.fn(), ensure: vi.fn(), remove: vi.fn(), note: vi.fn(), submit: vi.fn(), history: vi.fn(), refresh: vi.fn(), refreshSeries: vi.fn(), loadDetails: vi.fn(), retainDetails: vi.fn(),
 catalogLoaded: true, stories: [] as Story[], series: [] as SeriesRecord[],
}))
vi.mock('../LibraryProvider', () => ({ useLibrary: () => ({ stories:mocks.stories,series:mocks.series,catalogLoaded:mocks.catalogLoaded,collections:[],loading:false,refresh:mocks.refresh,refreshSeries:mocks.refreshSeries,loadDetails:mocks.loadDetails,retainDetails:mocks.retainDetails }) }))
vi.mock('../LibraryPages', () => ({ LibraryBoundary: ({ children }: { children: ReactNode }) => children, StoryCard: ({ story }: { story: Story }) => <article>{story.metadata.title}</article> }))
vi.mock('../../imports/repository', () => ({ previewSeries:mocks.preview,submitImport:mocks.submit,importHistory:mocks.history }))
vi.mock('./series-repository', () => ({ rememberSeries:mocks.remember,ensureSeries:mocks.ensure,removeSeriesDetails:mocks.remove,saveSeriesNote:mocks.note,updateSeries:vi.fn(),finishSeries:vi.fn() }))
import { SeriesPage } from './SeriesPage'
import { SeriesCard } from './SeriesCollection'
import { librarySeries } from './series'

const url = 'https://archiveofourown.org/series/77'
const full: SeriesPreview = { seriesId:77,normalizedUrl:url,title:'Series title',description:'Full description',basic:false,fetchedAt:'2026-10-20T12:00:00Z',wordCount:900,complete:false,workCount:2,works:[{workId:102,url:'https://archiveofourown.org/works/102',position:2,title:'Unsaved sequel',authors:['Author'],summary:'Sequel summary',tags:[],wordCount:700,chapters:'1/?',complete:false}] }
function record(metadata: SeriesPreview): SeriesRecord { return { id:'series-record',ao3_series_id:77,metadata,notes:'Private note',is_favorite:true,collectionIds:[],detailsLoaded:true,created_at:'2026-10-20T12:00:00Z',updated_at:'2026-10-20T12:00:00Z' } as unknown as SeriesRecord }
function show() { return render(<MemoryRouter initialEntries={['/series/77']}><Routes><Route path="/series/:id" element={<SeriesPage />} /></Routes></MemoryRouter>) }
const showModal = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close
beforeAll(() => {
 HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
 HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterAll(() => { HTMLDialogElement.prototype.showModal = showModal; HTMLDialogElement.prototype.close = close })
beforeEach(() => {
 vi.resetAllMocks()
 mocks.catalogLoaded = true
 mocks.submit.mockResolvedValue('refresh-batch')
 mocks.history.mockResolvedValue({ batches: [{ id: 'refresh-batch' }], items: [], jobs: [], summary: { total: 1, active: true, counts: {} } })
 mocks.retainDetails.mockReturnValue(() => {})
 mocks.preview.mockResolvedValue(full)
 mocks.stories = [{ id:'saved-work',work:{ao3_work_id:101},metadata:{...blankMetadata,title:'Saved fic',authors:['Author'],word_count:200,series_memberships:[{id:77,name:'Series title',url,position:1}]},reading_status:'to_read' } as Story]
 mocks.series = [{ ...record({ ...full, basic:true, complete:undefined, works:[], wordCount:undefined, description:'' }), notes:'', is_favorite:false }]
})
it('builds a basic saved series page without fetching or persisting an AO3 listing', () => {
 show()
 expect(screen.getByRole('heading', { name:'Works in Your Library' })).toBeVisible()
 expect(screen.queryByRole('button', { name:'Hide Works Not in Library' })).not.toBeInTheDocument()
 expect(screen.getByText('200')).toBeVisible()
 expect(screen.getByRole('button', { name:'Load' })).toHaveAccessibleDescription('Load full series from AO3')
 expect(screen.getByText('Completion unknown')).toBeVisible()
 expect(screen.queryByText('Unsaved sequel')).not.toBeInTheDocument()
 expect(mocks.preview).not.toHaveBeenCalled()
 expect(mocks.remember).not.toHaveBeenCalled()
})
it('downloads and saves full series details only when explicitly requested', async () => {
 show()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Load' })) })
 expect(mocks.preview).toHaveBeenCalledWith(url)
 expect(mocks.remember).toHaveBeenCalledWith(full)
 expect(mocks.refreshSeries).toHaveBeenCalledWith(77)
 expect(mocks.submit).not.toHaveBeenCalled()
})
it('offers removal of downloaded details and renders unsaved works without adding them', async () => {
 mocks.series = [record(full)]
 show()
 expect(screen.getByText('Full description')).toBeVisible()
 expect(screen.getByRole('link', { name:'Part 2: Unsaved sequel' })).toBeVisible()
 expect(screen.getByText(/Last fetched/)).toBeVisible()
 expect(screen.getByRole('button', { name:'Remove' })).toHaveAccessibleDescription('Removes downloaded series details')
 expect(screen.getByRole('button', { name:'Refresh' })).toHaveAccessibleDescription('Refresh series info from AO3')
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Remove' })) })
 expect(mocks.remove).toHaveBeenCalledWith(77)
 expect(mocks.refreshSeries).toHaveBeenCalledWith(77)
 expect(screen.getByText('Private note')).toBeVisible()
 expect(mocks.submit).not.toHaveBeenCalled()
})
it('saves personal notes with a minimal identity and no AO3 retrieval', async () => {
 show()
 fireEvent.click(screen.getByRole('button', { name:'Add a Note' }))
 fireEvent.change(screen.getByRole('textbox', { name:'Private Notes' }), { target:{ value:'A personal note' } })
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Save' })) })
 expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({seriesId:77,title:'Series title'}))
 expect(mocks.note).toHaveBeenCalledWith(77,'A personal note','')
 expect(mocks.preview).not.toHaveBeenCalled()
 expect(mocks.remember).not.toHaveBeenCalled()
})
it('reuses temporary series review in a dialog without saving the full listing', async () => {
 show()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Choose Works to Import' })) })
 expect(screen.getByRole('dialog', { name:'Review Series' })).toBeVisible()
 expect(screen.queryByText(/Current series default/)).not.toBeInTheDocument()
 const dialog = screen.getByRole('dialog', { name: 'Review Series' })
 for (const name of ['Save', 'Save All Series', 'Skip Series']) expect(within(dialog).queryByRole('button', { name })).not.toBeInTheDocument()
 expect(within(dialog).queryByRole('group', { name: 'All Series Top Controls' })).not.toBeInTheDocument()
 expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeVisible()
 fireEvent.click(within(dialog).getAllByRole('button', { name: 'Show Series Works' })[0])
 expect(screen.getByRole('checkbox', { name:'Part 2: Unsaved sequel' })).not.toBeChecked()
 expect(mocks.preview).toHaveBeenCalledWith(url, { signal: expect.any(AbortSignal) })
 expect(mocks.remember).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name:'Close Dialog' }))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('shows import failures inside the review dialog and retains the selection for retry', async () => {
 mocks.submit.mockRejectedValue(new Error('Import unavailable'))
 show()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Choose Works to Import' })) })
 const dialog = screen.getByRole('dialog', { name:'Review Series' })
 fireEvent.click(within(dialog).getAllByRole('button', { name: 'Show Series Works' })[0])
 fireEvent.click(within(dialog).getByRole('checkbox', { name:'Part 2: Unsaved sequel' }))
 await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name:'Import Selected Works' })) })
 expect(within(dialog).getByRole('alert')).toHaveTextContent('Import unavailable')
 expect(within(dialog).getByRole('checkbox', { name:'Part 2: Unsaved sequel' })).toBeChecked()
})

it('toggles unsaved works without hiding saved works or series information', () => {
 mocks.series = [record({ ...full, begun:'2020-01-02', updated:'2026-10-20', creatorNotes:'AO3 creator notes' })]
 show()
 const description = screen.getByRole('region', { name:'Series Description' })
 const progress = screen.getByRole('region', { name:'Reading and Organization' })
 expect(description.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 expect(within(description).getByText('AO3 creator notes')).toBeVisible()
 expect(screen.getByText('01/02/2020')).toBeVisible()
 expect(screen.getByText('Oct 20, 2026')).toBeVisible()
 fireEvent.click(screen.getByRole('button', { name:'Hide Works Not in Library' }))
 expect(screen.queryByRole('link', { name:'Part 2: Unsaved sequel' })).not.toBeInTheDocument()
 expect(screen.getByText('Saved fic')).toBeVisible()
 expect(screen.getByText('Full description')).toBeVisible()
 fireEvent.click(screen.getByRole('button', { name:'Show Works Not in Library' }))
 expect(screen.getByRole('link', { name:'Part 2: Unsaved sequel' })).toBeVisible()
})

it('starts saved work summaries collapsed and applies collection actions after individual toggles', () => {
 mocks.series = [record(full)]
 mocks.stories[0].metadata.summary = 'Saved work summary'
 const series = librarySeries(mocks.stories, mocks.series)[0]
 const tile = (expanded: boolean, revision: number) => <MemoryRouter><SeriesSummaryContext value={{ expanded, revision }}><SeriesCard series={series} /></SeriesSummaryContext></MemoryRouter>
 const view = render(tile(false, 0))
 const summary = screen.getByText('Saved work summary')
 expect(summary.closest('details')).not.toHaveAttribute('open')
 expect(screen.queryByText('Sequel summary')).not.toBeInTheDocument()
 expect(screen.queryByText(/Unsaved sequel/)).not.toBeInTheDocument()
 const note = screen.getByText('Private note')
 expect(screen.getByText('Full description').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 view.rerender(tile(true, 1))
 expect(screen.getByText('Saved work summary').closest('details')).toHaveAttribute('open')
 view.rerender(tile(false, 2))
 expect(screen.getByText('Saved work summary').closest('details')).not.toHaveAttribute('open')
 view.rerender(tile(true, 3))
 expect(screen.getByText('Saved work summary').closest('details')).toHaveAttribute('open')
})

it('hides the unsaved-work toggle when every series work is in the library', () => {
 mocks.series = [record({ ...full, workCount: 1 })]
 show()
 expect(screen.queryByRole('button', { name: /Works Not in Library/ })).not.toBeInTheDocument()
})

it('closes the embedded review while its preview is pending without importing a late result', async () => {
 let finish!: (preview: SeriesPreview) => void
 mocks.preview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
 show()
 fireEvent.click(screen.getByRole('button', { name: 'Choose Works to Import' }))
 const dialog = await screen.findByRole('dialog', { name: 'Review Series' })
 expect(await within(dialog).findByText('Loading Series…')).toBeVisible()
 const close = within(dialog).getByRole('button', { name: 'Close Dialog' })
 expect(close).toBeEnabled()
 fireEvent.click(close)
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(mocks.preview.mock.calls[0][1].signal.aborted).toBe(true)
 await act(async () => { finish(full) })
 expect(mocks.submit).not.toHaveBeenCalled()
 expect(mocks.remember).not.toHaveBeenCalled()
})

it('refreshes saved inferred and preview-linked works while excluding unsaved and unrelated works', async () => {
 mocks.series = [record({ ...full, works:[...full.works,{...full.works[0],workId:104,url:'https://archiveofourown.org/works/104',title:'Another unsaved sequel'}] })]
 mocks.stories.push({ ...mocks.stories[0], id:'saved-sequel', work:{ ao3_work_id:102 }, metadata:{ ...blankMetadata, title:'Saved sequel' } } as Story)
 mocks.stories.push({ ...mocks.stories[0], id:'unrelated', work:{ ao3_work_id:999 }, metadata:{ ...blankMetadata, title:'Unrelated' } } as Story)
 show()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Refresh Works' })) })
 expect(mocks.submit).toHaveBeenCalledExactlyOnceWith('https://archiveofourown.org/works/101\nhttps://archiveofourown.org/works/102', false)
 expect(screen.getByRole('button', { name:'Refreshing Works…' })).toBeDisabled()
 expect(screen.getByRole('status')).toHaveTextContent('Metadata refresh queued for 2 works')
 expect(mocks.preview).not.toHaveBeenCalled()
})

it('disables work refresh when no series works are saved', () => {
 mocks.stories = []
 mocks.series = [record(full)]
 show()
 expect(screen.getByRole('button', { name:'Refresh Works' })).toBeDisabled()
})

it('allows retry after a series work refresh submission fails', async () => {
 mocks.submit.mockRejectedValueOnce(new Error('Refresh unavailable'))
 show()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Refresh Works' })) })
 expect(screen.getByRole('status')).toHaveTextContent('Refresh unavailable')
 expect(screen.getByRole('button', { name:'Refresh Works' })).toBeEnabled()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Refresh Works' })) })
 expect(mocks.submit).toHaveBeenCalledTimes(2)
})

it('waits for the complete catalog before offering a refresh of all saved series works', () => {
 mocks.catalogLoaded = false
 show()
 expect(screen.getByRole('button', { name:'Refresh Works' })).toBeDisabled()
 expect(mocks.submit).not.toHaveBeenCalled()
})

it('does not create a page for a single inferred work but creates one for two saved works', () => {
 mocks.series = []
 const view = show()
 expect(screen.getByText(/need at least two saved works/)).toBeVisible()
 expect(screen.queryByRole('button', { name:'Refresh Works' })).not.toBeInTheDocument()
 expect(screen.getByRole('link', { name:'View Series on AO3' })).toHaveAttribute('href',url)
 view.unmount()
 mocks.stories.push({ ...mocks.stories[0], id:'saved-work-2', work:{ao3_work_id:103} } as Story)
 show()
 expect(screen.getByRole('heading', { name:'Works in Your Library' })).toBeVisible()
 expect(screen.getByRole('button', { name:'Refresh Works' })).toBeEnabled()
})
