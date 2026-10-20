// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db:PGlite
const alice='10000000-0000-0000-0000-000000000001',bob='10000000-0000-0000-0000-000000000002'
type Claim={id:string;token:string;workId:number;attempt:number}
async function asUser<T>(id:string,fn:()=>Promise<T>) {await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`);try{return await fn()}finally{await db.exec('reset role; reset request.jwt.claim.sub')}}
async function submit(urls:string[],owner=alice,updateReadingLocation=false,readingStatus:string|null=null,seriesIds:number[]=[]) {return asUser(owner,async()=>(await db.query<{id:string}>('select public.submit_import_urls($1::text[],$2,$3::public.reading_status,$4::bigint[]) id',[urls,updateReadingLocation,readingStatus,seriesIds])).rows[0].id)}
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
it.each([
 { work: 9400, chapter: '960', chapters: { '6': '960' }, expected: 5 },
 { work: 9401, chapter: '910', chapters: { '1': '910' }, expected: 0 },
 { work: 9402, chapter: '999999', chapters: { '6': '960' }, expected: 0 },
])('initializes extension-imported chapter progress only from a verified position: $work', async ({ work, chapter, chapters, expected }) => {
 await extensionMode()
 await submit([`https://archiveofourown.org/works/${work}/chapters/${chapter}`])
 const job=(await claimExtension())!
 const entry=(await db.query<{id:string}>('select entry_id id from public.metadata_jobs where id=$1',[job.id])).rows[0].id
 // Claiming the browser job records metadata activity without marking a personal edit.
 expect((await db.query('select updated_at=created_at untouched from public.library_entries where id=$1',[entry])).rows[0]).toEqual({untouched:true})
 await finish(job,{title:'Chapter import',published_chapters:6},chapters)
 expect((await db.query('select last_read_chapter,reading_status from public.library_entries where id=$1',[entry])).rows[0]).toEqual({last_read_chapter:expected,reading_status:expected ? 'reading' : 'to_read'})
 // A metadata-only refresh of the same fic preserves personal progress.
 await clearJobs();await submit([`https://archiveofourown.org/works/${work}/chapters/960`])
 await finish((await claimExtension())!,{title:'Reimport',published_chapters:6},{'6':'960'})
 expect((await db.query('select last_read_chapter from public.library_entries where id=$1',[entry])).rows[0]).toEqual({last_read_chapter:expected})
 await clearJobs();await db.exec('delete from public.metadata_preferences')
})
it('preserves edits made before and after the extension claims a new chapter import',async()=>{
 await extensionMode()
 for (const beforeClaim of [true,false]) {
  await submit([`https://archiveofourown.org/works/${beforeClaim ? 9500 : 9501}/chapters/960`])
  const entry=(await db.query<{id:string}>('select entry_id id from public.metadata_jobs')).rows[0].id
  const edit=()=>asUser(alice,()=>db.query("update public.library_entries set notes='Edited while waiting' where id=$1",[entry]))
  if(beforeClaim) await edit()
  const job=(await claimExtension())!
  if(!beforeClaim) await edit()
  await finish(job,{title:'Imported',published_chapters:6},{'6':'960'})
  expect((await db.query('select last_read_chapter,reading_status,notes from public.library_entries where id=$1',[entry])).rows[0]).toEqual({last_read_chapter:0,reading_status:'to_read',notes:'Edited while waiting'})
  await clearJobs()
 }
 await db.exec('delete from public.metadata_preferences')
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

it.each(['direct','extension'])('updates existing reading locations only for explicit verified chapter imports: %s',async mode=>{
 if(mode==='extension') await extensionMode()
 const claimJob=async()=>mode==='extension' ? claimExtension() : claim()
 const base=mode==='extension' ? 9800 : 9700
 const scenarios=[
  {chapter:'990',progress:0,expected:9},
  {chapter:'990',progress:15,expected:9},
  {chapter:'910',progress:9,expected:0},
  {chapter:'999999',progress:4,expected:4},
  {chapter:null,progress:4,expected:4},
  {chapter:'990',progress:4,expected:4,edit:'before'},
  {chapter:'990',progress:4,expected:4,edit:'after'},
  {chapter:'990',progress:4,expected:4,failed:true},
 ]
 for(const [index,scenario] of scenarios.entries()) {
  const url=`https://archiveofourown.org/works/${base+index}`
  await submit([url]);const initial=(await claimJob())!;await finish(initial)
  const entry=(await db.query<{id:string}>('select entry_id id from public.metadata_jobs where id=$1',[initial.id])).rows[0].id
  await clearJobs()
  // Personal data saved before this import does not prevent the requested update.
  await asUser(alice,()=>db.query("update public.library_entries set last_read_chapter=$2,reading_status='to_read',notes='Keep notes',metadata_overrides='{\"title\":\"My title\"}' where id=$1",[entry,scenario.progress]))
  await submit([scenario.chapter ? `${url}/chapters/${scenario.chapter}` : url],alice,true)
  const edit=()=>asUser(alice,()=>db.query("update public.library_entries set notes='New edit' where id=$1",[entry]))
  if(scenario.edit==='before') await edit()
  const job=(await claimJob())!
  if(scenario.edit==='after') await edit()
  await finish(job,scenario.failed ? null : {title:'Refreshed',published_chapters:20},{'1':'910','10':'990'},scenario.failed ? 'restricted' : null)
  expect((await db.query('select last_read_chapter,reading_status,notes,metadata_overrides from public.library_entries where id=$1',[entry])).rows[0]).toEqual({last_read_chapter:scenario.expected,reading_status:scenario.chapter==='990'&&!scenario.edit&&!scenario.failed ? 'reading' : 'to_read',notes:scenario.edit ? 'New edit' : 'Keep notes',metadata_overrides:{title:'My title'}})
  await clearJobs()
  // Refreshing an older stored chapter link must not change the new location.
  await submit([`${url}/chapters/910`],alice,false)
  await finish((await claimJob())!,{title:'Refreshed again',published_chapters:20},{'1':'910'})
  expect((await db.query('select last_read_chapter from public.library_entries where id=$1',[entry])).rows[0]).toEqual({last_read_chapter:scenario.expected})
  await clearJobs()
 }
 await db.exec('delete from public.metadata_preferences')
})

it('paces series previews with hosted jobs and restricts reservations to the service role',async()=>{
 await clearJobs()
 await asUser(alice,async()=>{await expect(db.query('select public.reserve_series_preview()')).rejects.toThrow(/permission denied/)})
 const reserve=async()=> (await db.query<{ok:boolean}>('select public.reserve_series_preview() ok')).rows[0].ok
 expect(await reserve()).toBe(true)
 expect(await reserve()).toBe(false)
 await submit(['https://archiveofourown.org/works/998877'])
 expect(await claim()).toBeNull()
 await ready()
 const j=(await claim())!
 expect(await reserve()).toBe(false)
 await finish(j)
 await clearJobs()
 await db.query("select public.pause_series_preview(3600,'rate_limited')")
 expect(await reserve()).toBe(false)
 await db.query("select public.pause_series_preview(30,'shorter_pause')")
 expect((await db.query<{ok:boolean}>("select paused_until>now()+interval '59 minutes' ok from public.metadata_worker_state")).rows[0].ok).toBe(true)
 await clearJobs()
})

it('persists every explicit reading status through chapter metadata and scopes series changes to the owner',async()=>{
 await clearJobs()
 const preview={seriesId:8088,normalizedUrl:'https://archiveofourown.org/series/8088',title:'Status import',works:[]}
 for(const owner of [alice,bob]) await asUser(owner,()=>db.query('select public.remember_library_series($1)',[JSON.stringify(preview)]))
 for(const [index,status] of ['to_read','reading','waiting_for_updates','re_reading','finished','did_not_finish'].entries()) {
  const workId=88000+index
  await submit([`https://archiveofourown.org/works/${workId}/chapters/960`],alice,true,status,[8088])
  await ready();const job=(await claim())!;expect(job.workId).toBe(workId)
  expect(await finish(job)).toBe(true)
  expect((await asUser(alice,()=>db.query('select reading_status,last_read_chapter from public.library_entries e join public.works w on e.work_id=w.id where w.ao3_work_id=$1',[workId]))).rows).toEqual([{reading_status:status,last_read_chapter:5}])
  expect((await asUser(alice,()=>db.query('select reading_status from public.library_series where ao3_series_id=8088'))).rows).toEqual([{reading_status:status}])
  expect((await asUser(bob,()=>db.query('select reading_status from public.library_series where ao3_series_id=8088'))).rows).toEqual([{reading_status:'to_read'}])
 }
 // Reimporting an owned work applies the new batch choice without changing another owner's copy.
 await submit(['https://archiveofourown.org/works/88000'],bob,false,'reading')
 await submit(['https://archiveofourown.org/works/88000'],alice,false,'finished')
 expect((await asUser(alice,()=>db.query('select reading_status from public.library_entries e join public.works w on e.work_id=w.id where w.ao3_work_id=88000'))).rows).toEqual([{reading_status:'finished'}])
 expect((await asUser(bob,()=>db.query('select reading_status from public.library_entries e join public.works w on e.work_id=w.id where w.ao3_work_id=88000'))).rows).toEqual([{reading_status:'reading'}])
})
it('keeps edits made after an explicit import status was selected',async()=>{
 await clearJobs()
 await submit(['https://archiveofourown.org/works/88999/chapters/960'],alice,true,'to_read')
 await asUser(alice,()=>db.exec("update public.library_entries set reading_status='did_not_finish' where work_id=(select id from public.works where ao3_work_id=88999)"))
 await ready();expect(await finish((await claim())!)).toBe(true)
 expect((await asUser(alice,()=>db.query('select reading_status from public.library_entries e join public.works w on e.work_id=w.id where w.ao3_work_id=88999'))).rows).toEqual([{reading_status:'did_not_finish'}])
})

it('rebuilds each affected document once when imports share common tags and fandoms',async()=>{
 await clearJobs()
 await db.exec(`create table public.document_rebuild_audit(id uuid);
 create table public.entity_update_audit(kind text);
 create function public.audit_document_rebuild() returns trigger language plpgsql as $$begin insert into public.document_rebuild_audit values(new.id); return new; end$$;
 create function public.audit_entity_update() returns trigger language plpgsql as $$begin insert into public.entity_update_audit values(tg_table_name); return new; end$$;
 create trigger audit_rebuild after insert or update on public.library_search_documents for each row execute function public.audit_document_rebuild();
 create trigger audit_tag_update after update on public.tags for each row execute function public.audit_entity_update();
 create trigger audit_fandom_update after update on public.fandoms for each row execute function public.audit_entity_update();`)
 try {
  for(let i=0;i<8;i++) {
   const work=89000+i
   const url=`https://archiveofourown.org/works/${work}`
   await submit([url]);await submit([url],bob)
   await ready()
   const job=(await claim())!
   expect(job.workId).toBe(work)
   await db.exec('truncate public.document_rebuild_audit,public.entity_update_audit')
   if(i===0) {
    await expect(finish(job,[])).rejects.toThrow('Invalid adapter result')
    expect((await db.query('select * from public.document_rebuild_audit')).rows).toEqual([])
   }
   expect(await finish(job,{title:`Shared metadata ${i}`,summary:'Final summary',authors:['Common author'],fandoms:['Common fandom'],relationship_tags:['Common A/B'],character_tags:['Common A'],additional_tags:['Common tag','Another tag'],published_chapters:6,total_chapters:6,is_complete:true})).toBe(true)
   const changed=(await db.query<{id:string;count:number}>('select id,count(*)::integer count from public.document_rebuild_audit group by id')).rows
   const expected=(await db.query<{id:string}>('select id from public.library_entries where work_id=(select id from public.works where ao3_work_id=$1)',[work])).rows.map(row=>row.id)
   expect(changed.map(row=>row.id).sort()).toEqual(expected.sort())
   expect(changed.every(row=>row.count===1)).toBe(true)
   expect((await db.query('select * from public.entity_update_audit')).rows).toEqual([])
   const documents=(await db.query<{story:{metadata:object}}>('select story from public.library_search_documents where id=any($1::uuid[])',[expected])).rows
   for(const {story} of documents) expect(story.metadata).toMatchObject({title:`Shared metadata ${i}`,fandoms:['Common fandom'],additional_tags:['Common tag','Another tag'],publication_status:'complete'})
   await clearJobs()
  }
  // Ordinary shared edits still fan out, while unchanged updates do no work.
  await db.exec("begin; select set_config('app.defer_library_documents','on',true); update public.tags set name=name where name='Common tag'; update public.fandoms set name=name where name='Common fandom'")
  try {
   expect((await db.query<{ids:string|null}>("select nullif(current_setting('app.library_document_ids',true),'') ids")).rows[0].ids).toBeNull()
  } finally {await db.exec('rollback')}
  await db.exec("truncate public.document_rebuild_audit; update public.tags set name=name where name='Common tag'; update public.fandoms set name=name where name='Common fandom'")
  expect((await db.query('select * from public.document_rebuild_audit')).rows).toEqual([])
  await db.exec("update public.tags set name='Renamed common tag' where name='Common tag'")
  expect((await db.query('select * from public.document_rebuild_audit')).rows).toHaveLength(16)
  await extensionMode()
  await submit(['https://archiveofourown.org/works/89000'])
  const browser=(await claimExtension())!
  await db.exec('truncate public.document_rebuild_audit')
  expect(await finish(browser,{title:'Private browser metadata',published_chapters:9,total_chapters:6})).toBe(true)
  const privateChanges=(await db.query<{id:string}>('select id from public.document_rebuild_audit')).rows
  expect(privateChanges).toHaveLength(1)
  expect((await db.query<{story:{metadata:object}}>('select story from public.library_search_documents where id=$1',[privateChanges[0].id])).rows[0].story.metadata).toMatchObject({title:'Private browser metadata',published_chapters:9,total_chapters:null})
  expect(await finish(browser)).toBe(false)
  expect((await db.query('select * from public.document_rebuild_audit')).rows).toHaveLength(1)
 } finally {
  await db.exec('drop trigger audit_rebuild on public.library_search_documents; drop trigger audit_tag_update on public.tags; drop trigger audit_fandom_update on public.fandoms; drop function public.audit_document_rebuild(),public.audit_entity_update(); drop table public.document_rebuild_audit,public.entity_update_audit')
  await clearJobs();await db.exec('delete from public.metadata_preferences')
 }
})
