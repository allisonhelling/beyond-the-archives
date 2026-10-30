// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite, secret: string
const owner='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002'
const installationId='20000000-0000-0000-0000-000000000001'
async function asUser(id=owner) { await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`) }
async function report(works:string[]) {
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 return db.query("select public.userscript_library($1,'reader_report',0,$2)",[secret,JSON.stringify({installationId,name:'Laptop Reader',url:'https://reader.example/',works})])
}
beforeAll(async()=>{
 db=await createTestDatabase()
 await db.exec(`insert into auth.users values('${owner}'),('${other}')`)
 await asUser()
 const code=(await db.query<{result:{code:string}}>("select public.manage_userscript_device('create','Reader') result")).rows[0].result.code
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 secret=(await db.query<{result:{secret:string}}>("select public.userscript_library($1,'claim') result",[code])).rows[0].result.secret
},30000)
afterAll(async()=>{await db?.close()})
it('retains named, timestamped reports per installation and scopes snapshots to the account',async()=>{
 await report(['8001']); await asUser()
 const snapshot=(await db.query<{result:{readers:{id:string;name:string;works:string[];reportedAt:string}[];stories:unknown[]}}>('select public.reader_offline_snapshot() result')).rows[0].result
 expect(snapshot.readers[0]).toMatchObject({id:installationId,name:'Laptop Reader',works:['8001']})
 expect(Date.parse(snapshot.readers[0].reportedAt)).toBeGreaterThan(0)
 await asUser(other)
 expect((await db.query<{result:unknown}>('select public.reader_offline_snapshot() result')).rows[0].result).toEqual({readers:[],stories:[]})
 await report([]); await asUser()
 expect((await db.query<{works:string[]}>('select works from public.reader_availability')).rows[0].works).toEqual([])
 await expect(report(['not-a-work'])).rejects.toThrow('Invalid reader report')
})
it('filters complete library results and invalidates them when files are removed', async()=>{
 await asUser()
 await db.exec('reset role')
 await db.exec(`insert into public.works(ao3_work_id,title,published_chapters,is_complete) values(8001,'Downloaded',10,false),(8002,'Online Only',2,true);
 insert into public.library_entries(user_id,work_id,original_url,reading_status) select '${owner}',id,'https://archiveofourown.org/works/'||ao3_work_id,'reading' from public.works;`)
 await report(['8001']); await asUser()
 const input=JSON.stringify({mode:'library',shelf:'all',reader:installationId,filters:{},terms:[]})
 async function query() { return (await db.query<{result:{total:number;stories:{metadata:{title:string}}[]}}>('select public.query_library($1,1,25) result',[input])).rows[0].result }
 expect(await query()).toMatchObject({total:1,stories:[{metadata:{title:'Downloaded'}}]})
 const snapshot=(await db.query<{result:{stories:unknown[]}}>('select public.reader_offline_snapshot() result')).rows[0].result
 expect(snapshot.stories).toHaveLength(1)
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 const entry=(await db.query<{result:{entry:{publication:{metadata:{published_chapters:number}}}}}>("select public.userscript_library($1,'get',8001) result",[secret])).rows[0].result.entry
 expect(entry.publication.metadata.published_chapters).toBe(10)
 await report([]); await asUser()
 expect(await query()).toMatchObject({total:0,stories:[]})
})
