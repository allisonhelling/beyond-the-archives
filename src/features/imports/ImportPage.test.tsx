import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const mocks=vi.hoisted(()=>({history:vi.fn(),submit:vi.fn(),cancel:vi.fn(),retry:vi.fn(),approve:vi.fn(),preview:vi.fn(),refresh:vi.fn()}))
vi.mock('./repository',()=>({importHistory:mocks.history,submitImport:mocks.submit,cancelBatch:mocks.cancel,retryJob:mocks.retry,approveProgress:mocks.approve,previewSeries:mocks.preview}))
vi.mock('../library/LibraryProvider',()=>({useLibrary:()=>({refresh:mocks.refresh,stories:[{work:{ao3_work_id:103}}]})}))
import { ImportPage } from './ImportPage'
function show(){return render(<MemoryRouter><ImportPage/></MemoryRouter>)}
beforeEach(()=>{vi.clearAllMocks();mocks.history.mockResolvedValue({batches:[],items:[],jobs:[]});mocks.refresh.mockResolvedValue(undefined);mocks.submit.mockResolvedValue('batch')})
it('submits 100+ links, explains unrelated links and remains usable after navigating back',async()=>{
 show();expect(await screen.findByText('No imports yet. Paste your first batch above.')).toBeVisible()
 const text=Array.from({length:110},(_,i)=>`https://archiveofourown.org/works/${i+1}`).join('\n')+'\nhttps://example.com'
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:text}})
 expect(screen.getByText(/111 links found · 1 unrelated/)).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Import URLs'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith(text));expect(await screen.findByRole('status')).toHaveTextContent('Batch saved.')
 expect(screen.getByLabelText('AO3 URLs')).toHaveValue('')
})
it('shows history, saved work links, cancellation, retry and an explicit progress approval',async()=>{
 mocks.history.mockResolvedValue({batches:[{id:'batch',created_at:'2026-10-16T12:00:00Z',cancelled_at:null}],items:[{id:'item',entry_id:'entry',ao3_work_id:123,chapter_id:'960',original_url:'https://archiveofourown.org/works/123/chapters/960',status:'failed',result:'already_saved',verified_position:6,metadata_status:'failed',error_category:'timeout',error_message:'Try later',last_attempt_at:'2026-10-16T12:01:00Z'}],jobs:[{id:'job',entry_id:'entry',status:'failed',retryable:true,attempts:1}]})
 show();expect(await screen.findByRole('link',{name:'View saved work'})).toHaveAttribute('href','/stories/entry')
 expect(screen.getByRole('link',{name:'Edit metadata'})).toHaveAttribute('href','/stories/entry?edit=metadata')
 fireEvent.click(screen.getByRole('button',{name:'Approve progress through chapter 5'}));await waitFor(()=>expect(mocks.approve).toHaveBeenCalledWith('item'))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Retry metadata'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Retry metadata'}));await waitFor(()=>expect(mocks.retry).toHaveBeenCalledWith('job'))
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
 const all=await screen.findByRole('button',{name:'All results: 6'})
 const table=screen.getByRole('table')
 expect(within(table).getAllByRole('row')).toHaveLength(7)
 for(const [index,status] of statuses.entries()){
  const button=screen.getByRole('button',{name:`${status}: 1`})
  fireEvent.click(button)
  expect(button).toHaveAttribute('aria-pressed','true')
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  expect(within(table).getByText(items[index].original_url)).toBeVisible()
  expect(screen.getByRole('progressbar',{name:'Import progress'})).toHaveAttribute('value','4')
  expect(all).toHaveTextContent('All results: 6')
 }
 fireEvent.click(all)
 expect(within(table).getAllByRole('row')).toHaveLength(7)
 fireEvent.click(screen.getByRole('button',{name:'failed: 1'}))
 fireEvent.change(screen.getByLabelText('Batch'),{target:{value:'second'}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'Review results: 0'})).toHaveAttribute('aria-pressed','true'))
 expect(screen.getByRole('status')).toHaveTextContent('Batch finished. No failed, skipped, or cancelled results to review.')
 fireEvent.click(screen.getByRole('button',{name:'All results: 1'}))
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
  expect(screen.getByRole('button',{name:'All results: 4'})).toHaveAttribute('aria-pressed','true')
  expect(screen.queryByRole('button',{name:'Review results: 3'})).not.toBeInTheDocument()
  jobs=[]
  items[2].metadata_status='processing'
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  expect(screen.queryByRole('button',{name:'Review results: 3'})).not.toBeInTheDocument()
  items[2].metadata_status='completed'
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  expect(screen.getByRole('button',{name:'Review results: 3'})).toHaveAttribute('aria-pressed','true')
  const table=screen.getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(4)
  expect(within(table).queryByText(items[0].original_url)).not.toBeInTheDocument()
  for(const item of items.slice(1)) expect(within(table).getByText(item.original_url)).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Batch finished. Showing failed, skipped, and cancelled results for your review. 3 of 4 results.')
  fireEvent.click(screen.getByRole('button',{name:'All results: 4'}))
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  expect(screen.getByRole('button',{name:'All results: 4'})).toHaveAttribute('aria-pressed','true')
  expect(within(table).getAllByRole('row')).toHaveLength(5)
  // Retrying work reopens the batch; finishing again restores review mode.
  jobs=[{id:'job',status:'pending'}]
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  jobs=[]
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)})
  expect(screen.getByRole('button',{name:'Review results: 3'})).toHaveAttribute('aria-pressed','true')
 }finally{vi.useRealTimers()}
})

