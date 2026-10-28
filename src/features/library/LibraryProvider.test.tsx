import { MemoryRouter, useNavigate } from 'react-router-dom'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { blankMetadata, type Story } from './model'
import { defaultReadingFilters } from './reading-search'
const mocks=vi.hoisted(()=>({catalog:vi.fn(),stories:vi.fn(),collections:vi.fn(),query:vi.fn(),series:vi.fn(),facets:vi.fn(),navigation:vi.fn(),revision:vi.fn()}))
vi.mock('./repository',async importOriginal=>({...(await importOriginal<typeof import('./repository')>()),loadLibraryFacets:mocks.facets,loadLibraryNavigation:mocks.navigation,loadLibraryRevision:mocks.revision,loadCatalog:mocks.catalog,loadStories:mocks.stories,loadAffectedCollections:mocks.collections,loadCollections:mocks.collections,queryLibrary:mocks.query,loadSeriesRecord:mocks.series,deleteStory:vi.fn(),restoreStory:vi.fn(),updateEntry:vi.fn()}))
import { LibraryProvider, useLibrary } from './LibraryProvider'
const query={mode:'library' as const,shelf:'all',filters:defaultReadingFilters}
const result={stories:[],series:[],total:0,page:1,pages:1,sections:{},fandoms:[]}
const story=(id:string,title=id)=>({id,metadata:{...blankMetadata,title,summary:'Full summary'},notes:'Private Notes',personalTags:['Personal tag'],work:{ao3_work_id:1,verified_chapters:{'1':'910'}},collectionIds:[],reading_status:'reading',last_read_chapter:0}) as unknown as Story
const wrapper=({children}:{children:ReactNode})=><MemoryRouter><LibraryProvider userId="reader-1">{children}</LibraryProvider></MemoryRouter>
beforeEach(()=>{vi.clearAllMocks();mocks.catalog.mockResolvedValue({stories:[story('one'),story('two')],collections:[],series:[]});mocks.collections.mockResolvedValue([]);mocks.revision.mockResolvedValue(0);mocks.navigation.mockResolvedValue({counts:{},revision:0});mocks.facets.mockResolvedValue({suggestions:{tags:[],relationships:[],characters:[]},fandoms:[],total:0});mocks.query.mockResolvedValue(result)})
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
 expect(mocks.catalog).not.toHaveBeenCalled()
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
 await act(()=>view.result.current.ensureCatalog())
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
 expect(view.result.current.stories.find(s=>s.id==='0')).toMatchObject({notes:'Private Notes',metadata:{summary:'Full summary'}})
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
 await act(()=>view.result.current.ensureCatalog())
 expect(view.result.current.stories.filter(s=>s.detailsLoaded!==false)).toHaveLength(100)
 expect(view.result.current.stories[0]).toMatchObject({id:'0',detailsLoaded:false,notes:'',metadata:{summary:''}})
 expect(view.result.current.stories[139]).toMatchObject({id:'139',notes:'Private Notes'})
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

it('retains only the newest three notifications across reading and removal actions', async () => {
 const view = renderHook(() => useLibrary(), { wrapper })
 await waitFor(() => expect(view.result.current.loading).toBe(false))
 mocks.stories.mockImplementation(async (ids: string[]) => ids.map(id => story(id)))
 for (const id of ['first', 'second', 'third']) await act(() => view.result.current.markFinished(story(id)))
 await act(() => view.result.current.removeStory(story('fourth')))
 expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(3)
 expect(screen.queryByRole('button', { name: 'Dismiss Undo Notification for first' })).not.toBeInTheDocument()
 await act(() => view.result.current.markFinished(story('fifth')))
 expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(3)
 expect(screen.queryByRole('button', { name: 'Dismiss Undo Notification for second' })).not.toBeInTheDocument()
})

