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
 await db.exec(`insert into auth.users values('${owner}'),('${other}');insert into public.reader_app_access values('${owner}')`)
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
 expect((await db.query<{result:unknown}>('select public.reader_offline_snapshot() result')).rows[0].result).toEqual({readers:[],stories:[],cloudBooks:[]})
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

it('includes active cloud originals with no installation report and excludes deleted, inactive, unuploaded and other-account works', async () => {
 await db.exec('reset role')
 await db.query('insert into public.reader_organizer_links(user_id) values($1) on conflict do nothing',[owner])
 for (const [hash, workId, user] of [['a','8002',owner],['b','8003',owner],['c','8004',owner],['d','8005',other],['e','8006',owner],['f',null,owner]] as const) {
  await db.query('insert into public.reader_cloud_values(user_id,key,value) values($1,$2,$3)',[user,`${hash.repeat(64)}/manifest`,JSON.stringify({id:hash.repeat(64),workId,active:true,metadata:{title:`Cloud ${workId}`}})])
  if(hash!=='e') await db.query("insert into storage.objects(bucket_id,name) values('reader-epubs',$1)",[`${user}/${hash.repeat(64)}.epub`])
 }
 await db.query('insert into public.reader_cloud_values(user_id,key,value) values($1,$2,$3),($1,$4,$5)',[owner,`${'b'.repeat(64)}/deleted`,'true',`${'c'.repeat(64)}/active`,'false'])
 await db.query('update public.reader_cloud_values set value=$3 where user_id=$1 and key=$2',[owner,`${'a'.repeat(64)}/progress`,'3'])
 await asUser()
 const snapshot=(await db.query<{result:{cloudBooks:{workId:string|null;completedCount:number}[];stories:{work:{ao3_work_id:number}}[]}}>('select public.reader_offline_snapshot() result')).rows[0].result
 expect(snapshot.cloudBooks.map(book=>book.workId)).toEqual(['8002',null])
 expect(snapshot.cloudBooks[0].completedCount).toBe(3)
 expect(snapshot.stories.some(story=>story.work.ao3_work_id===8002)).toBe(true)
})
it('disconnects registered and reporting readers, preserves cloud data and other companions, and prevents reconnect through revoked secrets', async () => {
 await report(['8001']);await asUser()
 const unrelated=(await db.query<{result:{code:string}}>("select public.manage_userscript_device('create','Browser Companion') result")).rows[0].result.code
 const registered=(await db.query<{result:{secret:string}}>("select public.reader_organizer_connection('restore',$1) result",[installationId])).rows[0].result.secret
 await db.exec('reset role')
 await db.query('insert into public.reader_cloud_values(user_id,key,value) values($1,$2,$3)',[owner,`${'a'.repeat(64)}/notes`,JSON.stringify('Keep my notes')])
 await asUser()
 await db.query("select public.reader_organizer_connection('disable')")
 expect((await db.query<{result:{enabled:boolean}}>("select public.reader_organizer_connection('status') result")).rows[0].result.enabled).toBe(false)
 expect((await db.query<{result:{readers:unknown[];cloudBooks:unknown[];stories:unknown[]}}>('select public.reader_offline_snapshot() result')).rows[0].result).toEqual({readers:[],cloudBooks:[],stories:[]})
 await db.exec('reset role')
 expect((await db.query('select value from public.reader_cloud_values where user_id=$1 and key=$2',[owner,`${'a'.repeat(64)}/notes`])).rows).toEqual([{value:'Keep my notes'}])
 expect((await db.query('select id from public.library_entries where user_id=$1',[owner])).rows.length).toBeGreaterThan(0)
 expect((await db.query("select * from public.userscript_devices where secret_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",[unrelated])).rows).toHaveLength(1)
 await expect(report(['8001'])).rejects.toThrow()
 await asUser();await expect(db.query("select public.reader_organizer_connection('validate',null,$1)",[registered])).rejects.toThrow()
})