const seriesWork=(id:number,title:string,position:number)=>({workId:id,url:`https://archiveofourown.org/works/${id}`,title,position,authors:['Author'],summary:`Summary for ${title}`,tags:['Adventure'],wordCount:1000,chapters:'1/1',complete:true})
it('reviews series before saving, excludes unwanted extras, and preserves directly pasted chapter links',async()=>{
 mocks.preview.mockResolvedValue({seriesId:77,title:'A series',description:'Stories and extras',works:[seriesWork(101,'Story',1),seriesWork(102,'Art extras',4),seriesWork(103,'Saved story',5),seriesWork(104,'Direct story',6)]})
 show();await screen.findByText('No imports yet. Paste your first batch above.')
 const direct='https://archiveofourown.org/works/104/chapters/999'
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:`https://archiveofourown.org/series/77\n${direct}`}})
 expect(screen.getByText(/1 series detected/)).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Review series'}))
 expect(mocks.submit).not.toHaveBeenCalled()
 expect(screen.getByRole('button',{name:'Import 1 selected works'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'Load works'}))
 const story=await screen.findByRole('checkbox',{name:'Part 1: Story'})
 expect(story).not.toBeChecked()
 expect(screen.getByRole('checkbox',{name:'Part 4: Art extras'})).not.toBeChecked()
 expect(screen.getByRole('checkbox',{name:'Part 5: Saved story'})).toBeDisabled()
 expect(screen.getByRole('checkbox',{name:'Part 6: Direct story'})).toBeDisabled()
 fireEvent.click(screen.getAllByText('Summary and tags')[0])
 expect(screen.getByText('Summary for Story')).toBeVisible()
 fireEvent.click(story)
 fireEvent.click(screen.getByRole('button',{name:'Import 2 selected works'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith(`${direct}\nhttps://archiveofourown.org/works/101`))
 expect(screen.getByLabelText('AO3 URLs')).toHaveValue('')
})
it('can retry a failed preview or skip it and import the remaining selections',async()=>{
 mocks.preview.mockRejectedValueOnce(new Error('AO3 sign-in required')).mockResolvedValue({seriesId:77,title:'Recovered series',description:'',works:[seriesWork(101,'Recovered story',1)]})
 show();await screen.findByText('No imports yet. Paste your first batch above.')
 fireEvent.change(screen.getByLabelText('AO3 URLs'),{target:{value:'https://archiveofourown.org/series/77\nhttps://archiveofourown.org/series/78'}})
 fireEvent.click(screen.getByRole('button',{name:'Review series'}))
 fireEvent.click(screen.getAllByRole('button',{name:'Load works'})[0])
 expect(await screen.findByRole('alert')).toHaveTextContent('AO3 sign-in required')
 expect(mocks.submit).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Retry preview'}))
 await screen.findByText('Recovered series')
 fireEvent.click(screen.getByRole('button',{name:'Select all'}))
 expect(screen.getByRole('checkbox',{name:'Part 1: Recovered story'})).toBeChecked()
 fireEvent.click(screen.getByRole('button',{name:'Clear selection'}))
 expect(screen.getByRole('checkbox',{name:'Part 1: Recovered story'})).not.toBeChecked()
 fireEvent.click(screen.getByRole('checkbox',{name:'Part 1: Recovered story'}))
 fireEvent.click(within(screen.getByRole('region',{name:'Series 78'})).getByRole('button',{name:'Skip series'}))
 fireEvent.click(screen.getByRole('button',{name:'Import 1 selected works'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith('https://archiveofourown.org/works/101'))
})