it('shows navigation and pages without requesting the catalog, and deduplicates on-demand catalog loads', async () => {
 const view=renderHook(()=>useLibrary(),{wrapper})
 await waitFor(()=>expect(view.result.current.loading).toBe(false))
 expect(mocks.catalog).not.toHaveBeenCalled()
 await act(()=>view.result.current.fetchPage(query,1,50,new AbortController().signal))
 expect(mocks.query).toHaveBeenCalledTimes(1)
 expect(mocks.catalog).not.toHaveBeenCalled()
 await act(async()=>{await Promise.all([view.result.current.ensureCatalog(),view.result.current.ensureCatalog()])})
 expect(mocks.catalog).toHaveBeenCalledTimes(1)
 expect(view.result.current.catalogLoaded).toBe(true)
})
it('caches facets across filters, sorting and pagination, and preserves unrelated collection pages after an edit',async()=>{
 const view=renderHook(()=>useLibrary(),{wrapper})
 await waitFor(()=>expect(view.result.current.loading).toBe(false))
 const signal=new AbortController().signal, first={...query,shelf:'first'}, second={...query,shelf:'second'}
 const original={...story('one'),collectionIds:['first']}
 mocks.stories.mockResolvedValue([original])
 await act(()=>view.result.current.loadDetails(['one']))
 await act(async()=>{
  await view.result.current.fetchPage(first,1,50,signal)
  await view.result.current.fetchPage(second,1,50,signal)
  await view.result.current.fetchFacets(first,signal)
  await view.result.current.fetchFacets({...first,filters:{...defaultReadingFilters,sort:'alpha',tags:'changed'}},signal)
  await view.result.current.fetchFacets(second,signal)
 })
 expect(mocks.facets).toHaveBeenCalledTimes(2)
 mocks.stories.mockResolvedValue([{...original,notes:'Edited'}])
 await act(()=>view.result.current.refresh(['one']))
 await act(async()=>{
  await view.result.current.fetchPage(second,1,50,signal)
  await view.result.current.fetchFacets(second,signal)
 })
 expect(mocks.query).toHaveBeenCalledTimes(2)
 expect(mocks.facets).toHaveBeenCalledTimes(2)
 await act(async()=>{
  await view.result.current.fetchPage(first,1,50,signal)
  await view.result.current.fetchFacets(first,signal)
 })
 expect(mocks.query).toHaveBeenCalledTimes(3)
 expect(mocks.facets).toHaveBeenCalledTimes(3)
})

it('retries an on-demand catalog failure after refreshing and hydrates compact page identities for detail navigation',async()=>{
 mocks.catalog.mockRejectedValueOnce(new Error('Catalog unavailable'))
 const view=renderHook(()=>useLibrary({catalog:true}),{wrapper})
 await waitFor(()=>expect(view.result.current.error).toBe('Catalog unavailable'))
 await act(()=>view.result.current.refresh())
 await waitFor(()=>expect(view.result.current.catalogLoaded).toBe(true))
 expect(view.result.current.error).toBe('')
 const other={...story('three'),automaticCollectionIds:['automatic']}
 mocks.query.mockResolvedValue({...result,stories:[other]})
 await act(()=>view.result.current.fetchPage(query,1,50,new AbortController().signal))
 expect(view.result.current.stories.find(item=>item.id==='three')).toMatchObject({detailsLoaded:false,automaticCollectionIds:['automatic']})
 mocks.stories.mockResolvedValue([other])
 await act(()=>view.result.current.loadDetails(['three']))
 expect(view.result.current.stories.find(item=>item.id==='three')).toMatchObject({notes:'Private Notes',metadata:{summary:'Full summary'}})
})
it('preserves work pages and their facets when only collection appearance changes',async()=>{
 const view=renderHook(()=>useLibrary(),{wrapper})
 await waitFor(()=>expect(view.result.current.loading).toBe(false))
 const signal=new AbortController().signal
 await act(async()=>{await view.result.current.fetchPage(query,1,50,signal);await view.result.current.fetchFacets(query,signal)})
 mocks.collections.mockResolvedValue([{id:'new',name:'Renamed',color:'#123456',automatic_rules:null}])
 await act(()=>view.result.current.refreshCollections())
 await act(async()=>{await view.result.current.fetchPage(query,1,50,signal);await view.result.current.fetchFacets(query,signal)})
 expect(mocks.query).toHaveBeenCalledTimes(1)
 expect(mocks.facets).toHaveBeenCalledTimes(1)
 expect(mocks.catalog).not.toHaveBeenCalled()
})

