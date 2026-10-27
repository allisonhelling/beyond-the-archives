// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import type { ReadingReviews } from '../../src/features/imports/import-reading-review'
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
