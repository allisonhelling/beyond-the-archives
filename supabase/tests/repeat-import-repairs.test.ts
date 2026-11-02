// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import type { ReadingReviews } from '../../src/features/imports/import-reading-review'
import { automaticCollectionRules } from '../../src/features/library/collections/automatic-collections'
import { defaultReadingFilters } from '../../src/features/library/reading-search'
let db: PGlite
const alice='10000000-0000-0000-0000-000000000001',bob='10000000-0000-0000-0000-000000000002'
beforeAll(async()=>{
 db=await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}'); set role authenticated; set request.jwt.claim.sub='${alice}';`)
},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{await db.exec('begin')})
afterEach(async()=>{await db.exec('rollback')})
const row=(changes={})=>({workId:8001,url:'https://archiveofourown.org/works/8001',source:'bookmarks',choice:'keep',workStatus:'available',metadata:{title:'Repair test',published_chapters:3},bookmarkDate:'2026-10-20',updatedDate:'2026-10-10',notes:'Preserved notes',tags:['Private'],...changes})
async function sync(rows:object[]) { return (await db.query<{result:Record<string,number>}>('select public.submit_ao3_library_sync($1) result',[JSON.stringify(rows)])).rows[0].result }
async function entry() { return (await db.query<{id:string;reading_status:string;last_read_chapter:number;finished_at:string|null;reading_history:{action:string;at:string}[];reading_provenance:Record<string,unknown>;extension_metadata:Record<string,unknown>;metadata_overrides:Record<string,unknown>;notes:string}>('select * from public.library_entries where user_id=auth.uid()')).rows[0] }
async function review(ids:string[]=[],action='list') {return (await db.query<{result:ReadingReviews}>('select public.review_import_reading($1,$2) result',[ids,action])).rows[0].result}
it('projects each listing work once after all import writes, including repairs and reading provenance',async()=>{
 await db.query('insert into public.collections(name,automatic_rules) values($1,$2)',[
  'Imported Fandom',JSON.stringify(automaticCollectionRules({...defaultReadingFilters,fandoms:['Test Fandom']})),
 ])
 await db.exec(`reset role;
  create temp table document_refreshes(id uuid);
  create function pg_temp.count_document_refresh() returns trigger language plpgsql security definer as $$
   begin insert into pg_temp.document_refreshes values(new.id); return null; end $$;
  create trigger count_document_refresh after insert or update on public.library_search_documents
   for each row execute function pg_temp.count_document_refresh();
  set role authenticated;`)
 const rows=Array.from({length:20},(_,index)=>row({workId:8001+index,url:`https://archiveofourown.org/works/${8001+index}`,metadata:{title:'Repair test',published_chapters:3,fandoms:['Test Fandom']}}))
 expect(await sync(rows)).toMatchObject({imported:20})
 expect((await db.query('select count(*)::integer total from public.automatic_collection_works')).rows[0]).toEqual({total:20})
 await db.exec('reset role')
 expect((await db.query('select count(*)::integer total,count(distinct id)::integer works from document_refreshes')).rows[0]).toEqual({total:20,works:20})
 expect((await db.query(`select count(*)::integer total from public.library_search_documents d
  join public.library_entries e using(id) where d.story->'reading_provenance'=e.reading_provenance
  and d.story->'metadata'->>'title'='Repair test'`)).rows[0]).toEqual({total:20})
 await db.exec('truncate document_refreshes; set role authenticated')
 const repairs=rows.map(work=>({...work,metadata:{...work.metadata,title:'Repaired title',fandoms:['Other Fandom']}}))
 expect(await sync(repairs)).toMatchObject({kept:20,metadataRepaired:20})
 expect((await db.query('select count(*)::integer total from public.automatic_collection_works')).rows[0]).toEqual({total:0})
 await db.exec('reset role')
 expect((await db.query('select count(*)::integer total,count(distinct id)::integer works from document_refreshes')).rows[0]).toEqual({total:20,works:20})
 await db.exec('truncate document_refreshes; set role authenticated')
 expect(await sync(repairs)).toMatchObject({kept:20,metadataRepaired:0})
 await db.exec('reset role')
 expect((await db.query('select count(*)::integer total from document_refreshes')).rows[0]).toEqual({total:0})
 await db.exec('set role authenticated')
})
it('preserves an enclosing document batch until its owner flushes it',async()=>{
 await db.exec("select set_config('app.defer_library_documents','on',true)")
 await sync([row()])
 expect((await db.query('select count(*)::integer total from public.library_search_documents')).rows[0]).toEqual({total:0})
 expect((await db.query("select current_setting('app.defer_library_documents') value")).rows[0]).toEqual({value:'on'})
 await db.exec('reset role; select public.flush_library_documents(); set role authenticated')
 expect((await db.query('select count(*)::integer total from public.library_search_documents')).rows[0]).toEqual({total:1})
})
it('rolls back source writes and pending projections together when a listing import fails',async()=>{
 await db.exec('savepoint failed_import')
 await expect(sync([row(),row({workId:8002,url:'https://archiveofourown.org/works/8002',metadata:{}})])).rejects.toThrow('CSV title is required')
 await db.exec('rollback to savepoint failed_import')
 expect((await db.query('select count(*)::integer total from public.library_entries')).rows[0]).toEqual({total:0})
 expect((await db.query('select count(*)::integer total from public.library_search_documents')).rows[0]).toEqual({total:0})
 expect(await sync([row()])).toMatchObject({imported:1})
 expect((await db.query('select count(*)::integer total from public.library_search_documents')).rows[0]).toEqual({total:1})
})
it('repairs series metadata and proposes legacy reading corrections without changing personal history',async()=>{
 await sync([row({source:'marked_for_later'})])
 await db.exec('reset role')
 await db.query("update public.library_entries set reading_provenance='{}',metadata_overrides='{\"title\":\"My title\"}' where id=$1",[(await entry()).id])
 await db.exec('set role authenticated')
 const before=await entry()
 const metadata={title:'New AO3 title',published_chapters:3,series_checked:true,series:['Repaired series'],series_memberships:[{id:99,name:'Repaired series',url:'https://archiveofourown.org/series/99',position:1}]}
 expect(await sync([row({metadata})])).toMatchObject({kept:1,metadataRepaired:1,seriesRepaired:1,readingCorrections:1})
 const after=await entry()
 expect(after).toMatchObject({reading_status:before.reading_status,last_read_chapter:before.last_read_chapter,finished_at:before.finished_at,notes:before.notes,metadata_overrides:{title:'My title'},extension_metadata:{series:['Repaired series']}})
 expect(after.reading_history.filter(event=>event.action!=='added')).toEqual(before.reading_history.filter(event=>event.action!=='added'))
 const reviews=await review()
 expect(reviews.reviews[0]).toMatchObject({source:'legacy_unknown',proposed:{status:'finished',progress:3},progressKnown:true,savedProgressKnown:false})
 expect(await review([after.id],'accept')).toMatchObject({changed:1,total:0})
 expect(await entry()).toMatchObject({reading_status:'finished',last_read_chapter:3,reading_provenance:{source:'reviewed_import'},notes:'Preserved notes'})
 expect(new Date((await entry()).finished_at!).toISOString()).toBe('2026-10-20T00:00:00.000Z')
 expect((await entry()).reading_history).not.toEqual(before.reading_history)
})
it('keeps unknown series untouched and records an explicitly checked standalone observation',async()=>{
 await sync([row({metadata:{title:'Title',series:['Old'],series_memberships:[{id:99,name:'Old',url:'https://archiveofourown.org/series/99',position:1}]}})])
 await sync([row({metadata:{title:'Title',series:[],series_memberships:[]}})])
 expect((await entry()).extension_metadata.series).toEqual(['Old'])
 expect(await sync([row({metadata:{title:'Title',series_checked:true,series:[],series_memberships:[]}})])).toMatchObject({seriesRepaired:1})
 expect((await entry()).extension_metadata).toMatchObject({series_checked:true,series:[],series_memberships:[]})
})
it('distinguishes unknown progress from confirmed zero and preserves inferred positive progress when no new dates exist',async()=>{
 await sync([row({bookmarkDate:'2026-10-01',updatedDate:'2026-10-10'})])
 expect((await entry()).reading_provenance).toMatchObject({progressKnown:false,source:'bookmark_inference'})
 const dated=row({bookmarkDate:'2026-10-01',updatedDate:'2026-10-10',metadata:{title:'Title',published_chapters:3,chapter_dates:{1:'2026-10-02'}}})
 await sync([dated])
 expect((await review()).reviews[0]).toMatchObject({proposed:{progress:0},progressKnown:true,savedProgressKnown:false})
 await review([(await entry()).id],'accept')
 expect((await entry()).reading_provenance).toMatchObject({progressKnown:true})
})
it('preserves personal edits and invalidates pending proposals before they can be accepted',async()=>{
 await sync([row({source:'marked_for_later'})]);await sync([row()])
 const id=(await entry()).id
 expect((await review()).total).toBe(1)
 await db.query("update public.library_entries set reading_status='paused_reading',last_read_chapter=1 where id=$1",[id])
 expect(await review([id],'accept')).toMatchObject({changed:0,skipped:1})
 await sync([row()])
 expect((await review()).total).toBe(0)
 expect(await entry()).toMatchObject({reading_status:'paused_reading',last_read_chapter:1,reading_provenance:{source:'manual'}})
})
it('preserves positive progress when a repeat observation cannot confirm chapter progress',async()=>{
 await sync([row({bookmarkDate:'2026-10-05',updatedDate:'2026-10-10',metadata:{title:'Title',published_chapters:3,chapter_dates:{1:'2026-10-01',2:'2026-10-03',3:'2026-10-10'}}})])
 expect(await entry()).toMatchObject({last_read_chapter:2,reading_provenance:{progressKnown:true}})
 await sync([row({bookmarkDate:'2026-10-05',updatedDate:'2026-10-10'})])
 expect(await entry()).toMatchObject({last_read_chapter:2,reading_provenance:{progressKnown:true}})
 expect((await review()).total).toBe(0)
})
it('accepts multiple corrections together without changing unselected entries',async()=>{
 const rows=[8001,8002,8003].map(workId=>row({workId,url:`https://archiveofourown.org/works/${workId}`}))
 await sync(rows.map(work=>({...work,source:'marked_for_later'})))
 await sync(rows)
 const pending=await review()
 expect(pending.total).toBe(3)
 const ids=pending.reviews.slice(0,2).map(item=>item.id)
 expect(await review(ids,'accept')).toMatchObject({changed:2,skipped:0,total:1})
 const saved=await db.query<{id:string;reading_status:string;notes:string}>('select id,reading_status,notes from public.library_entries where user_id=auth.uid()')
 for (const item of saved.rows) expect(item).toMatchObject({reading_status:ids.includes(item.id)?'finished':'to_read',notes:'Preserved notes'})
})
it('keeps dismissed proposals dismissed on retry and rejects cross-account acceptance',async()=>{
 await sync([row({source:'marked_for_later'})]);await sync([row()])
 const id=(await entry()).id
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect(await review([id],'accept')).toMatchObject({changed:0,total:0})
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
 expect(await review([id],'keep')).toMatchObject({changed:1,total:0})
 await sync([row()])
 expect((await review()).total).toBe(0)
 expect((await entry()).reading_status).toBe('to_read')
})
it('respects Full Scan review opt-out while repairing metadata and makes repeated metadata repairs idempotent',async()=>{
 await sync([row({source:'marked_for_later'})])
 const incoming=row({reviewExisting:false,metadata:{title:'Repaired title'}})
 expect(await sync([incoming])).toMatchObject({metadataRepaired:1,readingCorrections:0})
 expect(await sync([incoming])).toMatchObject({metadataRepaired:0,readingCorrections:0})
 expect((await review()).total).toBe(0)
})

