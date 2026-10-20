import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'

// Read-only, explicit configuration. Never prints tokens or result metadata.
const url=process.env.PERF_SUPABASE_URL,key=process.env.PERF_PUBLISHABLE_KEY
const tokens=(process.env.PERF_ACCESS_TOKENS??'').split(',').filter(Boolean)
if(!url||!key||tokens.length<2) throw new Error('Provide PERF_SUPABASE_URL, PERF_PUBLISHABLE_KEY and at least two comma-separated PERF_ACCESS_TOKENS for representative test libraries.')
if(!/^https:\/\//.test(url)) throw new Error('Hosted performance testing requires an explicit HTTPS endpoint.')
const rounds=Number(process.env.PERF_ROUNDS??5)
if(!Number.isInteger(rounds)||rounds<1||rounds>100) throw new Error('PERF_ROUNDS must be between 1 and 100.')
const reports=await Promise.all(tokens.map(async(token,index)=>{
 const expected=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub
 const headers={apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
 const samples=[]
 for(let round=0;round<rounds;round++) {
  const start=performance.now()
  const response=await fetch(`${url}/rest/v1/rpc/query_library`,{method:'POST',headers,body:JSON.stringify({p_query:{mode:'library',shelf:'all',filters:{sort:round%2?'alpha':'added'}},p_size:round%2?250:50,p_page:round+1}),signal:AbortSignal.timeout(30000)})
  if(!response.ok) throw new Error(`Reader ${index+1}: query HTTP ${response.status}`)
  const text=await response.text(),result=JSON.parse(text)
  if(result.stories.some(story=>story.user_id!==expected)) throw new Error('Data isolation check failed.')
  samples.push({ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(text),total:result.total})
 }
 const countStart=performance.now()
 const count=await fetch(`${url}/rest/v1/library_entries?select=id`,{method:'HEAD',headers:{...headers,Prefer:'count=exact'},signal:AbortSignal.timeout(30000)})
 if(!count.ok) throw new Error(`Reader ${index+1}: count HTTP ${count.status}`)
 const countMs=Math.round(performance.now()-countStart)
 const jobs=await fetch(`${url}/rest/v1/metadata_jobs?select=retrieval_mode,status,created_at,last_attempt_at,completed_at&order=completed_at.desc.nullslast&limit=1000`,{headers,signal:AbortSignal.timeout(30000)})
 if(!jobs.ok) throw new Error(`Reader ${index+1}: throughput HTTP ${jobs.status}`)
 const records=await jobs.json()
 const throughput=Object.fromEntries(['direct','extension'].map(mode=>{
  const done=records.filter(job=>job.retrieval_mode===mode&&job.status==='completed'&&job.completed_at&&job.last_attempt_at)
  const times=done.map(job=>Date.parse(job.completed_at)).sort((a,b)=>a-b),elapsed=times.length>1?times.at(-1)-times[0]:0
  return [mode,{observedCompletions:done.length,observedWindowMs:elapsed,completionsPerHour:elapsed>0?(done.length-1)*3600000/elapsed:null,meanAttemptMs:done.length?done.reduce((n,j)=>n+Date.parse(j.completed_at)-Date.parse(j.last_attempt_at),0)/done.length:null}]
 }))
 return {reader:index+1,samples,countMs,throughput}
}))
await mkdir('artifacts/performance',{recursive:true})
await writeFile('artifacts/performance/hosted.json',JSON.stringify({concurrentReaders:tokens.length,rounds,reports},null,2))
console.log(`Recorded ${tokens.length} concurrent readers. Report: artifacts/performance/hosted.json`)
