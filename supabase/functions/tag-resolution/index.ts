import { createClient } from 'npm:@supabase/supabase-js@2'
import { tagResolutionHandler } from '../../../server/ao3/tag-resolution-handler.ts'
import type { CachedFandomProfile } from '../../../server/ao3/fandom-resolution.ts'
import { supabaseFandomWorker } from '../../../server/ao3/fandom-store.ts'
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
const fandomWorker=supabaseFandomWorker(client)
Deno.serve(tagResolutionHandler({
 fandomWorker,
 fandom:{
  async cached(names){
   const {data,error}=await client.from('ao3_fandom_profiles').select('*').in('name',names)
   if(error)throw error
   return (data??[]) as CachedFandomProfile[]
  },
  store:fandomWorker.store,
  async attempts(user,names){const {data,error}=await client.from('fandom_resolution_requests').select('name,next_attempt_at').eq('user_id',user).in('name',names);if(error)throw error;return data??[]},
  async failed(user,name){await fandomWorker.finish(user,name,600)},
 },
 async authenticate(token){const {data,error}=await client.auth.getUser(token);return error?null:data.user?.id??null},
 async cached(user,category,names){
  const {data,error}=await client.from('ao3_tag_resolutions').select('*').eq('user_id',user).eq('category',category).in('name',names)
  if(error)throw error
  const canonical=[...new Set([...names,...(data??[]).flatMap(row=>row.canonical_name?[row.canonical_name]:[])])]
  const related=await client.from('ao3_tag_resolutions').select('*').eq('user_id',user).eq('category',category).in('canonical_name',canonical).limit(1000)
  if(related.error)throw related.error
  return [...new Map([...(data??[]),...(related.data??[])].map(row=>[row.name,row])).values()]
 },
 async store(user,records){const {error}=await client.rpc('store_tag_resolutions',{p_user:user,p_records:records});if(error)throw error},
 reserve:fandomWorker.reserve,
 pause:fandomWorker.pause,
}))
