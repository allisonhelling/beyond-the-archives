// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { processFandomWork, type FandomWorker } from './fandom-worker'
import { tagResolutionHandler } from './tag-resolution-handler'
import type { FandomEvidenceBatch } from '../../src/features/library/fandoms/fandom-classification'

function fixture(){
 const batch: FandomEvidenceBatch={revision:1,token:'lease',sets:[{key:'empty',fandoms:[],verifiedEmpty:true}],names:[],profiles:[],mappings:[]}
 const worker={claim:vi.fn(async()=>batch),commit:vi.fn<FandomWorker['commit']>(async()=>1),next:vi.fn(async()=>null as string|null),store:vi.fn(async()=>{}),finish:vi.fn(async()=>{}),reserve:vi.fn(async()=>true),pause:vi.fn(async()=>{}),retrieve:vi.fn(async()=>({profile:null,failure:null}))} satisfies FandomWorker
 return worker
}
it('classifies with the shared pure policy before any network work and processes at most one profile',async()=>{
 const worker=fixture();worker.next.mockResolvedValue('Missing Profile')
 expect(await processFandomWork('owner',worker)).toMatchObject({classified:2,fetched:1})
 expect(worker.retrieve).toHaveBeenCalledExactlyOnceWith('Missing Profile')
 expect(worker.claim).toHaveBeenCalledTimes(2)
 expect(worker.commit.mock.calls[0][2][0]).toMatchObject({status:'not_crossover',policy:'ao3_hierarchy_v1'})
 expect(worker.store).toHaveBeenCalledWith(expect.objectContaining({status:'unverified',hierarchy_complete:false}))
 expect(worker.finish).toHaveBeenCalledWith('owner','Missing Profile',600)
})
it('yields to direct imports without making a profile request and releases the request lease',async()=>{
 const worker=fixture();worker.next.mockResolvedValue('A');worker.reserve.mockResolvedValue(false)
 expect(await processFandomWork('owner',worker)).toMatchObject({classified:1,fetched:0,retryAfterMs:35000})
 expect(worker.retrieve).not.toHaveBeenCalled()
 expect(worker.finish).toHaveBeenCalledWith('owner','A',35)
})
it('uses the authenticated account for background processing and rejects unauthenticated calls',async()=>{
 const worker=fixture(),authenticate=vi.fn(async()=> 'actual-owner')
 const handler=tagResolutionHandler({authenticate,fandomWorker:worker,cached:async()=>[],store:async()=>{},reserve:worker.reserve,pause:worker.pause})
 const request=(auth:boolean)=>handler(new Request('https://library.test',{method:'POST',headers:auth?{authorization:'Bearer valid'}:{},body:JSON.stringify({processFandoms:true,user:'forged-owner'})}))
 expect((await request(false)).status).toBe(401);expect(worker.claim).not.toHaveBeenCalled()
 expect((await request(true)).status).toBe(200);expect(worker.claim).toHaveBeenCalledExactlyOnceWith('actual-owner')
})
