import { readBoundedBody } from './read-body.ts'
import { retrieveTagResolution } from './tag-resolution.ts'
import { ao3TagCategories, validAo3TagName, type Ao3TagCategory, type TagResolution } from '../../src/features/library/tags/tag-resolution.ts'
import { resolveFandomRequest, type FandomResolutionStore } from './fandom-resolution.ts'
import { processFandomWork, type FandomWorker } from './fandom-worker.ts'

type Dependencies = {
 authenticate(token:string):Promise<string|null>
 cached(user:string,category:Ao3TagCategory,names:string[]):Promise<TagResolution[]>
 store(user:string,records:TagResolution[]):Promise<void>
 reserve():Promise<boolean>
 pause(seconds:number,reason:string):Promise<void>
 retrieve?:typeof retrieveTagResolution
 now?:()=>number
 fandom?:FandomResolutionStore
 fandomWorker?:FandomWorker
}
const refreshMs=30*86400000, failureMs=10*60000
export function tagResolutionHandler(deps:Dependencies) {
 return async(request:Request):Promise<Response>=>{
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'}
  const reply=(body:object,status=200)=>Response.json(body,{status,headers})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405)
  try {
   const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
   const user=token?await deps.authenticate(token):null
   if(!user)return reply({error:'Sign in to verify tags.'},401)
   const body=await readBoundedBody(request.body,100000)
   if('error' in body)return reply({error:'Invalid tag request.'},400)
   const input=JSON.parse(body.text)
   if(input.processFandoms===true&&deps.fandomWorker)return reply(await processFandomWork(user,deps.fandomWorker))
   if(!(ao3TagCategories.includes(input.category)||input.category==='fandom'&&deps.fandom)||!Array.isArray(input.names)||input.names.length<1||input.names.length>8||input.names.some((name:unknown)=>!validAo3TagName(name)))return reply({error:'Choose up to eight saved AO3 tags.'},400)
   if(input.category==='fandom'&&deps.fandom)return reply(await resolveFandomRequest([...new Set(input.names)] as string[],deps.fandom,deps,(deps.now??Date.now)(),user))
   const names=[...new Set(input.names)] as string[],category=input.category as Ao3TagCategory
   let records=await deps.cached(user,category,names)
   const now=(deps.now??Date.now)()
   const due=(name:string)=>{
    const row=records.find(row=>row.name===name)
    return !row || now-Date.parse(row.attempted_at)>failureMs && (row.status==='unverified'||now-Date.parse(row.checked_at)>refreshMs)
   }
   const name=names.find(due)
   if(!name)return reply({records,retryAfterMs:null})
   if(!await deps.reserve())return reply({records,retryAfterMs:35000})
   const result=await(deps.retrieve??retrieveTagResolution)(name,category)
   if(result.failure?.pauseSeconds)await deps.pause(result.failure.pauseSeconds,'tag_resolution')
   const attempted=new Date(now).toISOString()
   await deps.store(user,result.records.length?result.records:[{category,name,status:'unverified',canonical_name:null,checked_at:attempted,attempted_at:attempted}])
   records=await deps.cached(user,category,names)
   return reply({records,retryAfterMs:names.some(due)?Math.max(35000,(result.failure?.pauseSeconds??0)*1000):null})
  }catch{return reply({error:'Tag verification is unavailable. Saved tag searches still work.'},503)}
 }
}
