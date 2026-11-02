import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { defaultReadingFilters } from './reading-search'
import { useLibraryResults } from './useLibraryResults'

const mocks = vi.hoisted(() => ({ fetchPage: vi.fn(), fetchFacets: vi.fn(), hasCachedPage: vi.fn(), revision: 0 }))
vi.mock('./LibraryProvider', () => ({ useLibrary: () => ({ fetchPage: mocks.fetchPage, fetchFacets: mocks.fetchFacets, hasCachedPage: mocks.hasCachedPage, revision: mocks.revision }) }))
const query = { mode: 'library' as const, shelf: 'favorites', filters: defaultReadingFilters }
const result = { stories: [], series: [], total: 0, page: 2, pages: 2, sections: {}, fandoms: [] }
beforeEach(() => { mocks.revision = 0; mocks.hasCachedPage.mockReset().mockReturnValue(false); mocks.fetchPage.mockReset();mocks.fetchFacets.mockReset().mockResolvedValue({suggestions:{tags:[],characters:[],relationships:[]},fandoms:[],total:0}) })

it('retries a failed page with the same shelf, filters and pagination', async () => {
 mocks.fetchPage.mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValueOnce(result)
 const view = renderHook(() => useLibraryResults(query, 2, 25, true))
 await waitFor(() => expect(view.result.current.error).toBe('Temporary failure'))
 act(() => view.result.current.retry())
 expect(view.result.current.loading).toBe(true)
 expect(view.result.current.error).toBeUndefined()
 await waitFor(() => expect(view.result.current.result).toEqual(result))
 expect(mocks.fetchPage).toHaveBeenCalledTimes(2)
 expect(mocks.fetchPage).toHaveBeenLastCalledWith(query, 2, 25, expect.any(AbortSignal))
})

it('aborts obsolete requests and ignores their late failures when switching shelves', async () => {
 let reject!: (error: Error) => void
 mocks.fetchPage.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail })).mockResolvedValueOnce(result)
 const view = renderHook(({ shelf }) => useLibraryResults({ ...query, shelf }, 2, 25, true), { initialProps: { shelf: 'favorites' } })
 await waitFor(() => expect(mocks.fetchPage).toHaveBeenCalledTimes(1))
 const signal = mocks.fetchPage.mock.calls[0][3] as AbortSignal
 view.rerender({ shelf: 'finished' })
 expect(signal.aborted).toBe(true)
 await act(async () => { reject(new Error('Obsolete failure')) })
 await waitFor(() => expect(view.result.current.result).toEqual(result))
 expect(view.result.current.error).toBeUndefined()
})

it('renders results while suggestions are still loading and does not repeat facet requests for sorting or page changes',async()=>{
 mocks.fetchPage.mockResolvedValue(result)
 let finish!:(value:unknown)=>void
 mocks.fetchFacets.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const view=renderHook(({page,sort})=>useLibraryResults({...query,filters:{...defaultReadingFilters,sort}},page,25,true),{initialProps:{page:1,sort:'added' as typeof defaultReadingFilters.sort}})
 await waitFor(()=>expect(view.result.current.result).toEqual(result))
 expect(view.result.current.facets).toBeUndefined()
 view.rerender({page:2,sort:'alpha'})
 await waitFor(()=>expect(mocks.fetchPage).toHaveBeenCalledTimes(2))
 expect(mocks.fetchFacets).toHaveBeenCalledTimes(1)
 await act(async()=>{finish({suggestions:{tags:['Adventure']},fandoms:[],total:10})})
 expect(view.result.current.suggestions?.tags).toEqual(['Adventure'])
})


it('debounces only text edits and loads navigation, pagination, and cached text queries immediately', async () => {
 vi.useFakeTimers()
 try {
  mocks.fetchPage.mockResolvedValue(result)
  const view = renderHook(({ text, page, shelf, sort }) => useLibraryResults({ ...query, shelf, filters: { ...defaultReadingFilters, query: text, sort } }, page, 25, true), {
   initialProps: { text: '', page: 1, shelf: 'all', sort: 'added' as typeof defaultReadingFilters.sort },
  })
  expect(mocks.fetchPage).toHaveBeenCalledTimes(1)
  view.rerender({ text: 'a', page: 1, shelf: 'all', sort: 'added' })
  await act(() => vi.advanceTimersByTimeAsync(100))
  view.rerender({ text: 'ab', page: 1, shelf: 'all', sort: 'added' })
  await act(() => vi.advanceTimersByTimeAsync(149))
  expect(mocks.fetchPage).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(mocks.fetchPage).toHaveBeenCalledTimes(2)
  view.rerender({ text: 'ab', page: 2, shelf: 'all', sort: 'added' })
  expect(mocks.fetchPage).toHaveBeenCalledTimes(3)
  view.rerender({ text: 'ab', page: 2, shelf: 'all', sort: 'alpha' })
  expect(mocks.fetchPage).toHaveBeenCalledTimes(4)
  view.rerender({ text: 'ab', page: 1, shelf: 'favorites', sort: 'alpha' })
  expect(mocks.fetchPage).toHaveBeenCalledTimes(5)
  mocks.hasCachedPage.mockReturnValue(true)
  view.rerender({ text: 'cached', page: 1, shelf: 'favorites', sort: 'alpha' })
  expect(mocks.fetchPage).toHaveBeenCalledTimes(6)
  await act(() => vi.runAllTimersAsync())
  expect(mocks.fetchPage).toHaveBeenCalledTimes(6)
 } finally { vi.useRealTimers() }
})

