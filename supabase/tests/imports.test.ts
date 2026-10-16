// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db:PGlite
const alice='10000000-0000-0000-0000-000000000001',bob='10000000-0000-0000-0000-000000000002'
type Claim={id:string;token:string;workId:number;attempt:number}
async function asUser<T>(id:string,fn:()=>Promise<T>) {await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`);try{return await fn()}finally{await db.exec('reset role; reset request.jwt.claim.sub')}}
async function submit(urls:string[],owner=alice) {return asUser(owner,async()=>(await db.query<{id:string}>('select public.submit_import_urls($1::text[]) id',[urls])).rows[0].id)}
async function ready() {await db.exec("update public.metadata_worker_state set next_request_at=now()-interval '1 second',paused_until=null;update public.metadata_jobs set next_attempt_at=now()-interval '1 second' where status='pending'")}
async function claim() {return (await db.query<{job:Claim|null}>('select public.claim_metadata_job() job')).rows[0].job}
async function finish(j:Claim,metadata:object|null={title:'Automatic',authors:['One','Two'],author_links:{One:'https://archiveofourown.org/users/One'},fandoms:['F'],relationship_tags:['A/B'],published_chapters:6},chapters:object={'1':'910','2':'920','6':'960'},category:string|null=null,retry=false,pause=0) {return (await db.query<{ok:boolean}>('select public.finish_metadata_job($1,$2,$3,$4,$5,$6,$7,$8) ok',[j.id,j.token,metadata===null?null:JSON.stringify(metadata),JSON.stringify(chapters),category,category,retry,pause])).rows[0].ok}
async function clearJobs() {await db.exec('delete from public.import_batches; update public.metadata_worker_state set next_request_at=now(),paused_until=null')}
beforeAll(async()=>{db=await createTestDatabase();await db.exec(`insert into auth.users values('${alice}'),('${bob}')`)},30000)
afterAll(async()=>{await db?.close()})
it('tracks every AO3 submission in a 100+ batch, ignores unrelated hosts, saves one identity and verifies maximum chapter progress',async()=>{
 const batch=await submit(['https://example.com','https://archiveofourown.org.evil.test/works/1',...Array.from({length:110},(_,i)=>`https://archiveofourown.org/works/${i+1000}`),'https://archiveofourown.org/works/1000/chapters/960','https://archiveofourown.org/works/1000/chapters/920','https://archiveofourown.org/works/0','https://archiveofourown.org/users/test'])
 expect((await db.query('select * from public.import_items where batch_id=$1',[batch])).rows).toHaveLength(114)
 expect((await db.query('select * from public.library_entries')).rows).toHaveLength(110)
 expect((await db.query('select * from public.metadata_jobs')).rows).toHaveLength(110)
 const j=(await claim())!;expect(j.workId).toBe(1000);expect(await claim()).toBeNull()
 expect(await finish(j)).toBe(true)
 const row=(await db.query('select last_read_chapter,reading_status,metadata_overrides,original_url from public.library_entries e join public.works w on w.id=e.work_id where w.ao3_work_id=1000')).rows[0]
 expect(row).toMatchObject({last_read_chapter:5,reading_status:'reading',metadata_overrides:{},original_url:'https://archiveofourown.org/works/1000'})
 expect((await db.query('select * from public.authors')).rows).toHaveLength(2)
 expect((await db.query('select * from public.work_tags')).rows).toHaveLength(1)
 expect((await db.query('select total_chapters from public.works where ao3_work_id=1000')).rows[0]).toEqual({total_chapters:null})
 expect(await finish(j)).toBe(false);await clearJobs()
})
it('preserves existing personal data and manual corrections across refreshes and explicit approved progress never decreases',async()=>{
 const entry=(await db.query<{id:string}>("select e.id from public.library_entries e join public.works w on w.id=e.work_id where w.ao3_work_id=1000")).rows[0].id
 await asUser(alice,()=>db.query("update public.library_entries set notes='private',reading_status='did_not_finish',last_read_chapter=3,personal_rating=5,is_favorite=true,metadata_overrides='{\"title\":\"Manual\",\"summary\":\"Corrected\",\"authors\":[\"My author\"]}' where id=$1",[entry]))
 const shelf=(await db.query<{id:string}>("insert into public.collections(user_id,name) values($1,'Import preservation') returning id",[alice])).rows[0].id
 await db.query('insert into public.collection_works(user_id,collection_id,library_entry_id) values($1,$2,$3)',[alice,shelf,entry])
 await submit(['https://archiveofourown.org/works/1000/chapters/960'])
 const j=(await claim())!;expect(await finish(j)).toBe(true)
 expect((await db.query('select notes,reading_status,last_read_chapter,personal_rating,is_favorite,metadata_overrides from public.library_entries where id=$1',[entry])).rows[0]).toEqual({notes:'private',reading_status:'did_not_finish',last_read_chapter:3,personal_rating:5,is_favorite:true,metadata_overrides:{title:'Manual',summary:'Corrected',authors:['My author']}})
 expect((await db.query('select * from public.collection_works where library_entry_id=$1',[entry])).rows).toHaveLength(1)
 const item=(await db.query<{id:string}>('select id from public.import_items limit 1')).rows[0].id
 await asUser(alice,()=>db.query('select public.approve_import_progress($1)',[item]))
 await asUser(alice,()=>db.query('select public.approve_import_progress($1)',[item]))
 expect((await db.query('select last_read_chapter,reading_status from public.library_entries where id=$1',[entry])).rows[0]).toEqual({last_read_chapter:5,reading_status:'did_not_finish'})
 await asUser(alice,()=>db.query("select public.clear_metadata_override($1,'title')",[entry]))
 expect((await db.query<{metadata_overrides:object}>('select metadata_overrides from public.library_entries where id=$1',[entry])).rows[0].metadata_overrides).toEqual({summary:'Corrected',authors:['My author']})
 await clearJobs()
})
it('keeps stubs editable when metadata fails, records invalid chapter uncertainty, and never assigns an ID as a position',async()=>{
 await submit(['https://archiveofourown.org/works/2000/chapters/999999'])
 let j=(await claim())!;await finish(j,null,{},'restricted')
 expect((await db.query('select canonical_url,title from public.works where ao3_work_id=2000')).rows[0]).toEqual({canonical_url:null,title:null})
 expect((await db.query<{last_read_chapter:number}>('select last_read_chapter from public.library_entries e join public.works w on w.id=e.work_id where w.ao3_work_id=2000')).rows[0].last_read_chapter).toBe(0)
 await clearJobs();await submit(['https://archiveofourown.org/works/2000/chapters/999999']);j=(await claim())!;await finish(j)
 expect((await db.query('select verified_position,error_category from public.import_items')).rows[0]).toEqual({verified_position:null,error_category:'unverified_chapter'})
 await clearJobs()
})
it('recovers interrupted workers with fencing and refuses late or concurrent completion',async()=>{
 await submit(['https://archiveofourown.org/works/3000'])
 const first=(await claim())!;await ready();expect(await claim()).toBeNull()
 await db.query("update public.metadata_jobs set lease_until=now()-interval '1 second' where id=$1",[first.id]);await ready()
 const next=(await claim())!;expect(next.id).toBe(first.id);expect(next.token).not.toBe(first.token);expect(next.attempt).toBe(2)
 expect(await finish(first)).toBe(false);expect(await finish(next)).toBe(true);await clearJobs()
})
it('cancels processing and pending jobs without deleting saved works or accepting late results',async()=>{
 const batch=await submit(['https://archiveofourown.org/works/4000','https://archiveofourown.org/works/4001'])
 const j=(await claim())!;await asUser(alice,()=>db.query('select public.cancel_import_batch($1)',[batch]))
 expect(await finish(j)).toBe(false);await ready();expect(await claim()).toBeNull()
 expect((await db.query<{status:string}>('select status from public.metadata_jobs')).rows.every(r=>r.status==='cancelled')).toBe(true)
 expect((await db.query('select * from public.library_entries e join public.works w on w.id=e.work_id where ao3_work_id in (4000,4001)')).rows).toHaveLength(2)
 await clearJobs()
})
it('backs off transient failures, caps attempts, refuses permanent retries and pauses all retrieval on blocking signals',async()=>{
 await submit(['https://archiveofourown.org/works/5000','https://archiveofourown.org/works/5001'])
 const j=(await claim())!;await finish(j,null,{},'rate_limited',true,3600)
 expect(await claim()).toBeNull()
 await asUser(alice,()=>db.query('select public.retry_metadata_job($1)',[j.id]));expect(await claim()).toBeNull()
 await ready();const second=(await claim())!;await finish(second,null,{},'unavailable')
 await asUser(alice,()=>expect(db.query('select public.retry_metadata_job($1)',[second.id])).rejects.toThrow('Retry unavailable'))
 for(let attempt=2;attempt<=4;attempt++) {await ready();const next=(await claim())!;expect(next.attempt).toBe(attempt);await finish(next,null,{},'timeout',true);if(attempt<4){expect(await claim()).toBeNull();expect((await db.query<{delay:number}>('select extract(epoch from next_attempt_at-now())::integer delay from public.metadata_jobs where id=$1',[next.id])).rows[0].delay).toBeGreaterThanOrEqual(30)}}
 expect((await db.query('select status,retryable,attempts from public.metadata_jobs where id=$1',[j.id])).rows[0]).toEqual({status:'failed',retryable:false,attempts:4})
 await clearJobs()
})
it('rejects anonymous access, isolates all private import tables and restricts worker operations',async()=>{
 const batch=await submit(['https://archiveofourown.org/works/6000'])
 const job=(await claim())!
 await asUser(bob,async()=>{
  for(const table of ['import_batches','import_items','metadata_jobs','processing_logs']) {expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);await expect(db.query(`delete from public.${table}`)).rejects.toThrow('permission denied')}
  await expect(db.query('select public.cancel_import_batch($1)',[batch])).rejects.toThrow('Batch unavailable')
  await expect(db.query('select public.retry_metadata_job($1)',[job.id])).rejects.toThrow('Job unavailable')
  await expect(db.query('select public.claim_metadata_job()')).rejects.toThrow('permission denied')
  await expect(finish(job)).rejects.toThrow('permission denied')
 })
 await db.exec('set role anon');try {for(const table of ['import_batches','import_items','metadata_jobs','processing_logs']) await expect(db.query(`select * from public.${table}`)).rejects.toThrow('permission denied');await expect(db.query('select public.submit_import_urls($1::text[])',[['https://archiveofourown.org/works/1']])).rejects.toThrow('permission denied')}finally{await db.exec('reset role')}
 expect(await finish(job)).toBe(true)
 await clearJobs()
})

