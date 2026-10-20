// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { defaultReadingFilters, filterReading, parseSearch } from '../../src/features/library/reading-search'
import { librarySeries } from '../../src/features/library/series'
import { filterLibraryItems, seriesSearchStory } from '../../src/features/library/series-search'
import type { Story } from '../../src/features/library/model'
import type { LibraryResults } from '../../src/features/library/repository'
let db: PGlite
const alice='10000000-0000-0000-0000-000000000001', bob='10000000-0000-0000-0000-000000000002'
beforeAll(async () => {
 db=await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}'); insert into public.works(ao3_work_id,title,summary,published_chapters,total_chapters,is_complete,verified_chapters) select n,'Tied title','Café friendship and a literal * star',6,9,false,'{"1":"91","2":"92"}' from generate_series(1,57) n;
 insert into public.library_entries(id,user_id,work_id,original_url,reading_status,notes) select ('30000000-0000-0000-0000-'||lpad(ao3_work_id::text,12,'0'))::uuid,'${alice}',id,'https://archiveofourown.org/works/'||ao3_work_id,'reading','Private notes' from public.works;
 insert into public.library_entries(user_id,work_id,original_url,metadata_overrides) select '${bob}',id,'https://archiveofourown.org/works/1','{"title":"Bobs secret"}' from public.works where ao3_work_id=1;
 set role authenticated; set request.jwt.claim.sub='${alice}';`)
},30000)
afterAll(async()=>{await db?.close()})
async function query(filters={},page=1,size=25,shelf='all') {
 return (await db.query<{result:LibraryResults}>('select public.query_library($1,$2,$3) result',[JSON.stringify({mode:'library',shelf,filters:{...defaultReadingFilters,...filters},terms:parseSearch((filters as {within?:string}).within??'')}),page,size])).rows[0].result
}
async function documents() { return (await db.query<{story:Story}>('select story from public.library_search_documents where user_id=auth.uid() order by id')).rows.map(row=>row.story) }
it('counts the complete result set, has unique stable boundaries and clamps after deletion',async()=>{
 const first=await query(),second=await query({},2),last=await query({},999)
 expect(first).toMatchObject({total:57,pages:3,page:1})
 expect(first.stories).toHaveLength(25);expect(last.stories).toHaveLength(7);expect(last.page).toBe(3)
 expect(new Set([...first.stories,...second.stories,...last.stories].map(s=>s.id)).size).toBe(57)
 expect((await query()).stories.map(s=>s.id)).toEqual(first.stories.map(s=>s.id))
 const catalog=(await db.query<{result:{stories:Story[]}}>('select public.library_catalog() result')).rows[0].result
 expect(catalog.stories[0]).toHaveProperty('updated_at')
 expect(catalog.stories[0]).toHaveProperty('last_read_chapter')
 await db.query('delete from public.library_entries where id=any($1::uuid[])',[last.stories.map(s=>s.id)])
 expect(await query({},3)).toMatchObject({total:50,pages:2,page:2})
 expect(await query({query:'no such title'},500)).toMatchObject({total:0,page:1,pages:1,stories:[]})
})
it('preserves the parser, scope, unicode normalization and every stable sort',async()=>{
 const initial=await documents()
 await db.exec('reset role')
 for(const [i,title] of ['apple','Zoo','Éclair','eclair','ÉCLAIR','Alpha','猫','Ωmega'].entries()) await db.query("update public.library_entries set metadata_overrides=jsonb_build_object('title',$2::text) where id=$1",[initial[i].id,title])
 await db.exec('set role authenticated')
 const all=await documents()
 expect((await db.query<{value:string}>('select public.library_normalize($1) value',['किताब'])).rows[0].value).toBe('कतब')
 for(const within of ['cafe friend*','"café friendship"','cafe -friend','notfound || friendship','\\*','friend*star','friend -"missing phrase"']) {
  const expected=filterReading(all,{...defaultReadingFilters,within}).map(s=>s.id)
  expect((await query({within},1,100)).stories.map(s=>s.id)).toEqual(expected)
 }
 for(const sort of ['added','added_reverse','updated','updated_reverse','ready','ready_reverse','alpha','alpha_reverse'] as const) expect((await query({sort},1,100)).stories.map(s=>s.id)).toEqual(filterReading(all,{...defaultReadingFilters,sort}).map(s=>s.id))
 expect((await query({within:'private',scope:'notes'})).total).toBe(50)
 expect((await query({within:'private',scope:'summary'})).total).toBe(0)
})
it('updates only affected projections and keeps shared, browser and manual metadata precedence',async()=>{
 const all=await documents(),id=all[0].id,other=all[1]
 await db.exec('reset role')
 await db.query(`update public.library_entries set metadata_overrides='{"title":"Manual","additional_tags":["Private tag"]}', extension_metadata='{"title":"Browser","authors":["Browser author"],"published_chapters":8,"is_complete":false,"ao3_updated_at":"2026-10-15T00:00:00Z"}',extension_chapters='{"9":"900"}' where id=$1`,[id])
 await db.exec('set role authenticated')
 const details=(await db.query<{result:Story[]}>('select public.library_story_details($1) result',[[id]])).rows[0].result[0]
 expect(details.metadata).toMatchObject({title:'Manual',authors:['Browser author'],published_chapters:8,additional_tags:['Private tag'],publication_status:'in_progress'})
 expect(details.work.verified_chapters).toEqual({'9':'900'})
 expect((await query({query:'Manual'})).total).toBe(1)
 expect((await query({tags:'private',updatedAfter:'2026-10-14'})).total).toBe(1)
 await db.exec("set time zone 'America/Chicago'")
 expect((await query({updatedAfter:'2026-10-15',updatedBefore:'2026-10-15'})).total).toBe(1)
 expect((await documents()).find(story=>story.id===other.id)).toEqual(other)
 await db.exec("insert into public.collections(name) values ('Custom')")
 await db.query("insert into public.collection_works(collection_id,library_entry_id) select id,$1 from public.collections where name='Custom'",[id])
 const collection=(await db.query<{id:string}>("select id from public.collections where name='Custom'")).rows[0].id
 expect((await query({},1,25,collection)).total).toBe(1)
 await db.query('delete from public.collections where id=$1',[collection])
 expect((await query({},1,25,collection)).total).toBe(0)
})
it('preserves shared entity ordering and AO3 source tag order through source updates',async()=>{
 const work=(await documents())[1].work_id
 await db.exec('reset role')
 await db.exec("insert into public.authors(id,name) values ('20000000-0000-0000-0000-000000000001','First'),('20000000-0000-0000-0000-000000000002','Second'); insert into public.tags(name,category) values ('Zulu','freeform'),('Alpha','freeform')")
 await db.query('insert into public.work_authors select $1,id from public.authors',[work])
 await db.query("insert into public.work_tags(work_id,tag_id,source_position) select $1,id,case name when 'Zulu' then 1 else 2 end from public.tags",[work])
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}'`)
 const story=(await documents()).find(story=>story.work_id===work)!
 expect(story.metadata.authors).toEqual(['First','Second']);expect(story.metadata.additional_tags).toEqual(['Zulu','Alpha'])
 await db.exec("reset role; update public.authors set name='Renamed' where name='First'; update public.tags set name='Revised Zulu' where name='Zulu';")
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}'`)
 const revised=(await documents()).find(story=>story.work_id===work)!
 expect(revised.metadata.authors).toEqual(['Renamed','Second']);expect(revised.metadata.additional_tags).toEqual(['Revised Zulu','Alpha'])
 expect((await query({within:'Renamed*cafe'})).total).toBe(1)
})
it('searches unsaved series installments and private saved corrections before paging mixed collections',async()=>{
 const saved=(await documents())[1]
 const preview={seriesId:999,title:'Series title',normalizedUrl:'https://archiveofourown.org/series/999',description:'Series description',creators:['Creator'],complete:false,works:[{workId:saved.work.ao3_work_id,url:`https://archiveofourown.org/works/${saved.work.ao3_work_id}`,position:1,title:'Old preview title',authors:['Preview author'],summary:'Old summary',tags:[],chapters:'6/9',wordCount:1000,complete:false},{workId:9999,url:'https://archiveofourown.org/works/9999',position:2,title:'Unsaved installment',authors:['Extra author'],summary:'Only unsaved text',tags:['Adventure'],chapters:'1/1',wordCount:500,complete:true}]}
 await db.query('select public.remember_library_series($1)',[JSON.stringify(preview)])
 await db.query('select public.remember_library_series($1)',[JSON.stringify({...preview,seriesId:1000,title:'Empty series',normalizedUrl:'https://archiveofourown.org/series/1000',works:[]})])
 await db.query('select public.update_library_series(1000,$1,$2)',[JSON.stringify({favorite:true}),JSON.stringify({favorite:false})])
 const rows=(await db.query<{record:never}>("select to_jsonb(r)||'{\"collectionIds\":[]}'::jsonb record from public.library_series r")).rows.map(r=>r.record)
 const series=librarySeries(await documents(),rows),pool=series.map(seriesSearchStory)
 for(const filters of [{query:'Unsaved'},{within:'unsaved',scope:'summary'},{rating:['Explicit']},{oneShot:'only'},{}]) {
  const expected=filterLibraryItems(pool,{...defaultReadingFilters,...filters} as typeof defaultReadingFilters,series)
  const result=await query(filters,1,25,'series')
  expect(result.stories.map(s=>s.id)).toEqual(expected.map(s=>s.id))
  const related=result.series.find(item=>item.seriesId===999)
  if(related) expect(related.works[0].title).toBe(saved.metadata.title)
 }
})
it('isolates private projections, catalog, series and details and disallows direct cache writes',async()=>{
 const ids=(await documents()).map(s=>s.id)
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${bob}'`)
 expect((await query()).total).toBe(1)
 expect((await query()).stories[0].metadata.title).toBe('Bobs secret')
 expect((await query()).stories[0].metadata.authors).not.toContain('Browser author')
 expect((await query({},1,25,'series')).total).toBe(0)
 expect((await db.query<{result:Story[]}>('select public.library_story_details($1) result',[ids])).rows[0].result).toEqual([])
 await expect(db.query('select public.refresh_library_documents($1)',[ids])).rejects.toThrow('permission denied')
 await expect(db.query('select public.flush_library_documents()')).rejects.toThrow('permission denied')
 await expect(db.exec('delete from public.library_search_documents')).rejects.toThrow('permission denied')
 await db.exec('reset role; set role anon')
 await expect(db.query('select public.query_library()')).rejects.toThrow('permission denied')
 await expect(db.query('select * from public.library_search_documents')).rejects.toThrow('permission denied')
 await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${alice}'`)
})
