import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { defaultReadingFilters } from './reading-search'
import { useLibraryResults } from './useLibraryResults'

const mocks = vi.hoisted(() => ({ fetchPage: vi.fn() }))
vi.mock('./LibraryProvider', () => ({ useLibrary: () => ({ fetchPage: mocks.fetchPage, revision: 0 }) }))
const query = { mode: 'library' as const, shelf: 'favorites', filters: defaultReadingFilters }
const result = { stories: [], series: [], total: 0, page: 2, pages: 2, sections: {}, fandoms: [] }
beforeEach(() => { mocks.fetchPage.mockReset() })

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
