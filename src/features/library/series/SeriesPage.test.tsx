import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { blankMetadata, type Story } from '../model'
import type { SeriesRecord } from './series'
import type { SeriesPreview } from '../../imports/urls'

const mocks = vi.hoisted(() => ({
 preview: vi.fn(), remember: vi.fn(), ensure: vi.fn(), remove: vi.fn(), note: vi.fn(), submit: vi.fn(), refresh: vi.fn(), refreshSeries: vi.fn(), loadDetails: vi.fn(), retainDetails: vi.fn(),
 stories: [] as Story[], series: [] as SeriesRecord[],
}))
vi.mock('../LibraryProvider', () => ({ useLibrary: () => ({ stories:mocks.stories,series:mocks.series,collections:[],loading:false,refresh:mocks.refresh,refreshSeries:mocks.refreshSeries,loadDetails:mocks.loadDetails,retainDetails:mocks.retainDetails }) }))
vi.mock('../LibraryPages', () => ({ LibraryBoundary: ({ children }: { children: ReactNode }) => children, StoryCard: ({ story }: { story: Story }) => <article>{story.metadata.title}</article> }))
vi.mock('../../imports/repository', () => ({ previewSeries:mocks.preview,submitImport:mocks.submit,importHistory:vi.fn() }))
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
 mocks.retainDetails.mockReturnValue(() => {})
 mocks.preview.mockResolvedValue(full)
 mocks.stories = [{ id:'saved-work',work:{ao3_work_id:101},metadata:{...blankMetadata,title:'Saved fic',authors:['Author'],word_count:200,series_memberships:[{id:77,name:'Series title',url,position:1}]},reading_status:'to_read' } as Story]
 mocks.series = []
})
it('builds a basic series page from saved works without fetching or persisting an AO3 listing', () => {
 show()
 expect(screen.getByRole('heading', { name:'Works in your library' })).toBeVisible()
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
 fireEvent.click(screen.getByRole('button', { name:'Add a note' }))
 fireEvent.change(screen.getByRole('textbox', { name:'Private notes' }), { target:{ value:'A personal note' } })
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Save' })) })
 expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({seriesId:77,title:'Series title'}))
 expect(mocks.note).toHaveBeenCalledWith(77,'A personal note','')
 expect(mocks.preview).not.toHaveBeenCalled()
 expect(mocks.remember).not.toHaveBeenCalled()
})
it('reuses temporary series review in a dialog without saving the full listing', async () => {
 show()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Choose Works to Import' })) })
 expect(screen.getByRole('dialog', { name:'Review series' })).toBeVisible()
 expect(screen.getByRole('checkbox', { name:'Part 2: Unsaved sequel' })).not.toBeChecked()
 expect(mocks.preview).toHaveBeenCalledWith(url)
 expect(mocks.remember).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name:'Close dialog' }))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('shows import failures inside the review dialog and retains the selection for retry', async () => {
 mocks.submit.mockRejectedValue(new Error('Import unavailable'))
 show()
 await act(async () => { fireEvent.click(screen.getByRole('button', { name:'Choose Works to Import' })) })
 const dialog = screen.getByRole('dialog', { name:'Review series' })
 fireEvent.click(within(dialog).getByRole('checkbox', { name:'Part 2: Unsaved sequel' }))
 await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name:'Import selected' })) })
 expect(within(dialog).getByRole('alert')).toHaveTextContent('Import unavailable')
 expect(within(dialog).getByRole('checkbox', { name:'Part 2: Unsaved sequel' })).toBeChecked()
})

it('toggles unsaved works without hiding saved works or series information', () => {
 mocks.series = [record({ ...full, begun:'2020-01-02', updated:'2026-10-20', creatorNotes:'AO3 creator notes' })]
 show()
 const description = screen.getByRole('region', { name:'Series description' })
 const progress = screen.getByRole('region', { name:'Reading and organization' })
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

it('shows only saved work titles and summaries on tiles, with the private series summary before controls', () => {
 mocks.series = [record(full)]
 mocks.stories[0].metadata.summary = 'Saved work summary'
 const series = librarySeries(mocks.stories, mocks.series)[0]
 render(<MemoryRouter><SeriesCard series={series} /></MemoryRouter>)
 expect(screen.getByText(/1 works/)).toBeVisible()
 expect(screen.getByText('Saved work summary')).toBeVisible()
 expect(screen.queryByText('Sequel summary')).not.toBeInTheDocument()
 expect(screen.queryByText(/Unsaved sequel/)).not.toBeInTheDocument()
 const note = screen.getByText('Private note'), controls = screen.getByRole('button', { name:'Collapse All' })
 expect(screen.getByText('Full description').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 expect(note.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.click(controls)
 expect(screen.getByRole('button', { name:'Expand All' })).toBeVisible()
})

it('hides the unsaved-work toggle when every series work is in the library', () => {
 mocks.series = [record({ ...full, workCount: 1 })]
 show()
 expect(screen.queryByRole('button', { name: /Works Not in Library/ })).not.toBeInTheDocument()
})
