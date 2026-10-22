import type { SupabaseClient } from '@supabase/supabase-js'
import { failure, retrieveMetadata, type RetrievalResult } from './adapter.ts'
import { validateMetadata } from './metadata-service.ts'
export type Claim = {id:string;token:string;workId:number;attempt:number;chapterDates?:boolean}
export interface JobStore { claim(): Promise<Claim|null>; finish(job:Claim,result:RetrievalResult):Promise<boolean> }
export function supabaseJobStore(client: SupabaseClient):JobStore { return {
 async claim() { const {data,error}=await client.rpc('claim_metadata_job'); if(error) throw new Error('Could not claim metadata job.'); return data as Claim|null },
 async finish(job,result) { const {data,error}=await client.rpc('finish_metadata_job',{p_job:job.id,p_token:job.token,p_metadata:result.metadata,p_chapters:result.chapters,p_category:result.category,p_message:result.message,p_retryable:result.retryable,p_pause_seconds:result.pauseSeconds}); if(error) throw new Error('Could not commit metadata result. Lease recovery will resume this job.'); return data===true },
} }
/** Exactly one item per execution; pacing, leases, retries and ownership live in PostgreSQL. */
export async function runWorkerOnce(store:JobStore,retrieve=retrieveMetadata) {
 const job=await store.claim(); if(!job) return {claimed:false,committed:false}
 let result:RetrievalResult
 try { result=validateMetadata(await retrieve({workId:job.workId,normalizedUrl:`https://archiveofourown.org/works/${job.workId}`,chapterDates:job.chapterDates})) }
 catch { result=failure('parser_failure','Metadata adapter failed. The saved work remains editable.') }
 return {claimed:true,committed:await store.finish(job,result)}
}
