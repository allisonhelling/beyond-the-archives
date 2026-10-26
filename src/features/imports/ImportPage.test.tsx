vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ session: { user: { id: 'test' } } }) }))
import { LibrarySyncProvider } from './LibrarySyncProvider'
import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const mocks=vi.hoisted(()=>({history:vi.fn(),submit:vi.fn(),cancel:vi.fn(),retry:vi.fn(),approve:vi.fn(),preview:vi.fn(),refresh:vi.fn(),sample:false}))
vi.mock('../../lib/sample-mode',()=>({get sampleMode(){return mocks.sample}}))
vi.mock('./repository',()=>({importHistory:mocks.history,submitImport:mocks.submit,cancelBatch:mocks.cancel,retryJob:mocks.retry,approveProgress:mocks.approve,previewSeries:mocks.preview}))
vi.mock('../library/LibraryProvider',()=>({useLibrary:()=>({refresh:mocks.refresh,refreshSeries:mocks.refresh,stories:[{id:'saved-103',metadata:{series:[],series_memberships:[]},work:{ao3_work_id:103}}]})}))
import { ImportPage } from './ImportPage'
function show(){return render(<MemoryRouter><LibrarySyncProvider><ImportPage/></LibrarySyncProvider></MemoryRouter>)}
beforeEach(()=>{vi.clearAllMocks();mocks.sample=false;mocks.history.mockResolvedValue({batches:[],items:[],jobs:[]});mocks.refresh.mockResolvedValue(undefined);mocks.submit.mockResolvedValue('batch')})
it('submits 100+ links, explains unrelated links and remains usable after navigating back',async()=>{
 show();expect(await screen.findByText('No imports yet. Paste your first batch above.')).toBeVisible()
 const text=Array.from({length:110},(_,i)=>`https://archiveofourown.org/works/${i+1}`).join('\n')+'\nhttps://example.com'
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:text}})
 expect(screen.getByText(/111 links found · 1 unrelated/)).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Import URLs'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith(text,true,'to_read',[]));expect(await screen.findByRole('status')).toHaveTextContent('Batch saved.')
 expect(screen.getByLabelText('AO3 URLs')).toHaveValue('')
})
it('shows history, saved work links, cancellation, retry and an explicit progress approval',async()=>{
 mocks.history.mockResolvedValue({batches:[{id:'batch',created_at:'2026-10-16T12:00:00Z',cancelled_at:null}],items:[{id:'item',entry_id:'entry',ao3_work_id:123,chapter_id:'960',original_url:'https://archiveofourown.org/works/123/chapters/960',status:'failed',result:'already_saved',verified_position:6,metadata_status:'failed',error_category:'timeout',error_message:'Try later',last_attempt_at:'2026-10-16T12:01:00Z'}],jobs:[{id:'job',entry_id:'entry',status:'failed',retryable:true,attempts:1}]})
 show();expect(await screen.findByRole('link',{name:'View Saved Work'})).toHaveAttribute('href','/stories/entry')
 expect(screen.getByRole('link',{name:'Edit Metadata'})).toHaveAttribute('href','/stories/entry?edit=metadata')
 fireEvent.click(screen.getByRole('button',{name:'Approve Progress Through Chapter 5'}));await waitFor(()=>expect(mocks.approve).toHaveBeenCalledWith('item'))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Retry Metadata'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Retry Metadata'}));await waitFor(()=>expect(mocks.retry).toHaveBeenCalledWith('job'))
})
it('shows completed work names and authors with clickable submitted URLs in the selected request', async () => {
 mocks.history.mockResolvedValue({ selectedBatch: 'request', batches: [{ id: 'request', source_url: 'https://archiveofourown.org/users/reader/bookmarks', created_at: '2026-10-24T12:00:00Z' }], items: [{ id: 'item', entry_id: 'entry', original_url: 'https://archiveofourown.org/works/123', ao3_work_id: 123, status: 'completed', result: 'imported', metadata_status: 'completed', work_info: { title: 'Completed Fic', authors: ['An Author'] } }], jobs: [] })
 show()
 await screen.findByRole('button', { name: 'All Results: 1' })
 fireEvent.click(screen.getByRole('button', { name: 'All Results: 1' }))
 expect(screen.getByRole('columnheader', { name: 'WORK INFO' })).toBeVisible()
 expect(screen.getByText('Completed Fic')).toBeVisible()
 expect(screen.getByText(/An Author/)).toBeVisible()
 expect(screen.getByRole('link', { name: 'https://archiveofourown.org/works/123' })).toHaveAttribute('href', 'https://archiveofourown.org/works/123')
})
it('reports history and submission errors with the input preserved',async()=>{
 mocks.submit.mockRejectedValue(new Error('Database unavailable'))
 show();await screen.findByText('No imports yet. Paste your first batch above.')
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:'https://archiveofourown.org/works/123'}});fireEvent.click(screen.getByRole('button',{name:'Import URLs'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');expect(screen.getByLabelText('AO3 URLs')).toHaveValue('https://archiveofourown.org/works/123')
})

it('filters batch results by status, keeps totals, and resets when selecting another batch',async()=>{
 const statuses=['pending','processing','completed','failed','skipped','cancelled']
 const batches=[{id:'first',created_at:'2026-10-18T12:00:00Z',cancelled_at:null},{id:'second',created_at:'2026-10-17T12:00:00Z',cancelled_at:null}]
 const items=statuses.map((status,index)=>({id:`item-${index}`,original_url:`https://archiveofourown.org/works/${index+1}`,status,result:'imported',metadata_status:status}))
 mocks.history.mockImplementation(async(selected)=>({batches,items:selected==='second'?[{...items[2],id:'other',original_url:'https://archiveofourown.org/works/99'}]:items,jobs:[]}))
 show()
 const all=await screen.findByRole('button',{name:'All Results: 6'})
 const table=screen.getByRole('table')
 expect(within(table).getAllByRole('row')).toHaveLength(7)
 for(const [index,status] of statuses.entries()){
  const button=screen.getByRole('button',{name:`${status}: 1`})
  fireEvent.click(button)
  expect(button).toHaveAttribute('aria-pressed','true')
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  expect(within(table).getByText(items[index].original_url)).toBeVisible()
  expect(screen.getByRole('progressbar',{name:'Import Progress'})).toHaveAttribute('value','4')
  expect(all).toHaveTextContent('All Results: 6')
 }
 fireEvent.click(all)
 expect(within(table).getAllByRole('row')).toHaveLength(7)
 fireEvent.click(screen.getByRole('button',{name:'failed: 1'}))
 fireEvent.change(screen.getByLabelText('Batch'),{target:{value:'second'}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'Review: 0'})).toHaveAttribute('aria-pressed','true'))
 expect(screen.getByRole('status')).toHaveTextContent('Batch finished. No failed, skipped, or cancelled results to review.')
 fireEvent.click(screen.getByRole('button',{name:'All Results: 1'}))
 expect(within(table).getByText('https://archiveofourown.org/works/99')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'failed: 0'}))
 expect(within(table).getByText('No failed results in this batch.')).toBeVisible()
 expect(screen.getByRole('status')).toHaveTextContent('Showing 0 of 1 results · failed')
})

