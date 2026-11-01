// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite, secret: string
const owner='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002'
const installationId='20000000-0000-0000-0000-000000000001'
async function asUser(id=owner) { await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`) }
async function report(works:string[], input:Record<string,unknown>={}) {
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 return db.query("select public.userscript_library($1,'reader_report',0,$2)",[secret,JSON.stringify({installationId,name:'Laptop Reader',url:'https://reader.example/',works,...input})])
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

it('replaces a report after credential rotation without duplicating an installation',async()=>{
 await report(['8001'])
 await asUser()
 const code=(await db.query<{result:{code:string}}>("select public.manage_userscript_device('create','My Reader') result")).rows[0].result.code
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 const secondSecret=(await db.query<{result:{secret:string}}>("select public.userscript_library($1,'claim') result",[code])).rows[0].result.secret
 await db.query("select public.userscript_library($1,'reader_report',0,$2)",[secondSecret,JSON.stringify({installationId,name:'My Reader',url:'https://reader.example/',works:['8002']})])
 await asUser()
 const reports=(await db.query<{installation_id:string;works:string[]}>('select installation_id,works from public.reader_availability where installation_id=$1',[installationId])).rows
 expect(reports).toEqual([{installation_id:installationId,works:['8002']}])
})
it('cleans known same-browser aliases only for the same owner and origin',async()=>{
 const alias='20000000-0000-0000-0000-000000000002',independent='20000000-0000-0000-0000-000000000003',foreignOrigin='20000000-0000-0000-0000-000000000004'
 await report(['8001'],{installationId:alias,name:'My Reader'})
 await report(['8001'],{installationId:independent,name:'My Reader'})
 await report(['8001'],{installationId:foreignOrigin,name:'My Reader',url:'https://other-reader.example/'})
 await db.exec('reset role')
 const foreignDevice=(await db.query<{id:string}>("insert into public.userscript_devices(user_id,name,secret_hash,paired) values($1,'My Reader','other-report-secret',true) returning id",[other])).rows[0].id
 await db.query("insert into public.reader_availability(device_id,user_id,installation_id,name,url,works) values($1,$2,$3,'My Reader','https://reader.example/','[]')",[foreignDevice,other,alias])
 await report(['8002'],{previousInstallationIds:[alias,foreignOrigin]})
 await asUser()
 const ids=(await db.query<{installation_id:string}>('select installation_id from public.reader_availability')).rows.map(row=>row.installation_id)
 expect(ids).not.toContain(alias);expect(ids).toContain(independent);expect(ids).toContain(foreignOrigin)
 await asUser(other)
 expect((await db.query('select installation_id from public.reader_availability where installation_id=$1',[alias])).rows).toHaveLength(1)
 await expect(report([],{previousInstallationIds:['invalid']})).rejects.toThrow('Invalid previous reader installations')
})