it('retains valid metadata on partial retrieval and permits collection URL edits through the existing save boundary',async()=>{
 await submit(['https://archiveofourown.org/collections/test/works/7000'])
 let job=(await claim())!;await finish(job,{title:'Full metadata',summary:'Keep this',published_chapters:6,total_chapters:6})
 await clearJobs();await submit(['https://archiveofourown.org/works/7000']);job=(await claim())!;await finish(job,{title:'Partial metadata'}, {}, 'partial')
 expect((await db.query('select title,summary,published_chapters,total_chapters from public.works where ao3_work_id=7000')).rows[0]).toEqual({title:'Partial metadata',summary:'Keep this',published_chapters:6,total_chapters:6})
 const entry=(await db.query<{id:string}>('select e.id from public.library_entries e join public.works w on w.id=e.work_id where ao3_work_id=7000')).rows[0].id
 await asUser(alice,()=>db.query("select public.save_library_story($1,$2,'to_read',0,'',null,false,'{}','{}',$3)",[ 'https://archiveofourown.org/collections/test/works/7000', JSON.stringify({title:'My correction'}), entry ]))
 await asUser(alice,()=>db.query("select public.save_library_story($1,$2,'to_read',0,'Private reading update',null,false,'{}','{}',$3)",[ 'https://archiveofourown.org/works/7000', JSON.stringify({summary:'Only this field changed'}), entry ]))
 expect((await db.query('select metadata_overrides,notes from public.library_entries where id=$1',[entry])).rows[0]).toEqual({metadata_overrides:{title:'My correction',summary:'Only this field changed'},notes:'Private reading update'})
 await asUser(alice,()=>db.query("select public.save_library_story($1,'{}','reading',1,'Notes only',null,false,'{}','{}',$2)",[ 'https://archiveofourown.org/works/7000', entry ]))
 await clearJobs()
})
it('makes worker interruption at the attempt limit terminal and prevents unauthorized retry or progress inference',async()=>{
 await submit(['https://archiveofourown.org/works/8000/chapters/123456'])
 const job=(await claim())!
 await db.query("update public.metadata_jobs set attempts=4,lease_until=now()-interval '1 second' where id=$1",[job.id]);await ready()
 expect(await claim()).toBeNull()
 expect((await db.query('select status,retryable,error_category from public.metadata_jobs')).rows[0]).toEqual({status:'failed',retryable:false,error_category:'worker_interrupted'})
 const item=(await db.query<{id:string}>('select id from public.import_items')).rows[0].id
 await asUser(alice,()=>expect(db.query('select public.approve_import_progress($1)',[item])).rejects.toThrow('Verified chapter unavailable'))
 await clearJobs()
})

