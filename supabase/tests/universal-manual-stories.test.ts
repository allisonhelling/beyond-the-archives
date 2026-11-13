// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { defaultReadingFilters } from '../../src/features/library/reading-search'
import type { Story } from '../../src/features/library/model'
import { sourceIdentityKey, storySourceVersion } from '../../src/features/library/story-source'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
async function user<T>(id: string, run: () => Promise<T>) {
 await db.exec('savepoint owned_action')
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`)
 try { return await run() } catch (e) { await db.exec('rollback to savepoint owned_action'); throw e }
 finally { await db.exec('reset role; reset request.jwt.claim.sub; release savepoint owned_action') }
}
async function snapshot(id: string) { return (await db.query<{ s: Record<string, unknown> }>('select public.library_edit_snapshot($1) s',[id])).rows[0].s }
async function save(changes: Record<string, unknown> = {}, id: string | null = null, url = 'https://fiction.example/Story/123?edition=one#start', base?: Record<string, unknown>) {
 const input = { status: 'to_read', progress: 0, notes: '', rating: null, favorite: false, collections: [], tags: [], statusOrigin: 'explicit', ...changes }
 const baseline = id ? base ?? await snapshot(id) : null
 return user(alice, async () => (await db.query<{ id: string }>('select public.save_library_story_checked($1,$2,$3,$4) id', [id,url,JSON.stringify(input),baseline ? JSON.stringify(baseline) : null])).rows[0].id)
}
const metadata = { title: 'Manual Fiction', authors: ['Someone'], fandoms: ['Original Work'], published_chapters: 20, total_chapters: 30, publication_status: 'unknown', chapter_count_manual: true }
async function create(changes: Record<string, unknown> = {}) { return save({ metadata, ...changes }) }
async function entry(id: string) { return (await db.query<{ s: Story }>('select story s from public.library_story_documents where id=$1',[id])).rows[0].s }
beforeAll(async () => { db = await createTestDatabase(); await db.query('insert into auth.users(id) values($1),($2)',[alice,bob]) },30000)
afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.exec('begin') })
afterEach(async () => { await db.exec('rollback') })

it('saves arbitrary-site metadata privately, unread with separate published/planned counts and honest source identity', async () => {
 const id = await create(), story = await entry(id)
 expect(story).toMatchObject({ source_url: 'https://fiction.example/Story/123?edition=one#start', reading_status: 'to_read', last_read_chapter: 0, metadata: { published_chapters: 20, total_chapters: 30 }, work: { ao3_work_id: null, title: null, canonical_url: null } })
 const source = storySourceVersion(story)
 expect(source.identity).toMatchObject({ kind: 'url', origin: 'https://fiction.example' })
 expect(source.canonicalUrl).toBeNull()
 expect(source.publishedChapters).toMatchObject({ source: 'manual', confirmation: 'user_asserted', manualOverride: true })
 expect(source.publishedChapters.observedAt).toBeTruthy()
 expect((await db.query<{ story: Story }>('select story from public.library_search_documents where id=$1',[id])).rows[0].story.crossoverStatus).toBe('unknown')
 await user(bob, async () => { expect((await db.query('select * from public.library_entries')).rows).toHaveLength(0); expect((await db.query('select * from public.works')).rows).toHaveLength(0) })
})
it.each([1,100000])('accepts the inclusive count boundary %s', async count => {
 const id = await create({ metadata: { ...metadata, published_chapters: count, total_chapters: null, chapter_count_manual: false } })
 expect((await entry(id)).metadata.published_chapters).toBe(count)
 expect(storySourceVersion(await entry(id)).publishedChapters.confirmation).toBe('unknown')
})
it.each([null,0,-1,1.5,100001,'20'])('rejects invalid new count %s without leaving a stub', async count => {
 await expect(create({ metadata: { ...metadata, published_chapters: count, total_chapters: null } })).rejects.toThrow()
 expect((await db.query('select * from public.works')).rows).toHaveLength(0)
})
it.each(['javascript:alert(1)','file:///tmp/story','https://user:password@example.com/story','http://127.0.0.1/story','http://localhost/story','http://books.internal/story','https://archiveofourown.org/not-a-work'])('rejects unsafe or misleading URL %s', async url => { await expect(save({ metadata },null,url)).rejects.toThrow() })
it('deduplicates only the owned source candidate and preserves account isolation', async () => {
 const id = await create()
 await expect(create()).rejects.toThrow(/Review similar story URLs/)
 await expect(user(bob, () => db.query('select public.save_library_story_checked($1,$2,$3,$4)',[id,'https://fiction.example/Story/123?edition=one#start',JSON.stringify({metadata}),JSON.stringify({})]))).rejects.toThrow(/available/)
 await user(bob,async()=>{
  await db.query('select public.save_library_story_checked(null,$1,$2,null)',['https://fiction.example/Story/123?edition=one#start',JSON.stringify({metadata:{...metadata,title:'Bob Private Fiction'},status:'to_read',progress:0,favorite:false,collections:[],tags:[]})])
  const visible=(await db.query<{work_id:string;metadata_overrides:{title:string}}>('select work_id,metadata_overrides from public.library_entries')).rows
  expect(visible).toHaveLength(1)
  expect(visible[0].metadata_overrides.title).toBe('Bob Private Fiction')
 })
})
it.each([['complete','finished'],['in_progress','waiting_for_updates'],['unknown','reading'],['abandoned','finished'],['deleted','finished']])('derives %s publication to %s when all published chapters are read', async (publication,status) => {
 const id = await create({ metadata: { ...metadata, publication_status: publication }, status: 'reading', progress: 20, statusOrigin: 'derived' })
 expect((await entry(id)).reading_status).toBe(status)
})
it.each([['keep_read',20,'reading'],['read_all',25,'finished'],['keep_finished',20,'finished']])('reviews explicitly Finished increase with %s', async (choice,progress,status) => {
 const id = await create({ status: 'finished', progress: 20 })
 await expect(save({ metadata: { ...metadata,published_chapters:25 },status:'finished',progress:20 },id)).rejects.toThrow(/Review Finished Status/)
 await save({ metadata: { ...metadata,published_chapters:25 },status,progress,chapterChoice:choice },id)
 expect(await entry(id)).toMatchObject({reading_status:status,last_read_chapter:progress,metadata:{published_chapters:25}})
})
it('preserves derived progress and recalculates Finished and Waiting after an increase', async () => {
 for (const publication of ['complete','in_progress']) {
  const id = await save({metadata:{...metadata,publication_status:publication},status:publication==='complete'?'finished':'waiting_for_updates',progress:20,statusOrigin:'derived'},null,`https://fiction.example/${publication}`)
  await save({metadata:{...metadata,publication_status:publication,published_chapters:25},status:publication==='complete'?'finished':'waiting_for_updates',progress:20,statusOrigin:'preserve'},id,`https://fiction.example/${publication}`)
  expect(await entry(id)).toMatchObject({reading_status:'reading',last_read_chapter:20})
 }
})
it('allows 15/20 to 15/18 and blocks 20/20 to 20/15 until a confirmed reduction, preserving out-of-range reread events', async () => {
 const id = await create({ status:'reading',progress:15 })
 await save({metadata:{...metadata,published_chapters:18},status:'reading',progress:15},id)
 expect((await entry(id)).last_read_chapter).toBe(15)
 const finished = await save({metadata, status:'finished',progress:20},null,'https://fiction.example/finished')
 const history = [{action:'chapter_read',id:'historical',chapter:20,chapter_id:'120',word_count:100,at:'2026-11-10T00:00:00Z',status:'finished',is_reread:true}]
 await db.exec('alter table public.library_entries disable trigger zz_track_library_reading')
 await db.query('update public.library_entries set reading_history=$1 where id=$2',[JSON.stringify(history),finished])
 await db.exec('alter table public.library_entries enable trigger zz_track_library_reading')
 await expect(save({metadata:{...metadata,published_chapters:15},status:'finished',progress:20},finished,'https://fiction.example/finished')).rejects.toThrow(/Review Chapter Progress/)
 await expect(save({metadata:{...metadata,published_chapters:15},status:'finished',progress:15},finished,'https://fiction.example/finished')).rejects.toThrow(/Review Chapter Progress/)
 await save({metadata:{...metadata,published_chapters:15},status:'finished',progress:15,chapterChoice:'reduce'},finished,'https://fiction.example/finished')
 expect((await entry(finished)).reading_history).toEqual(history)
 expect((await entry(finished)).last_read_chapter).toBe(15)
})
it('rejects stale source/count edits and exposes field-aware confidence filters', async () => {
 const id = await create(), before = await snapshot(id)
 await save({metadata:{...metadata,published_chapters:21}},id)
 await expect(save({metadata:{...metadata,published_chapters:22}},id,undefined,before)).rejects.toThrow(/changed/)
 await user(alice, async () => {
  const result=(await db.query<{r:{total:number;stories:Story[]}}>('select public.query_library($1,1,25) r',[JSON.stringify({mode:'library',shelf:'all',filters:{...defaultReadingFilters,countConfidence:'manual',needsCompletionVerification:true}})])).rows[0].r
  expect(result.total).toBe(1)
  expect(result.stories[0].metadataConfidence).toEqual({published_chapters:'manual',publication_status:'unknown'})
 })
})
it('supports checked numeric progress provenance, Undo, export and restore identity round trips', async () => {
 const id=await create(), baseline=await snapshot(id)
 await user(alice, async () => {
  await db.query('select public.update_library_entry_checked($1,$2,$3)',[id,JSON.stringify({status:'reading',progress:10,statusOrigin:'derived'}),JSON.stringify(baseline)])
 })
 const before=await entry(id)
 expect(before.reading_provenance).toMatchObject({statusOrigin:'derived'})
 await user(alice, async () => {
  await db.query('delete from public.library_entries where id=$1',[id])
  await db.query('select public.restore_library_story($1,$2::uuid[],$3::text[])',[JSON.stringify(before),[],[]])
 })
 const after=await entry(id)
 expect(sourceIdentityKey(storySourceVersion(after).identity!)).toBe(sourceIdentityKey(storySourceVersion(before).identity!))
 expect(after.metadata_confirmation_times).toEqual(before.metadata_confirmation_times)
})
it('exports version 2 only for universal libraries and restores their private identity, provenance, progress and starter membership', async () => {
 const id=await create({status:'reading',progress:12}), before=await entry(id)
 const backup=await user(alice,async()=>(await db.query<{b:{version:number;tables:Record<string,unknown[]>}}>('select public.export_library_backup() b')).rows[0].b)
 expect(backup.version).toBe(2)
 await expect(user(alice,()=>db.query('select public.preview_library_restore($1)',[JSON.stringify({...backup,version:1})]))).rejects.toThrow(/version 2/)
 await db.query("insert into storage.objects(bucket_id,name) values('library-backups',$1)",[`${alice}/universal-safety.json`])
 await user(alice,async()=>{
  const preview=(await db.query<{r:{fingerprint:string}}>('select public.preview_library_restore($1) r',[JSON.stringify(backup)])).rows[0].r
  await db.query('select public.restore_own_library_backup($1,$2,$3)',[JSON.stringify(backup),preview.fingerprint,`${alice}/universal-safety.json`])
 })
 const restored=(await db.query<{s:Story}>('select story s from public.library_story_documents where user_id=$1',[alice])).rows[0].s
 expect(restored.id).not.toBe(id)
 expect(restored.original_url).toBe(before.original_url)
 expect(restored.source_url).toBe(before.source_url)
 expect(restored.last_read_chapter).toBe(12)
 expect(restored.metadata_confirmation_times).toEqual(before.metadata_confirmation_times)
 expect(storySourceVersion(restored).publishedChapters).toEqual(storySourceVersion(before).publishedChapters)
 expect((await db.query<{n:number}>("select count(*)::integer n from public.automatic_collection_works a join public.collections c on c.id=a.collection_id where c.user_id=$1 and c.name='Original Works'",[alice])).rows[0].n).toBe(1)
 const otherBackup=await user(bob,async()=>(await db.query<{b:{version:number}}>('select public.export_library_backup() b')).rows[0].b)
 expect(otherBackup.version).toBe(1)
 await expect(user(bob,()=>db.query('select public.preview_library_restore($1)',[JSON.stringify(backup)]))).rejects.toThrow(/own account/)
})
it('never turns foreign labels into AO3 canonical aliases or hierarchy identities', async()=>{
 const id=await create({metadata:{...metadata,character_tags:['Source Alias'],ao3_tags:['Source Alias']}}),s=await entry(id)
 expect((await db.query('select crossover_key from public.library_search_documents where id=$1',[id])).rows[0]).toEqual({crossover_key:null})
 const filters={...defaultReadingFilters,characters:'Canonical Character',tagAliases:{character:{'canonical character':['canonical character','source alias']}}}
 await user(alice,async()=>{
  const matched=(await db.query<{r:boolean}>('select public.library_filter($1,$2,$3) r',[JSON.stringify(s),JSON.stringify(filters),'[]'])).rows[0].r
  expect(matched).toBe(false)
 })
})
it.each(['explicit','derived',undefined])('records actual companion-origin Finished intent as %s without conflating a chapter event with a manual status choice',async intent=>{
 const code=await user(alice,async()=>(await db.query<{r:{code:string}}>("select public.manage_userscript_device('create','Phase 2') r")).rows[0].r.code)
 const secret=(await db.query<{r:{secret:string}}>("select public.userscript_library($1,'claim') r",[code])).rows[0].r.secret
 const payload={version:null,base:{},metadata:{title:'Companion Fiction',publication_status:'complete',published_chapters:20,total_chapters:20},status:'finished',progress:20,statusOrigin:intent,notes:'',tags:[],collections:[],chapter_read:{chapter:20,chapter_id:'120',word_count:null}}
 const result=(await db.query<{r:{entry:{id:string}}}>("select public.userscript_library($1,'save',12345,$2) r",[secret,JSON.stringify(payload)])).rows[0].r
 expect((await entry(result.entry.id)).reading_provenance).toMatchObject({statusOrigin:intent ?? 'explicit'})
})
it('requires manual terminal publication declarations before deriving Finished from private availability',async()=>{
 const id=await save({metadata:{title:'Unavailable Fiction',published_chapters:20,total_chapters:30},status:'reading',progress:0},null,'https://archiveofourown.org/works/12346')
 await db.query("update public.library_entries set work_status='deleted' where id=$1",[id])
 const baseline=await snapshot(id)
 await user(alice,()=>db.query('select public.update_library_entry_checked($1,$2,$3)',[id,JSON.stringify({status:'finished',progress:20,statusOrigin:'derived'}),JSON.stringify(baseline)]))
 expect((await entry(id)).reading_status).toBe('reading')
 await save({metadata:{publication_status:'deleted'},status:'finished',progress:20,statusOrigin:'derived'},id,'https://archiveofourown.org/works/12346')
 expect((await entry(id)).reading_status).toBe('finished')
})
it('preserves the exact international submission separately from a safe serialized unverified candidate',async()=>{
 const submitted=' HTTPS://Bücher.example/one/../story?title=two words#part '
 const candidate='https://xn--bcher-kva.example/story?title=two%20words#part'
 const id=await save({metadata,submittedUrl:submitted},null,candidate)
 const saved=await entry(id)
 expect(saved.original_url).toBe(submitted)
 expect(saved.source_url).toBe(candidate)
 expect(storySourceVersion(saved)).toMatchObject({originalUrl:submitted,normalizedUrl:candidate,canonicalUrl:null})
 await save({metadata:{title:'Corrected'}},id,candidate)
 expect((await entry(id)).original_url).toBe(submitted)
})
it('revalidates a count-review choice against concurrent reading decisions even when its proposed status matches the old baseline',async()=>{
 const id=await create({status:'finished',progress:20}),before=await snapshot(id)
 await user(alice,()=>db.query('select public.update_library_entry_checked($1,$2,$3)',[id,JSON.stringify({status:'reading',progress:18,statusOrigin:'explicit'}),JSON.stringify(before)]))
 await expect(save({metadata:{...metadata,published_chapters:25},status:'finished',progress:20,chapterChoice:'keep_finished'},id,undefined,before)).rejects.toThrow(/Reading progress changed/)
 expect(await entry(id)).toMatchObject({reading_status:'reading',last_read_chapter:18,metadata:{published_chapters:20}})
})
it('lets an explicit Finished choice replace a previously derived Finished state without inflating progress',async()=>{
 const id=await create({metadata:{...metadata,publication_status:'complete'},status:'finished',progress:20,statusOrigin:'derived'})
 await save({metadata:{...metadata,publication_status:'complete',published_chapters:25},status:'finished',progress:20,statusOrigin:'explicit'},id)
 expect(await entry(id)).toMatchObject({reading_status:'finished',last_read_chapter:20,reading_provenance:{statusOrigin:'explicit'}})
})