it('automatically shows review results on completion without overriding later manual filters',async()=>{
 vi.useFakeTimers()
 try{
  const batches=[{id:'batch',created_at:'2026-10-18T12:00:00Z',cancelled_at:null}]
  const items=['completed','failed','skipped','cancelled'].map((status,index)=>({id:`item-${index}`,original_url:`https://archiveofourown.org/works/${index+1}`,status,result:'imported',metadata_status:status}))
  let jobs=[{id:'job',status:'processing'}]
  mocks.history.mockImplementation(async()=>({batches,items,jobs}))
  show()
  await act(async()=>{})
  expect(screen.getByRole('button',{name:'All Results: 4'})).toHaveAttribute('aria-pressed','true')
  expect(screen.queryByRole('button',{name:'Review: 3'})).not.toBeInTheDocument()
  jobs=[]
  items[2].metadata_status='processing'
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  expect(screen.queryByRole('button',{name:'Review: 3'})).not.toBeInTheDocument()
  items[2].metadata_status='completed'
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  expect(screen.getByRole('button',{name:'Review: 3'})).toHaveAttribute('aria-pressed','true')
  const table=screen.getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(4)
  expect(within(table).queryByText(items[0].original_url)).not.toBeInTheDocument()
  for(const item of items.slice(1)) expect(within(table).getByText(item.original_url)).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Batch finished. Showing failed, skipped, and cancelled results for your review. 3 of 4 results.')
  fireEvent.click(screen.getByRole('button',{name:'All Results: 4'}))
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  expect(screen.getByRole('button',{name:'All Results: 4'})).toHaveAttribute('aria-pressed','true')
  expect(within(table).getAllByRole('row')).toHaveLength(5)
  // Completed batches stop polling. An explicit refresh observes external retries.
  const stoppedCalls=mocks.history.mock.calls.length
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000)})
  expect(mocks.history).toHaveBeenCalledTimes(stoppedCalls)
  // Retrying work reopens the batch; finishing again restores review mode.
  jobs=[{id:'job',status:'pending'}]
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Refresh Results'}))})
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  jobs=[]
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  expect(screen.getByRole('button',{name:'Review: 3'})).toHaveAttribute('aria-pressed','true')
 }finally{vi.useRealTimers()}
})

