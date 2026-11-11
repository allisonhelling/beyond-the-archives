import type { SupabaseClient } from '@supabase/supabase-js'
import type { RetrievalResult } from './adapter.ts'
export type Claim = {id:string;token:string;workId:number;attempt:number;chapterDates?:boolean;sourceUrl?:string}
export interface JobStore { finish(job:Claim,result:RetrievalResult):Promise<boolean> }
export function supabaseJobStore(client: SupabaseClient):JobStore { return {
 async finish(job,result) { const {data,error}=await client.rpc('finish_metadata_job',{p_job:job.id,p_token:job.token,p_metadata:result.metadata,p_chapters:result.chapters,p_category:result.category,p_message:result.message,p_retryable:result.retryable,p_pause_seconds:result.pauseSeconds}); if(error) throw new Error('Could not commit metadata result. Lease recovery will resume this job.'); return data===true },
} }
