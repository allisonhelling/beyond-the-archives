import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const mocks=vi.hoisted(()=>({history:vi.fn(),submit:vi.fn(),cancel:vi.fn(),retry:vi.fn(),approve:vi.fn(),refresh:vi.fn()}))
vi.mock('./repository',()=>({importHistory:mocks.history,submitImport:mocks.submit,cancelBatch:mocks.cancel,retryJob:mocks.retry,approveProgress:mocks.approve}))
vi.mock('../library/LibraryProvider',()=>({useLibrary:()=>({refresh:mocks.refresh})}))
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