const seriesWork=(id:number,title:string,position:number)=>({workId:id,url:`https://archiveofourown.org/works/${id}`,title,position,authors:['Author'],summary:`Summary for ${title}`,tags:['Adventure'],wordCount:1000,chapters:'1/1',complete:true})
it('reviews series before saving, excludes unwanted extras, and preserves directly pasted chapter links',async()=>{
 mocks.preview.mockResolvedValue({seriesId:77,title:'A series',description:'Stories and extras',works:[seriesWork(101,'Story',1),seriesWork(102,'Art extras',4),seriesWork(103,'Saved story',5),seriesWork(104,'Direct story',6)]})
 show();await screen.findByText('No imports yet. Paste your first batch above.')
 const direct='https://archiveofourown.org/works/104/chapters/999'
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:`https://archiveofourown.org/series/77\n${direct}`}})
 expect(screen.getByText(/1 series detected/)).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Review Series'}))
 expect(mocks.submit).not.toHaveBeenCalled()
 expect(screen.getByRole('button',{name:'Import Selected'})).toBeDisabled()
 fireEvent.click((await screen.findAllByRole('button', { name: 'Show Series Works' }))[0])
 const story=await screen.findByRole('checkbox',{name:'Part 1: Story'})
 expect(story).not.toBeChecked()
 expect(screen.getByRole('checkbox',{name:'Part 4: Art extras'})).not.toBeChecked()
 expect(screen.getByRole('checkbox',{name:'Part 5: Saved story'})).toBeDisabled()
 expect(screen.getByRole('checkbox',{name:'Part 6: Direct story'})).toBeDisabled()
 expect(screen.getByRole('link',{name:'A series • Series 77'})).toHaveAttribute('href','https://archiveofourown.org/series/77')
 expect(screen.queryByRole('link',{name:'77'})).not.toBeInTheDocument()
 expect(screen.getByRole('link',{name:'View on AO3: Story'})).toHaveAttribute('href','https://archiveofourown.org/works/101')
 fireEvent.mouseEnter(screen.getByRole('link',{name:'View on AO3: Story'}).parentElement!)
 expect(screen.getByRole('tooltip')).toHaveTextContent('View on AO3')
 expect(screen.getByText('Summary for Story')).toBeVisible()
 expect(screen.getAllByText('Adventure')[0]).toBeVisible()
 fireEvent.click(screen.getAllByRole('button',{name:'Hide All'})[0])
 await waitFor(()=>expect(screen.getByText('Summary for Story')).not.toBeVisible())
 fireEvent.click(screen.getAllByRole('button',{name:'View All'})[0])
 await waitFor(()=>expect(screen.getByText('Summary for Story')).toBeVisible())
 fireEvent.click(screen.getAllByText('Summary')[0])
 await waitFor(()=>expect(screen.getByText('Summary for Story')).not.toBeVisible())
 fireEvent.click(screen.getAllByRole('button',{name:'View All'})[0])
 await waitFor(()=>expect(screen.getByText('Summary for Story')).toBeVisible())
 fireEvent.click(story)
 fireEvent.click(screen.getByRole('button',{name:'Import Selected'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith(`${direct}\nhttps://archiveofourown.org/works/101`,true,'to_read',[77]))
 expect(screen.getByLabelText('AO3 URLs')).toHaveValue('')
})
it('retries failed previews before importing the selected works',async()=>{
 mocks.preview.mockRejectedValueOnce(new Error('AO3 Sign-In Required')).mockImplementation(async (url: string) => { if (url.endsWith('/78')) throw new Error('Series unavailable'); return {seriesId:77,title:'Recovered series',description:'',works:[seriesWork(101,'Recovered story',1)]} })
 show();await screen.findByText('No imports yet. Paste your first batch above.')
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:'https://archiveofourown.org/series/77\nhttps://archiveofourown.org/series/78'}})
 fireEvent.click(screen.getByRole('button',{name:'Review Series'}))
 expect(await screen.findByText('AO3 Sign-In Required')).toBeVisible()
 expect(mocks.submit).not.toHaveBeenCalled()
 await waitFor(() => expect(within(screen.getByRole('region',{name:'Series 77'})).getByRole('button',{name:'Retry Preview'})).toBeEnabled())
 fireEvent.click(within(screen.getByRole('region',{name:'Series 77'})).getByRole('button',{name:'Retry Preview'}))
 await screen.findByText('Recovered series • Series 77')
 fireEvent.click((await screen.findAllByRole('button', { name: 'Show Series Works' }))[0])
 fireEvent.click(screen.getAllByRole('button',{name:'Select All'})[0])
 expect(screen.getByRole('checkbox',{name:'Part 1: Recovered story'})).toBeChecked()
 fireEvent.click(screen.getAllByRole('button',{name:'Clear Selection'})[0])
 expect(screen.getByRole('checkbox',{name:'Part 1: Recovered story'})).not.toBeChecked()
 fireEvent.click(screen.getByRole('checkbox',{name:'Part 1: Recovered story'}))
 mocks.preview.mockResolvedValueOnce({ seriesId: 78, title: 'Other series', works: [] })
 fireEvent.click(within(screen.getByRole('region',{name:'Series 78'})).getByRole('button',{name:'Retry Preview'}))
 await waitFor(() => expect(screen.getByRole('button',{name:'Import Selected'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'Import Selected'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith('https://archiveofourown.org/works/101',true,'to_read',[77,78]))
})

it('keeps the mass import status through series review, back navigation and failed submissions',async()=>{
 mocks.preview.mockResolvedValue({seriesId:77,title:'A series',description:'',works:[seriesWork(101,'Story',1)]})
 show();await screen.findByText('No imports yet. Paste your first batch above.')
 const status=screen.getByRole('combobox',{name:'Reading Status'})
 expect(status).toHaveValue('to_read')
 fireEvent.change(status,{target:{value:'finished'}})
 const text='https://archiveofourown.org/series/77\nhttps://archiveofourown.org/works/104'
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:text}})
 fireEvent.click(screen.getByRole('button',{name:'Review Series'}))
 expect(screen.getByRole('combobox',{name:'Reading Status'})).toHaveValue('finished')
 fireEvent.change(screen.getByRole('combobox',{name:'Reading Status'}),{target:{value:'reading'}})
 await waitFor(() => expect(screen.getByRole('button',{name:'Cancel'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
 expect(screen.getByRole('combobox',{name:'Reading Status'})).toHaveValue('reading')
 fireEvent.click(screen.getByRole('button',{name:'Review Series'}))
 fireEvent.click((await screen.findAllByRole('button', { name: 'Show Series Works' }))[0])
 fireEvent.click(await screen.findByRole('checkbox',{name:'Part 1: Story'}))
 mocks.submit.mockRejectedValueOnce(new Error('Offline'))
 fireEvent.click(screen.getByRole('button',{name:'Import Selected'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
 expect(screen.getByRole('combobox',{name:'Reading Status'})).toHaveValue('reading')
 expect(mocks.preview).toHaveBeenCalledOnce()
 expect(mocks.submit).toHaveBeenCalledWith('https://archiveofourown.org/works/104\nhttps://archiveofourown.org/works/101',true,'reading',[77])
})
it('applies the chosen reading status to a batch of direct work links',async()=>{
 show();await screen.findByText('No imports yet. Paste your first batch above.')
 const text='https://archiveofourown.org/works/101\nhttps://archiveofourown.org/works/102'
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:text}})
 fireEvent.change(screen.getByRole('combobox',{name:'Reading Status'}),{target:{value:'did_not_finish'}})
 fireEvent.click(screen.getByRole('button',{name:'Import URLs'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith(text,true,'did_not_finish',[]))
})

it('offers local extension listing imports in sample mode without querying account import history',async()=>{
 mocks.sample=true
 show()
 expect(screen.getByRole('heading',{name:'AO3 Library Sync'})).toBeVisible()
 expect(screen.queryByText(/Persistent imports require/)).not.toBeInTheDocument()
 expect(screen.getByLabelText('AO3 List URL')).toBeEnabled()
 expect(mocks.history).not.toHaveBeenCalled()
})

it('restores the same pasted work and series form in sample mode and saves without account import history',async()=>{
 mocks.sample=true
 show()
 const links='https://archiveofourown.org/works/101\nhttps://archiveofourown.org/works/102'
 expect(screen.getByRole('heading',{name:'Import Work or Series Links'})).toBeVisible()
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:links}})
 fireEvent.click(screen.getByRole('button',{name:'Import URLs'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith(links,true,'to_read',[]))
 await waitFor(()=>expect(mocks.refresh).toHaveBeenCalled())
 expect(mocks.history).not.toHaveBeenCalled()
 expect(screen.getByRole('heading', { name: 'Previous Batches' })).toBeVisible()
 expect(screen.getByRole('heading', { name: 'Import from CSV (Bookmarks or Marked for Later)' })).toBeVisible()
 expect(screen.getByText('CSV imports are available in the connected library. Local sample mode does not save CSV import batches.')).toBeVisible()
 expect(screen.getByText('Batch history is available in the connected library. Local sample imports do not create account batches.')).toBeVisible()
 expect(screen.getByLabelText('AO3 URLs')).toHaveValue('')
})

it('automatically imports every available series work with a one-import override', async () => {
 mocks.preview.mockResolvedValue({ seriesId: 77, title: 'Series', works: [seriesWork(101, 'First', 1), seriesWork(102, 'Second', 2), seriesWork(103, 'Already saved', 3)] })
 show()
 const form = screen.getByRole('textbox', { name: 'AO3 URLs' }).closest('form')!
 // Each import flow has its own temporary setting.
 const options = screen.getAllByRole('checkbox', { name: 'Automatically Save All Series Works for This Import Only' })
 fireEvent.click(options.at(-1)!)
 fireEvent.change(screen.getByLabelText('AO3 URLs'), { target: { value: 'https://archiveofourown.org/series/77' } })
 fireEvent.submit(form)
 await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith('https://archiveofourown.org/works/101\nhttps://archiveofourown.org/works/102', true, 'to_read', [77]))
})