it('invalidates tag-filtered pages after verified aliases arrive without reloading unfiltered pages or facets',async()=>{
 const {tagResolutionEvent}=await import('./tags/tag-resolution')
 const view=renderHook(()=>useLibrary(),{wrapper});await waitFor(()=>expect(view.result.current.loading).toBe(false))
 const tagged={...query,filters:{...defaultReadingFilters,characters:'Alya Césaire'}},signal=new AbortController().signal
 await act(async()=>{await view.result.current.fetchPage(query,1,50,signal);await view.result.current.fetchPage(tagged,1,50,signal)})
 await act(async()=>{window.dispatchEvent(new CustomEvent(tagResolutionEvent,{detail:{userId:'someone-else'}}))})
 expect(view.result.current.tagRevision).toBe(0)
 await act(async()=>{window.dispatchEvent(new CustomEvent(tagResolutionEvent,{detail:{userId:'reader-1'}}))})
 expect(view.result.current.tagRevision).toBe(1)
 await act(async()=>{await view.result.current.fetchPage(query,1,50,signal);await view.result.current.fetchPage(tagged,1,50,signal)})
 expect(mocks.query).toHaveBeenCalledTimes(3)
})

it('does not cache an in-flight tag query completed after its alias evidence changes',async()=>{
 const {tagResolutionEvent}=await import('./tags/tag-resolution')
 const view=renderHook(()=>useLibrary(),{wrapper});await waitFor(()=>expect(view.result.current.loading).toBe(false))
 let finish!:(value:typeof result)=>void
 mocks.query.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue(result)
 const tagged={...query,filters:{...defaultReadingFilters,characters:'Alya Césaire'}},signal=new AbortController().signal
 const old=view.result.current.fetchPage(tagged,1,50,signal).catch(error=>error)
 await act(async()=>{window.dispatchEvent(new CustomEvent(tagResolutionEvent,{detail:{userId:'reader-1'}}));finish(result)})
 expect(await old).toMatchObject({name:'AbortError'})
 await act(async()=>{await view.result.current.fetchPage(tagged,1,50,signal)})
 expect(mocks.query).toHaveBeenCalledTimes(2)
})


it('retains display pages until a server revision changes', async () => {
 const view = renderHook(() => useLibrary(), { wrapper })
 await waitFor(() => expect(view.result.current.loading).toBe(false))
 let now = 1000
 vi.spyOn(Date, 'now').mockImplementation(() => now)
 const signal = new AbortController().signal
 await act(() => view.result.current.fetchPage(query, 1, 50, signal))
 expect(view.result.current.hasCachedPage(query, 1, 50)).toBe(true)
 now += 29_999
 await act(() => view.result.current.fetchPage(query, 1, 50, signal))
 expect(mocks.query).toHaveBeenCalledTimes(1)
 now += 60_000
 expect(view.result.current.hasCachedPage(query, 1, 50)).toBe(true)
 mocks.revision.mockResolvedValue(1)
 await act(() => view.result.current.checkRevision(true))
 expect(view.result.current.hasCachedPage(query, 1, 50)).toBe(false)
 await act(() => view.result.current.fetchPage(query, 1, 50, signal))
 expect(mocks.query).toHaveBeenCalledTimes(2)
})


it('checks the server on tab return, invalidates older pages, and ignores late responses', async () => {
 mocks.revision.mockResolvedValue(4)
 mocks.navigation.mockResolvedValue({counts:{all:{works:12,series:0,updated_at:null}},revision:4})
 mocks.query.mockResolvedValue({...result,revision:4,total:12})
 const view = renderHook(() => useLibrary(),{wrapper})
 await waitFor(() => expect(view.result.current.loading).toBe(false))
 await act(() => view.result.current.fetchPage(query,1,50,new AbortController().signal))
 await waitFor(() => expect(view.result.current.navigation.all?.works).toBe(12))
 let finish!:(value:typeof result & {revision:number})=>void
 mocks.query.mockImplementationOnce(() => new Promise(resolve=>{finish=resolve}))
 const late = view.result.current.fetchPage(query,2,50,new AbortController().signal).catch(error=>error)
 mocks.revision.mockResolvedValue(5)
 mocks.navigation.mockResolvedValue({counts:{all:{works:13,series:0,updated_at:null}},revision:5})
 await act(async()=>{window.dispatchEvent(new Event('focus'))})
 await waitFor(() => expect(view.result.current.hasCachedPage(query,1,50)).toBe(false))
 await act(async()=>{finish({...result,revision:4})})
 expect(await late).toMatchObject({name:'AbortError'})
 expect(view.result.current.hasCachedPage(query,2,50)).toBe(false)
 await waitFor(() => expect(view.result.current.navigation.all?.works).toBe(13))
 mocks.revision.mockRejectedValueOnce(new Error('Offline'))
 await act(()=>view.result.current.checkRevision(true))
 expect(view.result.current.revisionError).toBe('Couldn’t update counts.')
 expect(view.result.current.navigation.all?.works).toBe(13)
 await act(()=>view.result.current.retryCounts())
 expect(view.result.current.revisionError).toBe('')
})

