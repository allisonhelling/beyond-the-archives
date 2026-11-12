import type { SupabaseClient } from '@supabase/supabase-js'
import type { FandomEvidenceBatch } from '../../src/features/library/fandoms/fandom-classification.ts'
import type { FandomWorker } from './fandom-worker.ts'

/** Service-client boundary shared by the Edge Function and scheduled operator. */
export function supabaseFandomWorker(client: SupabaseClient): FandomWorker {
 return {
  async claim(user){const {data,error}=await client.rpc('claim_fandom_classifications',{p_user:user});if(error)throw error;return data as FandomEvidenceBatch},
  async commit(user,batch,results){const {data,error}=await client.rpc('commit_fandom_classifications',{p_user:user,p_token:batch.token,p_revision:batch.revision,p_results:results});if(error)throw error;return data as number},
  async next(user){const {data,error}=await client.rpc('claim_fandom_resolution',{p_user:user});if(error)throw error;return data as string|null},
  async store(profile){const {error}=await client.rpc('store_fandom_profile',{p_profile:profile});if(error)throw error},
  async finish(user,name,delay){const {error}=await client.rpc('finish_fandom_resolution',{p_user:user,p_name:name,p_delay:delay});if(error)throw error},
  async reserve(){const {data,error}=await client.rpc('reserve_tag_resolution');if(error)throw error;return data===true},
  async pause(seconds,reason){const {error}=await client.rpc('pause_series_preview',{p_seconds:seconds,p_reason:reason});if(error)throw error},
 }
}
