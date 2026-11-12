import { classifyFandomBatch, type FandomEvidenceBatch, type FandomSetResult } from '../../src/features/library/fandoms/fandom-classification.ts'
import { ao3TagUrl } from './tag-resolution.ts'
import { fandomParserVersion, retrieveFandomProfile, type FandomProfile } from './fandom-resolution.ts'

export type FandomWorker = {
 claim(user: string): Promise<FandomEvidenceBatch>
 commit(user: string, batch: FandomEvidenceBatch, results: FandomSetResult[]): Promise<number>
 next(user: string): Promise<string | null>
 store(profile: FandomProfile): Promise<void>
 finish(user: string, name: string, delay: number): Promise<void>
 reserve(): Promise<boolean>; pause(seconds: number, reason: string): Promise<void>
 retrieve?: typeof retrieveFandomProfile
 now?: () => number
}

/** One profile and at most two twenty-set classification batches per invocation. */
export async function processFandomWork(user: string, worker: FandomWorker) {
 const classify = async () => {
  const batch = await worker.claim(user)
  return batch.sets.length ? worker.commit(user,batch,classifyFandomBatch(batch,(worker.now ?? Date.now)())) : 0
 }
 let classified = await classify()
 const name = await worker.next(user)
 if (!name) return { classified, fetched: 0, retryAfterMs: 60000 }
 if (!await worker.reserve()) { await worker.finish(user,name,35); return { classified,fetched:0,retryAfterMs:35000 } }
 const result = await (worker.retrieve ?? retrieveFandomProfile)(name)
 if (result.failure?.pauseSeconds) await worker.pause(result.failure.pauseSeconds,'fandom_resolution')
 await worker.store(result.profile ?? { name,canonical_name:null,status:'unverified',aliases:[],metatag_names:[],hierarchy_state:'missing',profile_complete:false,hierarchy_complete:false,parser_version:fandomParserVersion,profile_url:ao3TagUrl(name) })
 const usable = result.profile && (result.profile.status !== 'canonical' || result.profile.hierarchy_complete)
 await worker.finish(user,name,usable ? 30*86400 : Math.max(600,result.failure?.pauseSeconds ?? 0))
 classified += await classify()
 return { classified,fetched:1,retryAfterMs:Math.max(35000,(result.failure?.pauseSeconds ?? 0)*1000) }
}