it('coalesces simultaneous revision checks and retains counts after a navigation refresh fails', async () => {
 const view = renderHook(() => useLibrary(),{wrapper})
 await waitFor(() => expect(view.result.current.loading).toBe(false))
 mocks.navigation.mockResolvedValue({counts:{all:{works:9,series:0,updated_at:null}},revision:0})
 await act(()=>view.result.current.fetchPage(query,1,50,new AbortController().signal))
 await waitFor(()=>expect(view.result.current.navigation.all?.works).toBe(9))
 let finish!:(revision:number)=>void
 mocks.revision.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const before = mocks.revision.mock.calls.length
 let first!:Promise<void>,second!:Promise<void>
 act(()=>{first=view.result.current.checkRevision(true);second=view.result.current.checkRevision(true)})
 expect(mocks.revision).toHaveBeenCalledTimes(before+1)
 await act(async()=>{finish(0);await first;await second})
 mocks.navigation.mockRejectedValueOnce(new Error('Couldn’t update counts.'))
 await act(()=>view.result.current.retryCounts())
 await waitFor(()=>expect(view.result.current.navigationError).toBe('Couldn’t update counts.'))
 expect(view.result.current.navigation.all?.works).toBe(9)
})

it('queues series suggestions behind results while ordinary work requests remain independent',async()=>{
 const view=renderHook(()=>useLibrary(),{wrapper});await waitFor(()=>expect(view.result.current.loading).toBe(false))
 const seriesQuery={...query,shelf:'series'}
 let finish!:(value:typeof result)=>void
 mocks.query.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue(result)
 const page=view.result.current.fetchPage(seriesQuery,1,50,new AbortController().signal)
 await waitFor(()=>expect(mocks.query).toHaveBeenCalledTimes(1))
 const facets=view.result.current.fetchFacets(seriesQuery,new AbortController().signal)
 await view.result.current.fetchPage(query,1,50,new AbortController().signal)
 expect(mocks.query).toHaveBeenCalledTimes(2)
 expect(mocks.facets).not.toHaveBeenCalled()
 await act(async()=>{finish(result);await page;await facets})
 expect(mocks.facets).toHaveBeenCalledTimes(1)
})

it('skips aborted queued series reads and releases the queue after failures',async()=>{
 const view=renderHook(()=>useLibrary(),{wrapper});await waitFor(()=>expect(view.result.current.loading).toBe(false))
 const seriesQuery={...query,shelf:'series'}
 let fail!:(error:Error)=>void
 mocks.query.mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject})).mockResolvedValue(result)
 const page=view.result.current.fetchPage(seriesQuery,1,50,new AbortController().signal)
 const rejected=expect(page).rejects.toThrow('Temporary timeout')
 await waitFor(()=>expect(mocks.query).toHaveBeenCalledTimes(1))
 const controller=new AbortController()
 const cancelled=view.result.current.fetchFacets(seriesQuery,controller.signal)
 const aborted=expect(cancelled).rejects.toMatchObject({name:'AbortError'})
 controller.abort()
 await act(async()=>{fail(new Error('Temporary timeout'));await rejected;await aborted})
 expect(mocks.facets).not.toHaveBeenCalled()
 await act(()=>view.result.current.fetchPage(seriesQuery,1,50,new AbortController().signal))
 expect(mocks.query).toHaveBeenCalledTimes(2)
})
