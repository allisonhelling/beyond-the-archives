// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
const migration='20261109000300_extension_only_retrieval.sql'
const alice='10000000-0000-0000-0000-000000000001',bob='10000000-0000-0000-0000-000000000002'
let db:PGlite
const jobs:Record<string,{id:string;token:string;batch:string;entry:string}>={}
async function user<T>(owner:string,action:()=>Promise<T>) {
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`)
 try{return await action()}finally{await db.exec('reset role;reset request.jwt.claim.sub')}
}
async function claim(owner=alice) {return user(owner,async()=>(await db.query<{job:{id:string;token:string}|null}>('select public.claim_extension_job() job')).rows[0].job)}
beforeAll(async()=>{
 db=await createTestDatabase({beforeMigration:migration})
 await db.exec(`insert into auth.users values('${alice}'),('${bob}');insert into public.metadata_preferences(user_id,retrieval_mode,retrieval_mode_mobile) values('${alice}','direct','direct')`)
 for(const [index,state] of ['pending','processing','expired','completed','failed','cancelled'].entries()) {
  const batch=await user(alice,async()=>(await db.query<{id:string}>('select public.submit_import_urls($1::text[]) id',[[`https://archiveofourown.org/works/${900000+index}`]])).rows[0].id)
  const row=(await db.query<{id:string;entry_id:string}>('select id,entry_id from public.metadata_jobs where batch_id=$1',[batch])).rows[0]
  const token=(await db.query<{id:string}>('select gen_random_uuid() id')).rows[0].id
  jobs[state]={id:row.id,entry:row.entry_id,batch,token}
  await db.query("update public.metadata_jobs set status=$2,lease_token=$3,lease_until=now()+interval '5 minutes',attempts=2 where id=$1",[row.id,state==='expired'?'processing':state,token])
  if(state==='expired')await db.query("update public.metadata_jobs set lease_until=now()-interval '1 second' where id=$1",[row.id])
  if(state==='cancelled')await user(alice,()=>db.query('select public.cancel_import_batch($1)',[batch]))
 }
 await db.query("update public.library_entries set notes='Private notes',last_read_chapter=3,reading_status='reading',is_favorite=true,metadata_overrides='{\"title\":\"Manual title\"}' where id=$1",[jobs.pending.entry])
 await db.exec(await readFile(new URL(`../migrations/${migration}`,import.meta.url),'utf8'))
},30000)
afterAll(async()=>{await db?.close()})
it('migrates pending and expired jobs in place, preserves history, and defers live leases',async()=>{
 for(const state of ['pending','expired'])expect((await db.query('select retrieval_mode,status,lease_token from public.metadata_jobs where id=$1',[jobs[state].id])).rows[0]).toEqual({retrieval_mode:'extension',status:'pending',lease_token:null})
 for(const state of ['completed','failed','cancelled','processing'])expect((await db.query('select retrieval_mode,status from public.metadata_jobs where id=$1',[jobs[state].id])).rows[0]).toEqual({retrieval_mode:'direct',status:state})
 expect((await db.query('select * from public.import_batches')).rows).toHaveLength(6)
 expect((await db.query('select * from public.import_items')).rows).toHaveLength(6)
 expect((await db.query("select * from public.processing_logs where category='extension_migration'")).rows).toHaveLength(2)
 expect(await claim()).toBeNull()
 expect(await claim(bob)).toBeNull()
})
it('recovers a deferred job after lease expiry and fences the original worker token',async()=>{
 await db.query("update public.metadata_jobs set lease_until=now()-interval '1 second' where id=$1",[jobs.processing.id])
 const next=await claim()
 expect(next).toBeTruthy()
 expect((await db.query('select retrieval_mode,status,lease_token from public.metadata_jobs where id=$1',[jobs.processing.id])).rows[0]).toMatchObject({retrieval_mode:'extension'})
 expect((await db.query<{ok:boolean}>('select public.finish_metadata_job($1,$2,null,$3,null,null,false,0) ok',[jobs.processing.id,jobs.processing.token,'{}'])).rows[0].ok).toBe(false)
 expect((await db.query<{n:number}>('select count(*)::integer n from public.library_entries')).rows[0].n).toBe(6)
 expect((await db.query('select notes,last_read_chapter,is_favorite,metadata_overrides from public.library_entries where id=$1',[jobs.pending.entry])).rows[0]).toMatchObject({notes:'Private notes',last_read_chapter:3,is_favorite:true,metadata_overrides:{title:'Manual title'}})
})
it('normalizes restored settings, prevents hosted claims, and converts a legacy retry',async()=>{
 await user(alice,()=>db.exec("update public.metadata_preferences set retrieval_mode='direct',retrieval_mode_mobile='direct'"))
 expect((await db.query('select retrieval_mode,retrieval_mode_mobile from public.metadata_preferences')).rows[0]).toEqual({retrieval_mode:'extension',retrieval_mode_mobile:null})
 expect((await db.query<{job:null}>('select public.claim_metadata_job() job')).rows[0].job).toBeNull()
 await db.query("update public.metadata_jobs set retryable=true,next_attempt_at=now()-interval '1 second' where id=$1",[jobs.failed.id])
 await user(alice,()=>db.query('select public.retry_metadata_job($1)',[jobs.failed.id]))
 expect((await db.query('select retrieval_mode,status from public.metadata_jobs where id=$1',[jobs.failed.id])).rows[0]).toEqual({retrieval_mode:'extension',status:'pending'})
 expect((await db.query<{message:string}>("select message from public.processing_logs where job_id=$1 and category='extension_migration'",[jobs.failed.id])).rows[0].message).toContain('status failed, attempts 2')
 await user(bob,async()=>{
  await expect(db.query('select public.migrate_direct_metadata_jobs($1)',[alice])).rejects.toThrow('permission denied')
  await expect(db.query('select public.retry_metadata_job($1)',[jobs.failed.id])).rejects.toThrow('Job unavailable')
  expect((await db.query('select * from public.metadata_jobs')).rows).toEqual([])
 })
})
it('normalizes legacy preferences and pending direct jobs after the restore engine re-enables triggers',async()=>{
 const backup=await user(alice,async()=>(await db.query<{backup:{tables:Record<string,Record<string,unknown>[]>}}>('select public.export_library_backup() backup')).rows[0].backup)
 backup.tables.metadata_preferences[0].retrieval_mode='direct'
 backup.tables.metadata_preferences[0].retrieval_mode_mobile='direct'
 const pending=backup.tables.metadata_jobs.find(job=>job.status==='pending')!
 pending.retrieval_mode='direct'
 await db.query('select public.restore_library_backup($1,$2,true)',[JSON.stringify(backup),bob])
 expect((await db.query('select retrieval_mode,retrieval_mode_mobile from public.metadata_preferences where user_id=$1',[bob])).rows[0]).toEqual({retrieval_mode:'extension',retrieval_mode_mobile:null})
 expect((await db.query("select * from public.metadata_jobs where user_id=$1 and retrieval_mode='direct' and status in ('pending','processing')",[bob])).rows).toEqual([])
 expect((await db.query('select notes,last_read_chapter,metadata_overrides from public.library_entries where user_id=$1 and notes=$2',[bob,'Private notes'])).rows[0]).toMatchObject({last_read_chapter:3,metadata_overrides:{title:'Manual title'}})
 expect((await db.query("select * from public.processing_logs where user_id=$1 and category='extension_migration'",[bob])).rows.length).toBeGreaterThan(0)
})
