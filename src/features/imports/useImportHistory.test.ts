import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useImportHistory } from './useImportHistory'
const mocks = vi.hoisted(() => ({ history: vi.fn(), refresh: vi.fn(), checkRevision: vi.fn() }))
vi.mock('./repository', () => ({ importHistory: mocks.history }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refresh: mocks.refresh, checkRevision: mocks.checkRevision }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.refresh.mockResolvedValue(undefined); mocks.checkRevision.mockResolvedValue(undefined) })
const history = (id: string, finished = false) => ({ batches: [{id:'batch'}], items: [], jobs: [], changes: [{id,entry_id:id,status:'completed'}], summary: {active:!finished,total:3,counts:{}} })
it('coalesces affected entries while a bulk import runs and flushes once it finishes', async () => {
 let now = 100_000
 vi.spyOn(Date,'now').mockImplementation(()=>now)
 mocks.history.mockResolvedValue(history('first'))
 const view = renderHook(()=>useImportHistory('batch',1,1,'all',false,false))
 await act(()=>view.result.current.reload())
 expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(['first'])
 now += 5000
 mocks.history.mockResolvedValue(history('second'))
 await act(()=>view.result.current.reload())
 now += 5000
 mocks.history.mockResolvedValue(history('third'))
 await act(()=>view.result.current.reload())
 expect(mocks.refresh).toHaveBeenCalledTimes(1)
 mocks.history.mockResolvedValue(history('third',true))
 await act(()=>view.result.current.reload())
 expect(mocks.refresh).toHaveBeenLastCalledWith(['second','third'])
 expect(mocks.checkRevision).toHaveBeenCalledExactlyOnceWith(true)
 await act(()=>view.result.current.reload())
 expect(mocks.refresh).toHaveBeenCalledTimes(2)
 expect(mocks.checkRevision).toHaveBeenCalledTimes(1)
})
it('refreshes affected entries periodically before an import finishes', async () => {
 let now = 100_000
 vi.spyOn(Date,'now').mockImplementation(()=>now)
 mocks.history.mockResolvedValue(history('first'))
 const view = renderHook(()=>useImportHistory('batch',1,1,'all',false,false))
 await act(()=>view.result.current.reload())
 now += 30_000
 mocks.history.mockResolvedValue(history('second'))
 await act(()=>view.result.current.reload())
 await waitFor(()=>expect(mocks.refresh).toHaveBeenLastCalledWith(['second']))
 expect(mocks.checkRevision).not.toHaveBeenCalled()
})