it('cancels pending text searches when switching categories or unmounting', async () => {
 vi.useFakeTimers()
 try {
  mocks.fetchPage.mockResolvedValue(result)
  const view = renderHook(({ text, shelf }) => useLibraryResults({ ...query, shelf, filters: { ...defaultReadingFilters, within: text } }, 1, 25, true), {
   initialProps: { text: '', shelf: 'all' },
  })
  view.rerender({ text: 'pending', shelf: 'all' })
  view.rerender({ text: 'pending', shelf: 'finished' })
  expect(mocks.fetchPage).toHaveBeenCalledTimes(2)
  expect(mocks.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ shelf: 'finished' }), 1, 25, expect.any(AbortSignal))
  view.rerender({ text: 'never sent', shelf: 'finished' })
  view.unmount()
  await act(() => vi.runAllTimersAsync())
  expect(mocks.fetchPage).toHaveBeenCalledTimes(2)
 } finally { vi.useRealTimers() }
})


it('retains the last result as stale during a revision refresh and after a count failure', async () => {
 mocks.fetchPage.mockResolvedValueOnce({...result,revision:1,total:12}).mockRejectedValueOnce(new Error('Couldn’t update'))
 const view = renderHook(() => useLibraryResults(query,1,25,true))
 await waitFor(() => expect(view.result.current.result?.total).toBe(12))
 mocks.revision = 1
 view.rerender()
 expect(view.result.current.loading).toBe(true)
 expect(view.result.current.result).toBeUndefined()
 expect(view.result.current.previousResult?.total).toBe(12)
 await waitFor(() => expect(view.result.current.error).toBe('Couldn’t update'))
 expect(view.result.current.previousResult).toMatchObject({revision:1,total:12})
 expect(view.result.current.result).toBeUndefined()
})

it('does not carry work results into the Series collection while its page loads', async () => {
 mocks.fetchPage.mockResolvedValueOnce({ ...result, total: 1 }).mockImplementationOnce(() => new Promise(() => {}))
 const view = renderHook(({ shelf }) => useLibraryResults({ ...query, shelf }, 1, 25, true), { initialProps: { shelf: 'all' } })
 await waitFor(() => expect(view.result.current.result?.total).toBe(1))
 view.rerender({ shelf: 'series' })
 expect(view.result.current.loading).toBe(true)
 expect(view.result.current.result).toBeUndefined()
 expect(view.result.current.previousResult).toBeUndefined()
})

it.each(['library', 'reading'] as const)('clears tiles when switching %s collections, including after a failed load', async mode => {
 mocks.fetchPage.mockResolvedValueOnce({ ...result, total: 1 }).mockRejectedValueOnce(new Error('Unavailable'))
 const view = renderHook(({ shelf }) => useLibraryResults({ ...query, mode, shelf }, 1, 25, true), { initialProps: { shelf: 'view_all' } })
 await waitFor(() => expect(view.result.current.result?.total).toBe(1))
 view.rerender({ shelf: 'to_read' })
 expect(view.result.current.previousResult).toBeUndefined()
 await waitFor(() => expect(view.result.current.error).toBe('Unavailable'))
 expect(view.result.current.previousResult).toBeUndefined()
})

it('keeps retained ranges tied to their original page size through delayed pagination', async () => {
 const first = { ...result, total: 60, page: 1, pages: 3 }
 let finishSize!: (value: typeof first) => void, finishNext!: (value: typeof first) => void
 mocks.fetchPage.mockResolvedValueOnce(first)
  .mockImplementationOnce(() => new Promise(resolve => { finishSize = resolve }))
  .mockImplementationOnce(() => new Promise(resolve => { finishNext = resolve }))
 const view = renderHook(({ page, size }) => useLibraryResults(query, page, size, true), { initialProps: { page: 1, size: 25 } })
 await waitFor(() => expect(view.result.current.result).toEqual(first))
 expect(view.result.current.range).toEqual({ start: 1, end: 25 })
 view.rerender({ page: 1, size: 50 })
 expect(view.result.current.loading).toBe(true)
 expect(view.result.current.range).toEqual({ start: 1, end: 25 })
 view.rerender({ page: 2, size: 50 })
 await act(async () => { finishSize({ ...first, pages: 2 }) })
 expect(view.result.current.loading).toBe(true)
 expect(view.result.current.range).toEqual({ start: 1, end: 25 })
 await act(async () => { finishNext({ ...first, page: 2, pages: 2 }) })
 expect(view.result.current.range).toEqual({ start: 51, end: 60 })
 expect(view.result.current.loading).toBe(false)
})
