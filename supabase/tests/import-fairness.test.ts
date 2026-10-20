// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db:PGlite
const alice='10000000-0000-0000-0000-000000000001',bob='10000000-0000-0000-0000-000000000002'
beforeAll(async()=>{db=await createTestDatabase();await db.exec(`insert into auth.users values('${alice}'),('${bob}')`)},30000)
afterAll(async()=>{await db?.close()})
async function batch(user:string,start:number,count:number) {
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}'`)
 try{return(await db.query<{id:string}>('select public.submit_import_urls($1::text[]) id',[Array.from({length:count},(_,n)=>`https://archiveofourown.org/works/${start+n}`)])).rows[0].id}
 finally{await db.exec('reset role')}
}
async function serve(mode='direct') {
 const fn=mode==='direct'?'claim_metadata_job':'claim_extension_job'
 if(mode==='extension')await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
 const job=(await db.query<{job:{id:string;token:string;workId:number}}> (`select public.${fn}() job`)).rows[0].job
 await db.exec('reset role')
 expect(job).toBeTruthy()
 const row=(await db.query<{batch_id:string;user_id:string}>('select batch_id,user_id from public.metadata_jobs where id=$1',[job.id])).rows[0]
 await db.query("select public.finish_metadata_job($1,$2,null,'{}','unavailable','Test fixture',false,0)",[job.id,job.token])
 await db.exec("update public.metadata_worker_state set next_request_at=now()-interval '1 second'")
 return row
}
it('serves a second user and a second batch before draining one large direct import',async()=>{
 const large=await batch(alice,100,10),other=await batch(bob,200,1),small=await batch(alice,300,1)
 expect((await serve()).batch_id).toBe(large)
 expect((await serve()).batch_id).toBe(other)
 expect((await serve()).batch_id).toBe(small)
 expect((await serve()).batch_id).toBe(large)
 await db.exec('delete from public.import_batches')
})
it('rotates extension batches without claiming another users private queue',async()=>{
 await db.exec(`insert into public.metadata_preferences(user_id,retrieval_mode) values('${alice}','extension'),('${bob}','extension')`)
 const large=await batch(alice,400,10),small=await batch(alice,500,1)
 await batch(bob,600,1)
 expect((await serve('extension')).batch_id).toBe(large)
 const next=await serve('extension')
 expect(next).toMatchObject({batch_id:small,user_id:alice})
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
 const history=(await db.query<{result:{summary:{total:number;active:boolean};items:unknown[]}}>('select public.paged_import_history($1,1,1,\'all\') result',[large])).rows[0].result
 expect(history.summary).toMatchObject({total:10,active:true})
 expect(history.items).toHaveLength(10)
 await db.exec('reset role')
})
