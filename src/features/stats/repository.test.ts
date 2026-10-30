import { beforeEach, expect, it, vi } from 'vitest'
import { loadStatsWorks } from './repository'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),loadLibrary:vi.fn()}))
vi.mock('../../lib/supabase',()=>({supabase:{rpc:mocks.rpc}}))
vi.mock('../../lib/sample-mode',()=>({sampleMode:false}))
vi.mock('../library/repository',()=>({loadLibrary:mocks.loadLibrary}))
beforeEach(()=>{vi.clearAllMocks()})
it('loads projected statistics with cursor pagination instead of rebuilding library relations',async()=>{
 const page=Array.from({length:500},(_,index)=>({id:`id-${index}`,key:`work-${index}`,metadata:{title:'Work'},reading_history:[],archived:false}))
 mocks.rpc.mockReturnValueOnce({abortSignal:async()=>({data:page,error:null})}).mockReturnValueOnce({abortSignal:async()=>({data:[],error:null})})
 const result=await loadStatsWorks('alice:0')
 expect(result).toHaveLength(500)
 expect(result[0].metadata.summary).toBe('')
 expect(mocks.rpc).toHaveBeenNthCalledWith(1,'reading_stats_works',{p_after:undefined,p_limit:500})
 expect(mocks.rpc).toHaveBeenNthCalledWith(2,'reading_stats_works',{p_after:'id-499',p_limit:500})
 expect(mocks.loadLibrary).not.toHaveBeenCalled()
})
it('reports missing migrations or failed statistics requests',async()=>{
 mocks.rpc.mockReturnValue({abortSignal:async()=>({data:null,error:{code:'PGRST202'}})})
 await expect(loadStatsWorks('alice:0')).rejects.toThrow('apply the latest migrations')
})

it('deduplicates concurrent loads only within the same account and revision', async()=>{
 let finish!: (value: { data: never[]; error: null }) => void
 mocks.rpc.mockReturnValue({abortSignal:()=>new Promise(resolve=>{finish=resolve})})
 const first=loadStatsWorks('alice:1'),same=loadStatsWorks('alice:1')
 expect(same).toBe(first)
 expect(mocks.rpc).toHaveBeenCalledTimes(1)
 finish({data:[],error:null});await first
 mocks.rpc.mockReturnValue({abortSignal:async()=>({data:[],error:null})})
 await loadStatsWorks('bob:1');await loadStatsWorks('alice:2')
 expect(mocks.rpc).toHaveBeenCalledTimes(3)
})
