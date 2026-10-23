// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { automaticCollectionRules } from '../../src/features/library/collections/automatic-collections'
import { defaultReadingFilters } from '../../src/features/library/reading-search'
import type { LibraryResults } from '../../src/features/library/repository'
import type { Story } from '../../src/features/library/model'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
const rules = automaticCollectionRules({ ...defaultReadingFilters, fandoms:['Teen Wolf (TV)'], tags:'Found Family' })
beforeAll(async () => {
 db = await createTestDatabase()
 await db.exec(`insert into auth.users values ('${alice}'),('${bob}'); delete from public.collections;
 insert into public.works(ao3_work_id,title) values(101,'First'),(102,'Second'),(103,'Third');
 insert into public.library_entries(user_id,work_id,original_url,metadata_overrides)
 select '${alice}',id,'https://archiveofourown.org/works/'||ao3_work_id,
 jsonb_build_object('fandoms',jsonb_build_array('Teen Wolf (TV)'),'additional_tags',jsonb_build_array(case when ao3_work_id=101 then 'Found Family' else 'Angst' end))
 from public.works where ao3_work_id in (101,102);
 insert into public.library_entries(user_id,work_id,original_url,metadata_overrides)
 select '${bob}',id,'https://archiveofourown.org/works/101','{"fandoms":["Teen Wolf (TV)"],"additional_tags":["Found Family"]}' from public.works where ao3_work_id=101;
 set role authenticated; set request.jwt.claim.sub='${alice}';`)
}, 30000)
afterAll(async () => { await db?.close() })
async function create(name: string) {
 return (await db.query<{id:string}>('insert into public.collections(name,automatic_rules) values($1,$2) returning id',[name,JSON.stringify(rules)])).rows[0].id
}
async function query(shelf: string) {
 return (await db.query<{result:LibraryResults}>('select public.query_library($1,1,25) result',[JSON.stringify({mode:'library',shelf,filters:defaultReadingFilters})])).rows[0].result
}
it('matches existing and newly saved works, metadata edits and rule edits without copying memberships', async () => {
 const id = await create('Found family')
 let result = await query(id)
 expect(result.total).toBe(1)
 const first = result.stories[0]
 expect(first.automaticCollectionIds).toEqual([id])
 expect(first.collectionIds).toEqual([])
 const catalog = (await db.query<{result:{stories:Story[]}}>('select public.library_catalog() result')).rows[0].result
 expect(catalog.stories.find(story=>story.id===first.id)?.automaticCollectionIds).toEqual([id])
 const details = (await db.query<{result:Story[]}>('select public.library_story_details($1) result',[[first.id]])).rows[0].result
 expect(details[0].automaticCollectionIds).toEqual([id])
 await db.exec(`reset role; insert into public.library_entries(user_id,work_id,original_url,metadata_overrides)
 select '${alice}',id,'https://archiveofourown.org/works/103','{"fandoms":["Teen Wolf (TV)"],"additional_tags":["Found Family"]}' from public.works where ao3_work_id=103; set role authenticated;`)
 expect((await query(id)).total).toBe(2)
 await db.query(`update public.library_entries set metadata_overrides=metadata_overrides||'{"additional_tags":["Angst"]}'::jsonb where id=$1`,[first.id])
 expect((await query(id)).total).toBe(1)
 const changed = automaticCollectionRules({...defaultReadingFilters,tags:'Angst'})
 await db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify(changed)])
 result = await query(id)
 expect(result.total).toBe(2)
 expect(result.stories.map(story=>story.id)).toContain(first.id)
 expect((await db.query<{count:number}>('select count(*)::integer count from public.collection_works where collection_id=$1',[id])).rows[0].count).toBe(0)
 await db.query('delete from public.collections where id=$1',[id])
 expect((await query(id)).total).toBe(0)
})
it('uses the shared search parser and combines tag, rating, completion and date filters', async () => {
 const id = await create('Precise rules')
 await db.exec(`update public.library_entries set notes='Keep this star *',metadata_overrides=metadata_overrides||'{"rating":"Teen And Up Audiences","publication_status":"complete","published_chapters":1,"total_chapters":1}'::jsonb;
 reset role; update public.works set ao3_updated_at='2026-10-01'; set role authenticated;`)
 const filters = {...defaultReadingFilters,tags:'Angst',rating:['Teen And Up Audiences'],publication:['complete' as const],oneShot:'only' as const,updatedAfter:'2026-09-01',updatedBefore:'2026-10-02',scope:'notes' as const,within:'"Keep this" \\*'}
 await db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify(automaticCollectionRules(filters))])
 expect((await query(id)).total).toBe(2)
 await db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify(automaticCollectionRules({...filters,within:'missing'}))])
 expect((await query(id)).total).toBe(0)
})
it('keeps rules and matching works private and rejects manual membership and malformed rules', async () => {
 const id = await create('Private rules'), entry = (await query('all')).stories[0]
 await expect(db.query('insert into public.collection_works(collection_id,library_entry_id) values($1,$2)',[id,entry.id])).rejects.toThrow('determined by its filters')
 await expect(db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify({filters:{fandoms:'wrong'},terms:[]})])).rejects.toThrow('filter list')
 await expect(db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify({filters:{updatedAfter:'not a date'},terms:[]})])).rejects.toThrow('filter date')
 await expect(db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify({filters:{},terms:[[{parts:42,exclude:false}]]})])).rejects.toThrow('search term')
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect((await query(id)).total).toBe(0)
 expect((await db.query('select * from public.collections where id=$1',[id])).rows).toEqual([])
 const visible = (await db.query<{user_id:string}>('select user_id from public.library_collection_documents')).rows
 expect(visible).toHaveLength(1)
 expect(visible.every(row=>row.user_id===bob)).toBe(true)
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
})