it('distinguishes the initial To Read default from an explicit personal status selection',async()=>{
 const defaults=row({importReadingStatus:'to_read',importReadingStatusOrigin:'default'})
 await sync([defaults])
 expect(await entry()).toMatchObject({reading_status:'to_read',reading_provenance:{source:'import_default',progressKnown:false}})
 await sync([defaults])
 expect((await review()).reviews[0]).toMatchObject({source:'import_default',proposed:{status:'finished',progress:3}})
 await review([(await entry()).id],'keep')
 await sync([row({workId:8002,url:'https://archiveofourown.org/works/8002',importReadingStatus:'paused_reading',importReadingStatusOrigin:'manual'})])
 await sync([row({workId:8002,url:'https://archiveofourown.org/works/8002'})])
 expect((await review()).total).toBe(0)
})

it('scopes reading-review counts, rows, and changes to the relevant import IDs', async()=>{
 await sync([row({workId:8101,url:'https://archiveofourown.org/works/8101',importReadingStatus:'to_read',importReadingStatusOrigin:'default'}),row({workId:8102,url:'https://archiveofourown.org/works/8102',importReadingStatus:'to_read',importReadingStatusOrigin:'default'})])
 await sync([row({workId:8101,url:'https://archiveofourown.org/works/8101'}),row({workId:8102,url:'https://archiveofourown.org/works/8102'})])
 const all=await review();expect(all.total).toBe(2)
 const [first,other]=all.reviews
 const scoped=async(ids:string[],action:string,scope:string[]) => (await db.query<{result:ReadingReviews}>('select public.review_import_reading($1,$2,1,$3) result',[ids,action,scope])).rows[0].result
 const own=await scoped([],'list',[first.id])
 expect(own.total).toBe(1);expect(own.reviews.map(review=>review.id)).toEqual([first.id])
 expect((await scoped([],'list',[])).total).toBe(0)
 expect((await scoped([other.id],'accept',[first.id])).changed).toBe(0)
 expect((await review()).total).toBe(2)
 expect((await scoped([first.id],'keep',[first.id])).total).toBe(0)
 expect((await review()).reviews.map(review=>review.id)).toEqual([other.id])
})
