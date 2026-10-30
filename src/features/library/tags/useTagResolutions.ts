import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { AuthContext } from '../../auth/auth-context'
import { supabase } from '../../../lib/supabase'
import { sampleMode } from '../../../lib/sample-mode'
import { tagResolutionEvent, type Ao3TagCategory, type TagResolution } from './tag-resolution'

const empty:TagResolution[]=[]
const cachedLoads=new Map<string,Promise<void>>()
const stores=new Map<string,{records:TagResolution[];listeners:Set<()=>void>}>()
function store(user:string){let state=stores.get(user);if(!state){state={records:[],listeners:new Set()};stores.set(user,state)}return state}
function publish(user:string,rows:TagResolution[]){
 const state=store(user),records=new Map(state.records.map(row=>[`${row.category}:${row.name}`,row]))
 let changed=false
 for(const row of rows){const key=`${row.category}:${row.name}`,prior=records.get(key);if((prior?.canonical_name||row.canonical_name)&&(!prior||prior.status!==row.status||prior.canonical_name!==row.canonical_name))changed=true;records.set(key,row)}
 state.records=[...records.values()];for(const listener of state.listeners)listener()
 if(changed)window.dispatchEvent(new CustomEvent(tagResolutionEvent,{detail:{userId:user}}))
}
// Share one paginated cache read across tiles and suggestion fields. Limiting this
// to the eight lookup candidates hid already-verified tags elsewhere in a list.
function loadCached(user:string){
 let request=cachedLoads.get(user)
 if(!request){request=(async()=>{
  const rows:TagResolution[]=[]
  for(let offset=0;;offset+=500){
   const {data,error}=await supabase!.from('ao3_tag_resolutions').select('category,name,status,canonical_name,checked_at,attempted_at').eq('user_id',user).order('category').order('name').range(offset,offset+499)
   if(error)throw error
   rows.push(...(data as TagResolution[]??[]))
   if(!data||data.length<500)break
  }
  // A paced lookup may have finished while this snapshot was in flight.
  const current=new Map(store(user).records.map(row=>[`${row.category}:${row.name}`,row.attempted_at]))
  publish(user,rows.filter(row=>(current.get(`${row.category}:${row.name}`)??'')<=row.attempted_at))
 })().catch(error=>{cachedLoads.delete(user);throw error});cachedLoads.set(user,request)}
 return request
}
const pending=new Map<string,Promise<{records:TagResolution[];retryAfterMs:number|null}>>()
async function resolve(user:string,category:Ao3TagCategory,names:string[]){
 const key=JSON.stringify([user,category,names])
 let request=pending.get(key)
 if(!request){request=(async()=>{const {data,error}=await supabase!.functions.invoke('tag-resolution',{body:{category,names}});if(error)throw error;return data as {records:TagResolution[];retryAfterMs:number|null}})();pending.set(key,request)}
 try{const result=await request;publish(user,result.records);return result}finally{pending.delete(key)}
}

/** Focused suggestions request at most eight tags; result navigation never waits. */
export function useTagResolutions(category:Ao3TagCategory|undefined,names:string[],enabled:boolean){
 const user=useContext(AuthContext)?.session?.user.id
 const subscribe=useCallback((listener:()=>void)=>{if(!user)return()=>{};const state=store(user);state.listeners.add(listener);return()=>{state.listeners.delete(listener)}},[user])
 const snapshot=useCallback(()=>user?store(user).records:empty,[user])
 const records=useSyncExternalStore(subscribe,snapshot,()=>empty)
 const [unavailable,setUnavailable]=useState(false)
 useEffect(()=>{
  if(!user||!supabase||sampleMode)return
  let alive=true
  void loadCached(user).catch(()=>{if(alive)setUnavailable(true)})
  return()=>{alive=false}
 },[user])
 const key=JSON.stringify(names.slice(0,8))
 useEffect(()=>{
  if(!enabled||!user||!category||!supabase||sampleMode)return
  const requested=JSON.parse(key) as string[]
  if(!requested.length)return
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined
  async function lookup(){
   try{
    const result=await resolve(user!,category!,requested)
    if(!alive)return
    setUnavailable(false)
    if(result.retryAfterMs!==null)timer=setTimeout(()=>{if(alive)void lookup()},Math.max(35000,result.retryAfterMs))
   }catch{if(alive)setUnavailable(true)}
  }
  timer=setTimeout(()=>void lookup(),750)
  return()=>{alive=false;clearTimeout(timer)}
 },[user,category,enabled,key])
 return {records,unavailable}
}