it('converts a populated manual collection to automatic matching without keeping nonmatching manual works', async () => {
 const entries = (await query('all')).stories
 const matching = entries.find(story=>story.work.ao3_work_id===101)!, nonmatching = entries.find(story=>story.work.ao3_work_id===102)!
 const id = (await db.query<{id:string}>("insert into public.collections(name,description,color,symbol) values('Convert me','Keep my summary','#123456','moon') returning id")).rows[0].id
 await db.query('insert into public.collection_works(collection_id,library_entry_id) values($1,$2)',[id,nonmatching.id])
 expect((await query(id)).stories.map(story=>story.id)).toEqual([nonmatching.id])
 await db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify(automaticCollectionRules({...defaultReadingFilters,within:'First'}))])
 expect((await query(id)).stories.map(story=>story.id)).toEqual([matching.id])
 expect((await db.query('select * from public.collection_works where collection_id=$1',[id])).rows).toHaveLength(0)
 expect((await db.query('select name,description,color,symbol from public.collections where id=$1',[id])).rows[0]).toEqual({name:'Convert me',description:'Keep my summary',color:'#123456',symbol:'moon'})
 expect((await query('all')).stories).toHaveLength(entries.length)
})

it('matches only authors for automatic queries and still searches titles within results and in the library', async () => {
 await db.exec(`update public.library_entries set metadata_overrides=metadata_overrides||jsonb_build_object('authors',jsonb_build_array(case when work_id=(select id from public.works where ao3_work_id=102) then 'Fírst author' else 'Another author' end));`)
 const id=await create('Author search')
 await db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify(automaticCollectionRules({...defaultReadingFilters,query:'first'}))])
 expect((await query(id)).stories.map(story=>story.work.ao3_work_id)).toEqual([102])
 const library=(await db.query<{result:LibraryResults}>('select public.query_library($1,1,25) result',[JSON.stringify({mode:'library',shelf:'all',filters:{...defaultReadingFilters,query:'first'}})])).rows[0].result
 expect(library.total).toBe(2)
 await db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify(automaticCollectionRules({...defaultReadingFilters,within:'First'}))])
 expect((await query(id)).total).toBe(2)
})

it('turns automation off atomically, preserving current works and stopping future matching', async () => {
 const entries=(await query('all')).stories
 const first=entries.find(story=>story.work.ao3_work_id===101)!, second=entries.find(story=>story.work.ao3_work_id===102)!
 await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"additional_tags\":[\"Snapshot Target\"]}'::jsonb where id=$1",[first.id])
 const id=await create('Keep current works')
 await db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify(automaticCollectionRules({...defaultReadingFilters,tags:'Snapshot Target'}))])
 expect((await query(id)).stories.map(story=>story.id)).toEqual([first.id])
 await db.query("update public.collections set automatic_rules=null,symbol='sparkle' where id=$1",[id])
 expect((await db.query('select automatic_rules,symbol from public.collections where id=$1',[id])).rows[0]).toEqual({automatic_rules:null,symbol:'sparkle'})
 expect((await db.query('select library_entry_id from public.collection_works where collection_id=$1',[id])).rows).toEqual([{library_entry_id:first.id}])
 await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"additional_tags\":[\"Snapshot Target\"]}'::jsonb where id=$1",[second.id])
 await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"additional_tags\":[]}'::jsonb where id=$1",[first.id])
 expect((await query(id)).stories.map(story=>story.id)).toEqual([first.id])
 await db.query("update public.collections set symbol='scroll' where id=$1",[id])
 expect((await db.query<{symbol:string}>('select symbol from public.collections where id=$1',[id])).rows[0].symbol).toBe('scroll')
 await expect(db.query("update public.collections set symbol='unknown' where id=$1",[id])).rejects.toThrow('collections_symbol_check')
})


it('preserves author-only matching when converting automatic collections',async()=>{
 const id=await create('Preserve author matches')
 await db.query('update public.collections set automatic_rules=$2 where id=$1',[id,JSON.stringify(automaticCollectionRules({...defaultReadingFilters,query:'first'}))])
 const before=(await query(id)).stories.map(story=>story.id)
 expect(before).toHaveLength(1)
 await db.query('update public.collections set automatic_rules=null where id=$1',[id])
 expect((await query(id)).stories.map(story=>story.id)).toEqual(before)
})