it('upgrades an unchanged derived Finished state only for an explicit status decision, preserving origin during notes and metadata edits',async()=>{
 const id=await create({metadata:{...metadata,publication_status:'complete'},status:'finished',progress:20,statusOrigin:'derived'})
 await save({metadata:{title:'A correction'},status:'finished',progress:20,statusOrigin:'preserve'},id)
 const baseline=await snapshot(id)
 await user(alice,()=>db.query('select public.update_library_entry_checked($1,$2,$3)',[id,JSON.stringify({notes:'Personal notes'}),JSON.stringify(baseline)]))
 expect((await entry(id)).reading_provenance).toMatchObject({statusOrigin:'derived'})
 await user(alice,()=>db.query('select public.update_library_entry_checked($1,$2,$3)',[id,JSON.stringify({status:'finished',progress:20,statusOrigin:'explicit'}),JSON.stringify(baseline)]))
 expect((await entry(id)).reading_provenance).toMatchObject({statusOrigin:'explicit'})
 await expect(save({metadata:{published_chapters:25},status:'finished',progress:20,statusOrigin:'preserve'},id)).rejects.toThrow(/Review Finished Status/)
})
it('does not turn an existing unknown source count into zero or require inventing a count to edit other fields',async()=>{
 const id=await create()
 await save({metadata:{published_chapters:null}},id)
 await save({metadata:{title:'Still Unknown'},notes:'Preserve this unknown count'},id)
 expect(await entry(id)).toMatchObject({last_read_chapter:0,metadata:{published_chapters:null,title:'Still Unknown'},notes:'Preserve this unknown count'})
 expect(storySourceVersion(await entry(id)).publishedChapters.value).toBeNull()
})
it.each(['https://fiction.example/reread','https://archiveofourown.org/works/12347'])('retains explicit Re-Reading and its history through source-specific count edits: %s',async url=>{
 const initial={...metadata,published_chapters:30,total_chapters:40,publication_status:'in_progress'}
 const id=await save({metadata:initial,status:'re_reading',progress:20,statusOrigin:'explicit'},null,url)
 const before=await entry(id)
 await save({metadata:{published_chapters:15},status:'re_reading',progress:15,statusOrigin:'preserve',chapterChoice:'reduce'},id,url)
 expect(await entry(id)).toMatchObject({reading_status:'re_reading',last_read_chapter:15,reading_provenance:{statusOrigin:'explicit'},reading_history:before.reading_history})
 await save({metadata:{published_chapters:25},status:'re_reading',progress:15,statusOrigin:'preserve'},id,url)
 expect(await entry(id)).toMatchObject({reading_status:'re_reading',last_read_chapter:15,reading_history:before.reading_history})
})
it.each(['https://fiction.example/planned','https://archiveofourown.org/works/12348'])('keeps an unchanged planned total separate during a confirmed 20/20 to 25/25 increase: %s',async url=>{
 const id=await save({metadata:{...metadata,total_chapters:20},status:'finished',progress:20,statusOrigin:'explicit'},null,url)
 await save({metadata:{published_chapters:25},status:'finished',progress:25,statusOrigin:'explicit',chapterChoice:'read_all'},id,url)
 expect(await entry(id)).toMatchObject({reading_status:'finished',last_read_chapter:25,metadata:{published_chapters:25,total_chapters:20}})
})
it('requires a separate-save decision at the server even when a client has a stale duplicate catalog',async()=>{
 const id=await create(),other='https://fiction.example/Story/123?edition=two'
 await expect(save({metadata},null,other)).rejects.toThrow(/Review similar story URLs/)
 const separate=await save({metadata,allowSeparate:true},null,other)
 expect(separate).not.toBe(id)
 await expect(save({metadata,allowSeparate:true},null,other)).rejects.toThrow(/Review similar story URLs/)
})
it('supports bounded long source URLs without exceeding PostgreSQL text-index entry limits',async()=>{
 const url='https://fiction.example/long?selection='+('x'.repeat(5000))
 const id=await save({metadata},null,url)
 expect((await entry(id)).source_url).toBe(url)
 await expect(save({metadata},null,url)).rejects.toThrow(/Review similar story URLs/)
})