it('preserves AO3 tag order across metadata refreshes independently of tag identity',async()=>{
 await submit(['https://archiveofourown.org/works/9000'])
 let job=(await claim())!
 await finish(job,{title:'Ordered tags',additional_tags:['Zulu tag','Alpha tag','Middle tag']},{})
 const ordered=async()=>db.query<{name:string;source_position:number}>(`select t.name,wt.source_position from public.work_tags wt join public.tags t on t.id=wt.tag_id join public.works w on w.id=wt.work_id where w.ao3_work_id=9000 and t.category='freeform' order by wt.source_position,wt.tag_id`)
 expect((await ordered()).rows.map(row=>row.name)).toEqual(['Zulu tag','Alpha tag','Middle tag'])
 await clearJobs();await submit(['https://archiveofourown.org/works/9000']);job=(await claim())!
 await finish(job,{title:'Ordered tags',additional_tags:['Middle tag','Zulu tag','Alpha tag']},{})
 expect((await ordered()).rows).toEqual([{name:'Middle tag',source_position:1},{name:'Zulu tag',source_position:2},{name:'Alpha tag',source_position:3}])
 await clearJobs()
})

async function extensionMode(owner=alice) {
 await asUser(owner,()=>db.query("insert into public.metadata_preferences(user_id,retrieval_mode) values($1,'extension') on conflict(user_id) do update set retrieval_mode='extension'",[owner]))
}
async function claimExtension(owner=alice) { return asUser(owner,async()=>(await db.query<{job:Claim|null}>('select public.claim_extension_job() job')).rows[0].job) }
it('routes explicitly submitted extension jobs separately, snapshots mode, and isolates claims by owner',async()=>{
 await extensionMode()
 const batch=await submit(['https://archiveofourown.org/works/9100'])
 expect(await claim()).toBeNull()
 expect(await claimExtension(bob)).toBeNull()
 await asUser(bob,async()=>{
  expect((await db.query('select * from public.metadata_preferences')).rows).toHaveLength(0)
  await expect(db.query("insert into public.metadata_preferences(user_id,retrieval_mode) values($1,'extension')",[alice])).rejects.toThrow()
 })
 await asUser(alice,()=>db.query("update public.metadata_preferences set retrieval_mode='direct'"))
 const browser=(await claimExtension())!
 expect(browser.workId).toBe(9100)
 expect(await claimExtension()).toBeNull()
 await submit(['https://archiveofourown.org/works/9101'],bob);await ready()
 const direct=(await claim())!;expect(direct.workId).toBe(9101)
 await finish(direct)
 await asUser(alice,()=>db.query('select public.cancel_import_batch($1)',[batch]))
 expect(await finish(browser)).toBe(false)
 expect((await db.query<{paced:boolean}>("select next_request_at<=now()+interval '16 seconds' paced from public.metadata_worker_state")).rows[0].paced).toBe(true)
 await clearJobs();await db.exec('delete from public.metadata_preferences')
})
it('commits browser metadata privately without replacing manual overrides, shared works or reading progress',async()=>{
 await extensionMode()
 await submit(['https://archiveofourown.org/works/9200/chapters/960'])
 const job=(await claimExtension())!
 const entry=(await db.query<{id:string}>('select entry_id id from public.metadata_jobs where id=$1',[job.id])).rows[0].id
 await db.query("update public.library_entries set metadata_overrides='{\"title\":\"My correction\"}',notes='My notes',last_read_chapter=2,reading_status='reading' where id=$1",[entry])
 await asUser(alice,()=>expect(finish(job)).rejects.toThrow('permission denied'))
 await asUser(alice,()=>expect(db.query("update public.library_entries set extension_metadata='{}' where id=$1",[entry])).rejects.toThrow('permission denied'))
 expect(await finish(job,{title:'Browser title',summary:'Private summary',published_chapters:6,total_chapters:6}, {'6':'960'})).toBe(true)
 expect((await db.query('select title,summary,verified_chapters,last_metadata_success from public.works where ao3_work_id=9200')).rows[0]).toEqual({title:null,summary:null,verified_chapters:{},last_metadata_success:null})
 expect((await db.query('select verified_position,error_category from public.import_items where batch_id=(select batch_id from public.metadata_jobs where id=$1)',[job.id])).rows[0]).toEqual({verified_position:6,error_category:null})
 expect((await db.query('select extension_metadata,extension_chapters,metadata_overrides,notes,last_read_chapter,reading_status from public.library_entries where id=$1',[entry])).rows[0]).toMatchObject({extension_metadata:{title:'Browser title',summary:'Private summary',published_chapters:6,total_chapters:6,last_metadata_success:expect.any(String),last_metadata_check:expect.any(String)},extension_chapters:{'6':'960'},metadata_overrides:{title:'My correction'},notes:'My notes',last_read_chapter:2,reading_status:'reading'})
 await asUser(bob,async()=>{expect((await db.query('select extension_metadata from public.library_entries where id=$1',[entry])).rows).toHaveLength(0)})
 await clearJobs();await submit(['https://archiveofourown.org/works/9200'])
 const partial=(await claimExtension())!;await finish(partial,{title:'Updated browser title',published_chapters:7},{},'partial')
 expect((await db.query('select extension_metadata from public.library_entries where id=$1',[entry])).rows[0]).toMatchObject({extension_metadata:{title:'Updated browser title',summary:'Private summary',published_chapters:7,total_chapters:null}})
 await clearJobs();await asUser(alice,()=>db.query("update public.metadata_preferences set retrieval_mode='direct'"));await submit(['https://archiveofourown.org/works/9200']);await ready()
 const direct=(await claim())!;await finish(direct,{title:'Latest direct title',published_chapters:8},{},'partial')
 expect((await db.query('select extension_metadata,metadata_overrides from public.library_entries where id=$1',[entry])).rows[0]).toMatchObject({extension_metadata:{title:'Latest direct title',summary:'Private summary',published_chapters:8},metadata_overrides:{title:'My correction'}})
 await clearJobs();await db.exec('delete from public.metadata_preferences')
})
it('requires explicit retry after browser confirmation timeout and fences expired extension leases',async()=>{
 await extensionMode()
 await submit(['https://archiveofourown.org/works/9300'])
 const first=(await claimExtension())!
 await finish(first,null,{},'extension_waiting',true)
 expect((await db.query('select status,retryable from public.metadata_jobs where id=$1',[first.id])).rows[0]).toEqual({status:'failed',retryable:true})
 expect(await claimExtension()).toBeNull()
 await asUser(alice,()=>db.query('select public.retry_metadata_job($1)',[first.id]));await ready()
 const next=(await claimExtension())!
 expect(next.token).not.toBe(first.token)
 expect(await finish(first)).toBe(false)
 await db.query("update public.metadata_jobs set attempts=4,lease_until=now()-interval '1 second' where id=$1",[next.id])
 expect(await claimExtension()).toBeNull()
 expect((await db.query('select status,retryable from public.metadata_jobs where id=$1',[next.id])).rows[0]).toEqual({status:'failed',retryable:false})
 expect((await db.query('select status,metadata_status from public.import_items where batch_id=(select batch_id from public.metadata_jobs where id=$1)',[next.id])).rows[0]).toEqual({status:'failed',metadata_status:'failed'})
 await db.exec('set role anon');try {await expect(db.query('select public.claim_extension_job()')).rejects.toThrow('permission denied')}finally{await db.exec('reset role')}
 await clearJobs();await db.exec('delete from public.metadata_preferences')
})
