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
it('removes only an owner’s selected installation report and preserves credentials and books', async () => {
 await db.exec('begin')
 try {
  await report(['84001'])
  const older='20000000-0000-0000-0000-000000000009'
  await report(['84002'],{installationId:older})
  await asUser()
  const revision=(await db.query<{r:number}>('select public.library_revision() r')).rows[0].r
  await db.exec(`reset role;insert into public.reader_app_access values('${other}') on conflict do nothing`)
  await asUser(other)
  await db.query("select public.reader_organizer_connection('forget_report',$1)",[older])
  await asUser()
  expect((await db.query<{n:number}>('select count(*)::integer n from public.reader_availability')).rows[0].n).toBe(2)
  await db.query("select public.reader_organizer_connection('forget_report',$1)",[older])
  expect((await db.query<{id:string}>('select installation_id id from public.reader_availability')).rows.map(row=>row.id)).toEqual([installationId])
  expect((await db.query<{r:number}>('select public.library_revision() r')).rows[0].r).toBeGreaterThan(revision)
  // Its still-active credential can send a fresh report normally.
  await report(['84002'],{installationId:older});await asUser()
  expect((await db.query<{n:number}>('select count(*)::integer n from public.reader_availability')).rows[0].n).toBe(2)
 } finally { await db.exec('rollback');await asUser() }
})
it('retains library caches for reader heartbeats while invalidating changed downloads', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`insert into public.works(ao3_work_id,title) values(84001,'Cached Work');
   insert into public.library_entries(user_id,work_id,original_url)
   select '${owner}',id,'https://archiveofourown.org/works/'||ao3_work_id from public.works where ao3_work_id=84001;
   insert into public.collections(user_id,name) values('${owner}','Cached Collection');
   insert into public.collection_works(user_id,collection_id,library_entry_id)
   select c.user_id,c.id,e.id from public.collections c join public.library_entries e on e.user_id=c.user_id
   where c.name='Cached Collection' and c.user_id='${owner}';
   create sequence public.heartbeat_match_scans;
   grant usage,select on sequence public.heartbeat_match_scans to authenticated;`)
  const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_query_work_sql(jsonb,boolean,boolean)'::regprocedure")).rows[0]
  await db.exec(fn.definition.replace(fn.source,fn.source.replace(/\bbegin\b/i,"begin perform nextval('public.heartbeat_match_scans');")))
  await report(['84001','84002']);await asUser()
  const collection=(await db.query<{id:string}>("select id from public.collections where name='Cached Collection'")).rows[0].id
  const scopes=['all',collection].map(shelf=>JSON.stringify({mode:'library',shelf,includeFacets:false,filters:{}}))
  const results=async()=>Promise.all(scopes.map(async scope=>(await db.query<{r:unknown}>('select public.query_library($1,1,25) r',[scope])).rows[0].r))
  const scans=async()=>(await db.query<{n:number}>('select last_value::integer n from public.heartbeat_match_scans')).rows[0].n
  const cached=await results()
  expect(await scans()).toBe(2)
  const revision=async()=>(await db.query<{r:number}>('select public.library_revision() r')).rows[0].r
  const before=await revision()
  await report(['84002','84001'],{name:'Renamed Installation'});await asUser()
  await db.exec(`reset role;update public.reader_availability set reported_at=reported_at+interval '1 minute' where user_id='${owner}'`)
  await asUser()
  expect(await revision()).toBe(before)
  expect(await results()).toEqual(cached)
  expect(await scans()).toBe(2)
  expect((await db.query<{name:string}>('select name from public.reader_availability')).rows[0].name).toBe('Renamed Installation')
  await report(['84001']);await asUser()
  expect(await revision()).toBeGreaterThan(before)
  await results()
  expect(await scans()).toBe(4)
 } finally { await db.exec('rollback;reset role');await asUser() }
})
it('filters by reader platform across installations with matching facets and owner isolation', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`insert into public.works(ao3_work_id,title) values(84001,'First Download'),(84002,'Second Download'),(84003,'BookFusion Only');
   insert into public.library_entries(user_id,work_id,original_url,metadata_overrides)
   select '${owner}',id,'https://archiveofourown.org/works/'||ao3_work_id,
    case when ao3_work_id=84003 then '{"bookfusion_link":{"url":"https://www.bookfusion.com/reader/123","kind":"book"}}'::jsonb else '{}'::jsonb end
   from public.works where ao3_work_id between 84001 and 84003;`)
  await report(['84001'])
  await report(['84002'],{installationId:'20000000-0000-0000-0000-000000000002'})
  await db.exec(`reset role;insert into public.reader_availability(device_id,user_id,installation_id,name,url,works)
   select device_id,'${other}','20000000-0000-0000-0000-000000000003','Other Reader','https://reader.example/','["84003"]'
   from public.reader_availability limit 1;`)
  await asUser()
  for (const [availability,titles] of [['unfolded',['First Download','Second Download']],['bookfusion',['BookFusion Only']]] as const) {
   const q=JSON.stringify({mode:'library',shelf:'all',availability,filters:{showSeries:true},terms:[]})
   const page=(await db.query<{r:{total:number;stories:{metadata:{title:string}}[]}}>('select public.query_library($1,1,25) r',[q])).rows[0].r
   expect(page.stories.map(story=>story.metadata.title).sort()).toEqual([...titles].sort())
   expect((await db.query<{r:{total:number}}>('select public.library_query_facets($1) r',[q])).rows[0].r.total).toBe(titles.length)
   await asUser(other)
   expect((await db.query<{r:{total:number}}>('select public.query_library($1,1,25) r',[q])).rows[0].r.total).toBe(0)
   await asUser()
  }
  await report([])
  await report([],{installationId:'20000000-0000-0000-0000-000000000002'})
  await asUser()
  expect((await db.query<{r:{total:number}}>(`select public.library_query_facets('{"mode":"library","shelf":"all","availability":"unfolded"}') r`)).rows[0].r.total).toBe(0)
 } finally { await db.exec('rollback;reset role');await asUser() }
})
it('retains named, timestamped reports per installation and scopes snapshots to the account',async()=>{
 await report(['8001']); await asUser()
 const snapshot=(await db.query<{result:{readers:{id:string;name:string;works:string[];reportedAt:string}[];stories:unknown[]}}>('select public.reader_offline_snapshot() result')).rows[0].result
 expect(snapshot.readers[0]).toMatchObject({id:installationId,name:'Laptop Reader',works:['8001']})
 expect(Date.parse(snapshot.readers[0].reportedAt)).toBeGreaterThan(0)
 await asUser(other)
 expect((await db.query<{result:unknown}>('select public.reader_offline_snapshot() result')).rows[0].result).toMatchObject({readers:[],stories:[],cloudBooks:[]})
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
it('exposes only uploaded anthology member identities and retains the owner’s individual work tiles', async () => {
 await db.exec('reset role;begin')
 try {
  const hash='1'.repeat(64)
  await db.query('insert into public.reader_organizer_links(user_id) values($1) on conflict do nothing',[owner])
  await db.query('delete from public.reader_availability where user_id=$1',[owner])
  await db.query('insert into public.reader_cloud_values(user_id,key,value) values($1,$2,$3)',[owner,`${hash}/manifest`,JSON.stringify({id:hash,workId:null,active:true,metadata:{title:'Three Fic Anthology'},works:[{workId:'8001'},{workId:'8002'},{workId:null}]})])
  await db.query("insert into storage.objects(bucket_id,name) values('reader-epubs',$1)",[`${owner}/${hash}.epub`])
  await asUser()
  const snapshot=(await db.query<{result:{cloudBooks:{id:string;workId:string|null;workIds:string[];workCount:number}[];stories:{work:{ao3_work_id:number}}[]}}>('select public.reader_offline_snapshot() result')).rows[0].result
  const anthology=snapshot.cloudBooks.find(book=>book.id===hash)!
  expect(anthology.workId).toBeNull()
  expect(anthology.workCount).toBe(3)
  expect(anthology.workIds.sort()).toEqual(['8001','8002'])
  expect(snapshot.stories.map(story=>story.work.ao3_work_id)).toEqual(expect.arrayContaining([8001,8002]))
  await asUser(other)
  expect((await db.query<{result:{cloudBooks:{id:string}[]}}>('select public.reader_offline_snapshot() result')).rows[0].result.cloudBooks.some(book=>book.id===hash)).toBe(false)
  await db.exec('reset role')
  await db.query('delete from storage.objects where name=$1',[`${owner}/${hash}.epub`])
  await asUser()
  expect((await db.query<{result:{cloudBooks:{id:string}[]}}>('select public.reader_offline_snapshot() result')).rows[0].result.cloudBooks.some(book=>book.id===hash)).toBe(false)
 } finally {await db.exec('rollback')}
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
 expect((await db.query<{result:{readers:unknown[];cloudBooks:unknown[];stories:unknown[]}}>('select public.reader_offline_snapshot() result')).rows[0].result).toMatchObject({readers:[],cloudBooks:[],stories:[]})
 await db.exec('reset role')
 expect((await db.query('select value from public.reader_cloud_values where user_id=$1 and key=$2',[owner,`${'a'.repeat(64)}/notes`])).rows).toEqual([{value:'Keep my notes'}])
 expect((await db.query('select id from public.library_entries where user_id=$1',[owner])).rows.length).toBeGreaterThan(0)
 expect((await db.query("select * from public.userscript_devices where secret_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",[unrelated])).rows).toHaveLength(1)
 await expect(report(['8001'])).rejects.toThrow()
 await asUser();await expect(db.query("select public.reader_organizer_connection('validate',null,$1)",[registered])).rejects.toThrow()
})

it('retains collection definitions only for the snapshot owner', async () => {
 await db.exec('reset role')
 await db.query('insert into public.collections(user_id,name,color,symbol) values($1,$2,$3,$4),($5,$6,$3,$4)', [owner,'Owner EPUB Shelf','#123456','moon',other,'Other Private Shelf'])
 for (const [id, ownName, foreignName] of [[owner,'Owner EPUB Shelf','Other Private Shelf'],[other,'Other Private Shelf','Owner EPUB Shelf']]) {
  await asUser(id)
  const snapshot = (await db.query<{result:{collections:{name:string;user_id:string}[]}}>('select public.reader_offline_snapshot() result')).rows[0].result
  expect(snapshot.collections.some(collection => collection.name === ownName)).toBe(true)
  expect(snapshot.collections.some(collection => collection.name === foreignName)).toBe(false)
  expect(snapshot.collections.every(collection => collection.user_id === id)).toBe(true)
 }
})
