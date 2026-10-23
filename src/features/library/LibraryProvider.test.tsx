import { MemoryRouter, useNavigate } from 'react-router-dom'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { blankMetadata, type Story } from './model'
import { defaultReadingFilters } from './reading-search'
const mocks=vi.hoisted(()=>({catalog:vi.fn(),stories:vi.fn(),collections:vi.fn(),query:vi.fn(),series:vi.fn()}))
vi.mock('./repository',async importOriginal=>({...(await importOriginal<typeof import('./repository')>()),loadCatalog:mocks.catalog,loadStories:mocks.stories,loadAffectedCollections:mocks.collections,loadCollections:mocks.collections,queryLibrary:mocks.query,loadSeriesRecord:mocks.series,deleteStory:vi.fn(),restoreStory:vi.fn(),updateEntry:vi.fn()}))
import { LibraryProvider, useLibrary } from './LibraryProvider'
const query={mode:'library' as const,shelf:'all',filters:defaultReadingFilters}
const result={stories:[],series:[],total:0,page:1,pages:1,sections:{},fandoms:[]}
const story=(id:string,title=id)=>({id,metadata:{...blankMetadata,title,summary:'Full summary'},notes:'Private notes',personalTags:['Personal tag'],work:{ao3_work_id:1,verified_chapters:{'1':'910'}},collectionIds:[],reading_status:'reading',last_read_chapter:0}) as unknown as Story
const wrapper=({children}:{children:ReactNode})=><MemoryRouter><LibraryProvider userId="reader-1">{children}</LibraryProvider></MemoryRouter>
beforeEach(()=>{vi.clearAllMocks();mocks.catalog.mockResolvedValue({stories:[story('one'),story('two')],collections:[],series:[]});mocks.collections.mockResolvedValue([]);mocks.query.mockResolvedValue(result)})
it('serializes targeted refreshes and preserves unrelated works without reloading the catalog',async()=>{
 const view=renderHook(()=>useLibrary(),{wrapper})
 await waitFor(()=>expect(view.result.current.loading).toBe(false))
 let finish!:(stories:Story[])=>void
 mocks.stories.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce([story('two','Updated two')])
 let first!:Promise<void>,second!:Promise<void>
 act(()=>{first=view.result.current.refresh(['one']);second=view.result.current.refresh(['two'])})
 await waitFor(()=>expect(mocks.stories).toHaveBeenCalledTimes(1))
 await act(async()=>{finish([story('one','Updated one')]);await first;await second})
 expect(view.result.current.stories.map(s=>s.metadata.title).sort()).toEqual(['Updated one','Updated two'])
 expect(mocks.catalog).toHaveBeenCalledTimes(1)
})
it('bounds page caching, retains pages when loading details, and invalidates obsolete query responses after an edit',async()=>{
 const view=renderHook(()=>useLibrary(),{wrapper});await waitFor(()=>expect(view.result.current.loading).toBe(false))
 const signal=new AbortController().signal
 await view.result.current.fetchPage(query,1,50,signal)
 mocks.stories.mockResolvedValue([story('one')])
 await act(()=>view.result.current.loadDetails(['one']))
 await view.result.current.fetchPage(query,1,50,signal)
 expect(mocks.query).toHaveBeenCalledTimes(1)
 for(let page=2;page<=7;page++)await view.result.current.fetchPage(query,page,50,signal)
 await view.result.current.fetchPage(query,1,50,signal)
 expect(mocks.query).toHaveBeenCalledTimes(8)
 let finish!:(value:typeof result)=>void
 mocks.query.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const old=view.result.current.fetchPage(query,8,50,signal)
 const rejection=expect(old).rejects.toMatchObject({name:'AbortError'})
 await act(()=>view.result.current.refresh(['one']))
 finish(result);await rejection
 await view.result.current.fetchPage(query,8,50,signal)
 expect(mocks.query).toHaveBeenCalledTimes(10)
})
it('discards private page caches when the account provider unmounts',async()=>{
 const first=renderHook(()=>useLibrary(),{wrapper});await waitFor(()=>expect(first.result.current.loading).toBe(false))
 await first.result.current.fetchPage(query,1,50,new AbortController().signal)
 first.unmount()
 const second=renderHook(()=>useLibrary(),{wrapper:({children})=><MemoryRouter><LibraryProvider userId="reader-2">{children}</LibraryProvider></MemoryRouter>})
 await waitFor(()=>expect(second.result.current.loading).toBe(false))
 await second.result.current.fetchPage(query,1,50,new AbortController().signal)
 expect(mocks.query).toHaveBeenCalledTimes(2)
})
it('bounds repeated detail navigation and targeted refreshes while retaining mounted editors and visible series works',async()=>{
 mocks.catalog.mockResolvedValue({stories:Array.from({length:240},(_,i)=>({...story(String(i)),detailsLoaded:false})),collections:[],series:[]})
 mocks.stories.mockImplementation(async(ids:string[])=>ids.map(id=>story(id)))
 const view=renderHook(()=>useLibrary(),{wrapper})
 await waitFor(()=>expect(view.result.current.loading).toBe(false))
 let releaseEditor!:()=>void,releaseSeries!:()=>void
 await act(async()=>{
  releaseEditor=view.result.current.retainDetails(['0'])
  releaseSeries=view.result.current.retainDetails(['1','2','3'])
  await view.result.current.loadDetails(['0','1','2','3'])
 })
 for(let i=4;i<180;i++) {
  await act(()=>i%2 ? view.result.current.loadDetails([String(i)]) : view.result.current.refresh([String(i)]))
  expect(view.result.current.stories.filter(s=>s.detailsLoaded!==false)).toHaveLength(Math.min(i+1,100))
 }
 expect(view.result.current.stories.filter(s=>s.detailsLoaded!==false).map(s=>s.id)).toEqual(expect.arrayContaining(['0','1','2','3','179']))
 expect(view.result.current.stories.find(s=>s.id==='4')).toMatchObject({detailsLoaded:false,notes:'',personalTags:[],metadata:{summary:''}})
 expect(view.result.current.stories.find(s=>s.id==='0')).toMatchObject({notes:'Private notes',metadata:{summary:'Full summary'}})
 // Overlapping mounted owners and a series larger than the budget stay usable.
 let releaseOverlap!:()=>void,releaseLarge!:()=>void
 await act(async()=>{
  releaseOverlap=view.result.current.retainDetails(['0'])
  releaseLarge=view.result.current.retainDetails(Array.from({length:120},(_,i)=>String(i)))
  await view.result.current.loadDetails(Array.from({length:120},(_,i)=>String(i)))
 })
 expect(view.result.current.stories.filter(s=>s.detailsLoaded!==false)).toHaveLength(120)
 act(()=>{releaseEditor();releaseLarge()})
 expect(view.result.current.stories.filter(s=>s.detailsLoaded!==false)).toHaveLength(100)
 expect(view.result.current.stories.find(s=>s.id==='0')?.detailsLoaded).not.toBe(false)
 act(()=>{releaseOverlap();releaseSeries()})
 await act(()=>view.result.current.loadDetails(Array.from({length:120},(_,i)=>String(i+120))))
 expect(view.result.current.stories.filter(s=>s.detailsLoaded!==false)).toHaveLength(100)
 expect(view.result.current.stories.find(s=>s.id==='0')?.detailsLoaded).toBe(false)
 expect(view.result.current.stories).toHaveLength(240)
})

it('applies the same limit when a catalog contains full details',async()=>{
 mocks.catalog.mockResolvedValue({stories:Array.from({length:140},(_,i)=>story(String(i))),collections:[],series:[]})
 const view=renderHook(()=>useLibrary(),{wrapper})
 await waitFor(()=>expect(view.result.current.loading).toBe(false))
 expect(view.result.current.stories.filter(s=>s.detailsLoaded!==false)).toHaveLength(100)
 expect(view.result.current.stories[0]).toMatchObject({id:'0',detailsLoaded:false,notes:'',metadata:{summary:''}})
 expect(view.result.current.stories[139]).toMatchObject({id:'139',notes:'Private notes'})
})


it('dismisses undo notifications when navigating to a new page', async () => {
 const view = renderHook(() => ({ library: useLibrary(), navigate: useNavigate() }), { wrapper })
 await waitFor(() => expect(view.result.current.library.loading).toBe(false))
 mocks.stories.mockResolvedValue([story('one')])
 await act(() => view.result.current.library.markFinished(story('one')))
 expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible()
 act(() => view.result.current.navigate('/', { replace: true }))
 expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible()
 act(() => view.result.current.navigate('/settings'))
 expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
})
