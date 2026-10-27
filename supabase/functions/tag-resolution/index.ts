import { createClient } from 'npm:@supabase/supabase-js@2'
import { tagResolutionHandler } from '../../../server/ao3/tag-resolution-handler.ts'
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
Deno.serve(tagResolutionHandler({
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
 async reserve(){const {data,error}=await client.rpc('reserve_tag_resolution');if(error)throw error;return data===true},
 async pause(seconds,reason){const {error}=await client.rpc('pause_series_preview',{p_seconds:seconds,p_reason:reason});if(error)throw error},
}))
