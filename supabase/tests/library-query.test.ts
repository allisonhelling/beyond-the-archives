// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { defaultReadingFilters, filterReading, parseSearch, shuffleKey } from '../../src/features/library/reading-search'
import { librarySeries, seriesInformation } from '../../src/features/library/series/series'
import { filterLibraryItems, seriesSearchStory } from '../../src/features/library/series/series-search'
import type { Story } from '../../src/features/library/model'
import type { LibraryResults } from '../../src/features/library/repository'
let db: PGlite
const alice='10000000-0000-0000-0000-000000000001', bob='10000000-0000-0000-0000-000000000002'

it('caches facet aggregation by owner and scope until the existing library revision changes', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const scope=JSON.stringify({mode:'library',shelf:'all',filters:{showSeries:false}})
  for(let i=0;i<25;i++) await db.query('select public.library_query_facets($1)',[JSON.stringify({mode:'library',shelf:`missing-shelf-${i}`})])
  await db.exec('reset role')
  expect((await db.query<{n:number}>('select count(*)::integer n from public.library_query_cache where user_id=$1',[alice])).rows[0].n).toBeLessThanOrEqual(20)
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const first=(await db.query<{r:unknown}>('select public.library_query_facets($1) r',[scope])).rows[0].r
  await db.exec(`reset role;create or replace function public.library_uncached_facets(p_query jsonb default '{}') returns jsonb language plpgsql set search_path='' as $$begin raise exception 'Facet aggregation required';end;$$;set role authenticated;set request.jwt.claim.sub='${alice}'`)
  expect((await db.query<{r:unknown}>('select public.library_query_facets($1) r',[JSON.stringify({mode:'library',shelf:'all',filters:{sort:'alpha',query:'Ignored result filter'}})])).rows[0].r).toEqual(first)
  await db.exec(`savepoint other_cache;set request.jwt.claim.sub='${bob}'`)
  await expect(db.query('select public.library_query_facets($1)',[scope])).rejects.toThrow('Facet aggregation required')
  await db.exec(`rollback to savepoint other_cache;set request.jwt.claim.sub='${alice}';update public.library_entries set metadata_overrides='{"additional_tags":["Fresh Facet"]}' where id=(select id from public.library_entries limit 1)`)
  await expect(db.query('select public.library_query_facets($1)',[scope])).rejects.toThrow('Facet aggregation required')
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('loads cold work facets from compact documents without reading complete summaries or chapter maps', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const scope=JSON.stringify({mode:'library',shelf:'all',filters:{showSeries:false}})
  const first=(await db.query<{r:unknown}>('select public.library_query_facets($1) r',[scope])).rows[0].r
  await db.exec(`reset role;alter table public.library_search_documents alter column facet_story drop expression;alter table public.library_search_documents disable trigger all;
   update public.library_search_documents set story='null'::jsonb;delete from public.library_query_cache;
   set role authenticated;set request.jwt.claim.sub='${alice}'`)
  expect((await db.query<{r:unknown}>('select public.library_query_facets($1) r',[scope])).rows[0].r).toEqual(first)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})
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
it('marks cache-writing RPCs volatile so PostgREST allows cache writes', async () => {
 const functions = ['query_library', 'library_query_matches', 'library_navigation', 'library_navigation_snapshot', 'library_query_facets']
 const result = await db.query<{proname:string;provolatile:string}>("select proname,provolatile from pg_proc where pronamespace='public'::regnamespace and proname=any($1::text[]) order by proname", [functions])
 expect(result.rows).toEqual(functions.sort().map(proname => ({ proname, provolatile: 'v' })))
})
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
  const expected=filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,...filters} as typeof defaultReadingFilters,series)
  const result=await query(filters,1,25,'series')
  expect(result.stories.map(s=>s.id)).toEqual(expected.map(s=>s.id))
  const related=result.series.find(item=>item.seriesId===999)
  if(related) expect(related.works[0].title).toBe(saved.metadata.title)
 }
})
it('loads collections and series sorted by update date when a series has no update date',async()=>{
 await db.query('select public.remember_library_series($1)',[JSON.stringify({seriesId:1001,title:'Undated series',normalizedUrl:'https://archiveofourown.org/series/1001',basic:false,updated:'',works:[]})])
 await db.query('select public.update_library_series(1001,$1,$2)',[JSON.stringify({favorite:true}),JSON.stringify({favorite:false})])
 for (const shelf of ['series','favorites']) {
  expect((await query({sort:'updated',showSeries:true},1,25,shelf)).stories.some(s=>s.id==='series:1001')).toBe(true)
  expect((await query({sort:'updated',showSeries:true,updatedAfter:'2026-01-01'},1,25,shelf)).stories.some(s=>s.id==='series:1001')).toBe(false)
 }
})
it('returns basic saved series with one owned work',async()=>{
 const saved=(await documents())[2]
 const membership={id:2000,name:'Inferred series',url:'https://archiveofourown.org/series/2000',position:1}
 await db.query("update public.library_entries set metadata_overrides=metadata_overrides||jsonb_build_object('series_memberships',$2::jsonb) where id=$1",[saved.id,JSON.stringify([membership])])
 await db.query("select public.ensure_library_series(2000,'Inferred series')")
 for (const sort of ['added','added_reverse','alpha','alpha_reverse','updated','updated_reverse','ready','ready_reverse']) {
  const result=await query({sort},1,25,'series')
  const inferred=result.series.find(series=>series.seriesId===2000)
  expect(inferred).toMatchObject({title:'Inferred series',savedStories:[{id:saved.id}]})
  expect(result.stories.some(story=>story.id==='series:2000')).toBe(true)
 }
})
it('pauses and resumes a story without changing progress and matches paused series in the new shelf',async()=>{
 const saved=(await documents())[2]
 await db.query('select public.update_library_entry_checked($1,$2,$3)',[saved.id,JSON.stringify({status:'paused_reading'}),JSON.stringify({status:saved.reading_status,progress:saved.last_read_chapter})])
 const paused=(await documents()).find(story=>story.id===saved.id)!
 expect(paused).toMatchObject({reading_status:'paused_reading',last_read_chapter:saved.last_read_chapter})
 const dashboard=(await db.query<{result:LibraryResults}>('select public.query_library($1,1,25) result',[JSON.stringify({mode:'reading',shelf:'paused_reading',filters:defaultReadingFilters})])).rows[0].result
 expect(dashboard.sections.paused_reading).toBe(1)
 expect(dashboard.stories.map(story=>story.id)).toEqual([saved.id])
 const results=await query({showSeries:true},1,25,'paused_reading')
 expect(results.stories.map(story=>story.id)).toEqual(expect.arrayContaining([saved.id,'series:2000']))
 expect((await query({within:'"Paused Reading"'},1,25,'paused_reading')).stories.map(story=>story.id)).toContain(saved.id)
 expect((await query({},1,100,'currently_reading')).stories.map(story=>story.id)).not.toContain(saved.id)
 await db.query('select public.update_library_entry_checked($1,$2,$3)',[saved.id,JSON.stringify({status:saved.reading_status}),JSON.stringify({status:'paused_reading',progress:saved.last_read_chapter})])
 expect((await query({},1,25,'paused_reading')).stories).toEqual([])
 expect((await documents()).find(story=>story.id===saved.id)?.last_read_chapter).toBe(saved.last_read_chapter)
})
it('includes current work kudos, warnings and personal ratings in paginated series tiles',async()=>{
 const saved=(await documents())[0]
 const membership={id:3333,name:'Metadata series',url:'https://archiveofourown.org/series/3333',position:1}
 await db.query("update public.library_entries set personal_rating=3,metadata_overrides=metadata_overrides||jsonb_build_object('series_memberships',$2::jsonb,'kudos',2345,'archive_warnings',jsonb_build_array('Graphic Depictions Of Violence')) where id=$1",[saved.id,JSON.stringify([membership])])
 await db.query("select public.ensure_library_series(3333,'Metadata series')")
 const series=(await query({},1,100,'series')).series.find(series=>series.seriesId===3333)!
 expect(series.savedStories[0].personal_rating).toBe(3)
 expect(series.works[0]).toMatchObject({kudos:2345,archiveWarnings:['Graphic Depictions Of Violence']})
 expect(seriesInformation(series)).toMatchObject({kudos:2345,personalRating:3,warnings:['Graphic Depictions Of Violence']})
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

it('keeps seeded random ordering in parity with the browser across page boundaries',async()=>{
 const docs=await documents(), filters={...defaultReadingFilters,sort:'random' as const,randomSeed:'first shuffle'}
 const first=await query(filters)
 const remaining=await Promise.all(Array.from({length:first.pages-1},(_,i)=>query(filters,i+2)))
 const ids=[first,...remaining].flatMap(result=>result.stories.map(story=>story.id))
 expect(ids).toEqual(filterReading(docs,filters).map(story=>story.id))
 expect(new Set(ids).size).toBe(docs.length)
 expect((await query(filters)).stories.map(story=>story.id)).toEqual(first.stories.map(story=>story.id))
 expect((await query({...filters,randomSeed:'another shuffle'})).stories.map(story=>story.id)).not.toEqual(first.stories.map(story=>story.id))
 expect((await db.query<{key:string}>('select public.library_shuffle_key($1,$2)::text key',['series:42','Café 📚'])).rows[0].key).toBe(String(shuffleKey('series:42','Café 📚')))
})
it('matches personal notes, multi-select personal ratings and known Recs before pagination', async () => {
 const ids = (await documents()).slice(0, 3).map(story => story.id)
 await db.exec('reset role')
 await db.query("update public.library_entries set notes=E' \n\t ',personal_rating=null,source_bookmark='{}' where user_id=$1", [alice])
 for (const [index, id] of ids.entries()) await db.query('update public.library_entries set notes=$2,personal_rating=$3,source_bookmark=$4,is_rec=$5 where id=$1', [id, index === 2 ? '  ' : 'Personal thoughts', [1, 5, null][index], JSON.stringify({ id: `bookmark-${index}`, rec: [true, false, null][index] }), index === 0])
 await db.exec('set role authenticated')
 const docs = await documents()
 for (const patch of [{ personalNotes: true }, { recs: true }, { personalRating: ['1', '5'] }, { personalRating: ['unrated'] }, { personalNotes: true, personalRating: ['1'], recs: true }]) {
  const expected = filterReading(docs, { ...defaultReadingFilters, ...patch }).map(story => story.id)
  expect((await query(patch, 1, 100)).stories.map(story => story.id)).toEqual(expected)
 }
 expect((await query({}, 1, 100, 'recs')).stories.map(story => story.id)).toEqual([ids[0]])
 const catalog = (await db.query<{ result: { stories: Story[] } }>('select public.library_catalog() result')).rows[0].result
 expect(catalog.stories.find(story => story.id === ids[0])?.is_rec).toBe(true)
 const rules = { filters: { ...defaultReadingFilters, personalNotes: true, personalRating: ['1', '5'], recs: true }, terms: [] }
 const collection = (await db.query<{ id: string }>('insert into public.collections(name,automatic_rules) values($1,$2) returning id', ['Notes and Recs', JSON.stringify(rules)])).rows[0]
 expect((await query({}, 1, 100, collection.id)).stories.map(story => story.id)).toEqual([ids[0]])
 const records = (await db.query<{ record: never }>("select to_jsonb(r)||'{\"collectionIds\":[]}'::jsonb record from public.library_series r")).rows.map(row => row.record)
 const series = librarySeries(docs, records), pool = series.map(seriesSearchStory)
 for (const personalRating of [['1', '5'], ['unrated']]) expect((await query({ personalRating }, 1, 100, 'series')).stories.map(story => story.id)).toEqual(filterLibraryItems(pool, { ...defaultReadingFilters, showSeries: true, personalRating }, series).map(story => story.id))
}, 15000)

it('hides series by default in mixed shelves and includes them on request before pagination', async () => {
 const hidden = await query({}, 1, 100, 'favorites')
 expect(hidden.stories.every(story => !story.id.startsWith('series:'))).toBe(true)
 const shown = await query({ showSeries: true }, 1, 100, 'favorites')
 expect(shown.series.length).toBeGreaterThan(0)
 expect(shown.total).toBe(hidden.total + shown.series.length)
 expect((await query({}, 1, 100, 'series')).series.length).toBeGreaterThan(0)
 const all = await query({}, 1, 100), allShown = await query({ showSeries: true }, 1, 100)
 expect(allShown.total).toBe(all.total + allShown.series.length)
 expect(allShown.series.length).toBeGreaterThan(0)
})

it('skips series aggregation for hidden series on built-in and manual collections', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const first = (await documents())[0]
  await db.query("update public.library_entries set reading_status='finished' where id=$1", [first.id])
  const collection = (await db.query<{ id: string }>("insert into public.collections(name) values('Hidden series performance') returning id")).rows[0].id
  await db.query('insert into public.collection_works(collection_id,library_entry_id) values($1,$2)', [collection, first.id])
  const shelves = ['all', 'finished', 'favorites', collection]
  const expected = await Promise.all(shelves.map(shelf => query({}, 1, 25, shelf)))
  await db.exec('reset role')
  const fn = (await db.query<{ definition: string; source: string }>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_series_results(jsonb,boolean,boolean,boolean)'::regprocedure")).rows[0]
  // Failing immediately makes unnecessary series work observable without a timer.
  await db.exec(fn.definition.replace('LANGUAGE sql', 'LANGUAGE plpgsql').replace(fn.source, "begin raise exception 'Unexpected series aggregation'; end;"))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  for (const [index, shelf] of shelves.entries()) expect(await query({}, 1, 25, shelf)).toEqual(expected[index])
  // Explicit series views must still run the shared aggregation pipeline.
  await expect(query({ showSeries: true }, 1, 25, 'finished')).rejects.toThrow('Unexpected series aggregation')
 } finally {
  await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`)
 }
})

it('matches first-series-work filters in the browser, paginated queries and automatic collections', async () => {
 const docs = await documents(), ids = docs.slice(0, 5).map(story => story.id)
 const membership = (position: number | null, id = 4444) => ({ id, name: 'Installment filter', url: `https://archiveofourown.org/series/${id}`, position })
 const metadata = [{ series_memberships: [membership(1)] }, { series_memberships: [membership(2)] }, { series_memberships: [membership(null)] }, { series: ['Legacy names only'], series_memberships: [] }, { series_memberships: [membership(2), membership(1, 5555)] }]
 for (const [index, id] of ids.entries()) await db.query('update public.library_entries set metadata_overrides=$2 where id=$1', [id, JSON.stringify(metadata[index])])
 const current = await documents(), filters = { ...defaultReadingFilters, excludeLaterSeries: true }
 const expected = filterReading(current, filters).map(story => story.id)
 expect((await query(filters, 1, 100)).stories.map(story => story.id)).toEqual(expected)
 expect(expected).toEqual(expect.arrayContaining([ids[0], ids[4]]))
 for (const id of ids.slice(1, 4)) expect(expected).not.toContain(id)
 const collection = (await db.query<{ id: string }>('insert into public.collections(name,automatic_rules) values($1,$2) returning id', ['Series starts', JSON.stringify({ filters, terms: [] })])).rows[0]
 expect((await query({}, 1, 100, collection.id)).stories.map(story => story.id)).toEqual(expected)
})

it('matches personal tags in page queries, suggestions and automatic collections', async () => {
 const entry = (await documents())[0]
 const tag = (await db.query<{id:string}>("insert into public.personal_tags(name) values ('Café revisit') returning id")).rows[0].id
 await db.query('insert into public.library_entry_tags(library_entry_id,personal_tag_id) values ($1,$2)', [entry.id, tag])
 const filters = { ...defaultReadingFilters, personalTags: 'CAFE, revisit' }
 const result = await query(filters, 1, 100)
 expect(result.stories.map(story => story.id)).toEqual([entry.id])
 expect(result.suggestions?.personalTags).toContain('Café revisit')
 expect((await query({personalTags:'not a saved personal tag'})).total).toBe(0)
 const collection = (await db.query<{id:string}>('insert into public.collections(name,automatic_rules) values ($1,$2) returning id', ['Personal tag matches', JSON.stringify({filters,terms:[]})])).rows[0].id
 expect((await query({}, 1, 100, collection)).stories.map(story => story.id)).toEqual([entry.id])
 await db.query('delete from public.collections where id=$1', [collection])
 await db.query('delete from public.personal_tags where id=$1', [tag])
})

it('excludes waiting works from reading View All while preserving the library Currently Reading shelf', async () => {
 for (const status of ['reading', 're_reading', 'waiting_for_updates', 'to_read']) {
  const story = {...(await documents())[0], reading_status:status}
  const result = (await db.query<{reading:boolean; library:boolean; waiting:boolean}>("select public.library_in_shelf($1,'view_all','reading') reading, public.library_in_shelf($1,'currently_reading','library') library, public.library_in_shelf($1,'waiting','reading') waiting", [JSON.stringify(story)])).rows[0]
  expect(result.reading).toBe(['reading', 're_reading'].includes(status))
  expect(result.library).toBe(['reading', 're_reading', 'waiting_for_updates'].includes(status))
  expect(result.waiting).toBe(status === 'waiting_for_updates')
 }
})

it('scopes author pages before pagination and filters, using saved corrections and keeping accounts isolated', async () => {
 const name = 'A Writer / 雨 & Co'
 const rows = await documents()
 await db.exec('reset role')
 for (const [index, story] of rows.slice(0, 30).entries()) {
  await db.query("update public.library_entries set metadata_overrides=jsonb_build_object('authors', $2::jsonb, 'fandoms', jsonb_build_array('Author Fandom')), is_favorite=$3 where id=$1", [story.id, JSON.stringify(index === 0 ? [name, 'Coauthor'] : [name]), index === 0])
 }
 await db.query("update public.library_entries set metadata_overrides=jsonb_build_object('authors',jsonb_build_array($1::text)) where user_id=$2", [name, bob])
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}'`)
 const authorQuery = async (author: string, filters = {}, page = 1) => (await db.query<{ result: LibraryResults }>('select public.query_library($1,$2,25) result', [JSON.stringify({ mode: 'library', shelf: 'all', author, filters: { ...defaultReadingFilters, ...filters } }), page])).rows[0].result
 const first = await authorQuery(name), second = await authorQuery(name, {}, 2)
 expect(first).toMatchObject({ total: 30, pages: 2, page: 1, series: [] })
 expect(first.stories).toHaveLength(25)
 expect(second.stories).toHaveLength(5)
 expect(new Set([...first.stories, ...second.stories].map(story => story.id)).size).toBe(30)
 expect(first.fandoms).toEqual([{ name: 'Author Fandom', count: 30 }])
 expect(first.stories.every(story => story.metadata.authors.includes(name))).toBe(true)
 expect(await authorQuery('Coauthor')).toMatchObject({ total: 1 })
 expect(await authorQuery(name, { favorites: true })).toMatchObject({ total: 1 })
 expect(await authorQuery('A Writer')).toMatchObject({ total: 0, stories: [], fandoms: [] })
 expect(await authorQuery(name, { showSeries: true })).toMatchObject({ total: 30, series: [] })
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect(await authorQuery(name)).toMatchObject({ total: 1 })
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
 // Author pages appear and disappear with saved fic metadata; no extra record is needed.
 await db.query("select public.save_library_story_checked(null, 'https://archiveofourown.org/works/987654321', $1::jsonb, '{}'::jsonb)", [JSON.stringify({ metadata: { title: 'New Author Work', authors: ['New Author'] }, status: 'to_read', progress: 0, notes: '', rating: null, favorite: false, tags: [], collections: [] })])
 const added = await authorQuery('New Author')
 expect(added).toMatchObject({ total: 1 })
 await db.query('delete from public.library_entries where id=$1', [added.stories[0].id])
 expect(await authorQuery('New Author')).toMatchObject({ total: 0 })
})

it('separates collection facets from page filters and scopes ordinary collection candidates by membership',async()=>{
 const docs=await documents(), ids=docs.slice(0,2).map(story=>story.id)
 const collection=(await db.query<{id:string}>("insert into public.collections(name) values ('Scoped query performance') returning id")).rows[0].id
 await db.query('insert into public.collection_works(collection_id,library_entry_id) select $1,unnest($2::uuid[])',[collection,ids])
 const scope={mode:'library',shelf:collection,filters:{...defaultReadingFilters},terms:[]}
 const legacy=(await db.query<{result:LibraryResults}>('select public.query_library($1,1,25) result',[JSON.stringify(scope)])).rows[0].result
 const page=(await db.query<{result:LibraryResults}>('select public.query_library($1,1,25) result',[JSON.stringify({...scope,includeFacets:false})])).rows[0].result
 expect(page.total).toBe(2)
 expect(page.stories.map(story=>story.id).sort()).toEqual(ids.sort())
 expect(page).not.toHaveProperty('suggestions')
 expect(page).not.toHaveProperty('fandoms')
 const facets=(await db.query<{result:Record<string,unknown>}>('select public.library_query_facets($1) result',[JSON.stringify({...scope,filters:{sort:'alpha',query:'No matches'}})])).rows[0].result
 expect(facets).toEqual({suggestions:legacy.suggestions,fandoms:legacy.fandoms,total:2})
 const navigation=(await db.query<{result:Record<string,{works:number;series:number}>}>('select public.library_navigation() result')).rows[0].result
 expect(navigation[collection]).toMatchObject({works:2,series:0})
 expect(navigation.all.works).toBe(docs.length)
 for(const shelf of ['all','series','finished','to_read','currently_reading','paused_reading','favorites','recs','did_not_finish']) {
  const result=(await db.query<{result:{total:number}}>('select public.query_library($1,1,25) result',[JSON.stringify({mode:'library',shelf,includeFacets:false,filters:{showSeries:true}})])).rows[0].result
  expect(navigation[shelf].works+navigation[shelf].series).toBe(result.total)
 }
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect((await db.query<{result:{total:number}}>('select public.library_query_facets($1) result',[JSON.stringify(scope)])).rows[0].result.total).toBe(0)
 expect((await db.query<{result:Record<string,unknown>}>('select public.library_navigation() result')).rows[0].result).not.toHaveProperty(collection)
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
})

it('counts compact series with the same shelf fields without building preview metadata', async () => {
 const stories = JSON.stringify(await documents())
 const fields = ['id', 'reading_status', 'is_favorite', 'is_rec', 'collectionIds', 'updated_at']
 const full = (await db.query<{ story: Record<string, unknown> }>('select story from public.library_series_results($1)', [stories])).rows
 const compact = (await db.query<{ story: Record<string, unknown>; payload: null }>('select * from public.library_series_results($1,true)', [stories])).rows
 expect(compact.length).toBeGreaterThan(0)
 expect(compact.map(row => row.story).sort((a,b) => String(a.id).localeCompare(String(b.id)))).toEqual(
  full.map(({story}) => Object.fromEntries(fields.map(key => [key, story[key]]))).sort((a,b) => String(a.id).localeCompare(String(b.id))))
 expect(compact.every(row => row.payload === null)).toBe(true)
 await db.exec('reset role')
 const fn = (await db.query<{ definition: string; source: string }>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_unique_values(jsonb)'::regprocedure")).rows[0]
 try {
  // Turn preview aggregation into a deterministic failure instead of timing it.
  await db.exec(fn.definition.replace('LANGUAGE sql', 'LANGUAGE plpgsql').replace(fn.source, "begin raise exception 'Unexpected preview aggregation'; end;"))
  await db.exec('set role authenticated')
  expect((await db.query('select * from public.library_series_results($1,true)', [stories])).rows).toHaveLength(compact.length)
  expect((await db.query<{ result: Record<string, unknown> }>('select public.library_navigation() result')).rows[0].result).toHaveProperty('all')
  await expect(db.query('select * from public.library_series_results($1)', [stories])).rejects.toThrow('Unexpected preview aggregation')
 } finally {
  await db.exec('reset role'); await db.exec(fn.definition); await db.exec('set role authenticated')
 }
})

it('only carries the requested search scope through the shared pool', async () => {
 const scope={mode:'library',shelf:'all',filters:{scope:'any'}}
 const pool=async (query:unknown) => (await db.query<{search_any:string|null;search_summary:string|null;search_notes:string|null}>(
  'select search_any,search_summary,search_notes from public.library_query_pool($1)',[JSON.stringify(query)])).rows
 const unsearched=await pool(scope)
 expect(unsearched.length).toBeGreaterThan(0)
 expect(unsearched.every(row=>Object.values(row).every(value=>value===null))).toBe(true)
 for(const searchScope of ['any','summary','notes']) {
  const searched=await pool({...scope,filters:{scope:searchScope},terms:parseSearch('private')})
  expect(searched.length).toBe(unsearched.length)
  for(const row of searched) for(const [field,value] of Object.entries(row)) {
   if(field===`search_${searchScope}`) expect(typeof value).toBe('string')
   else expect(value).toBeNull()
  }
 }
})

it('counts overlapping and empty manual collections without losing membership timestamps',async()=>{
 const docs=(await documents()).slice(0,2)
 const collections=(await db.query<{id:string;name:string}>("insert into public.collections(name) values ('Count overlap A'),('Count overlap B'),('Count empty') returning id,name")).rows
 for(const collection of collections.filter(c=>c.name!=='Count empty')) {
  await db.query('insert into public.collection_works(collection_id,library_entry_id) select $1,unnest($2::uuid[])',[collection.id,docs.map(s=>s.id)])
 }
 const navigation=(await db.query<{result:Record<string,{works:number;series:number;updated_at:string|null}>}>('select public.library_navigation() result')).rows[0].result
 const updated=(await documents()).filter(s=>docs.some(d=>d.id===s.id)).map(s=>s.updated_at).sort().at(-1)!
 for(const collection of collections) {
  const empty=collection.name==='Count empty'
  expect(navigation[collection.id]).toMatchObject({works:empty?0:2,series:0})
  if(empty) expect(navigation[collection.id].updated_at).toBeNull()
  else expect(Date.parse(navigation[collection.id].updated_at!)).toBe(Date.parse(updated))
 }
 await db.query('delete from public.collections where id=any($1::uuid[])',[collections.map(c=>c.id)])
})

it('uses indexed identities for ordinary browsing without invoking the JSON filter or full pool', async () => {
 await db.exec('reset role;begin')
 try {
  for (const signature of ['public.library_filter(jsonb,jsonb,jsonb,text)', 'public.library_query_pool(jsonb,boolean)']) {
   const fn = (await db.query<{definition:string;source:string}>('select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid=$1::regprocedure', [signature])).rows[0]
   await db.exec(fn.definition.replace(fn.source, "begin raise exception 'Unexpected full-document scan'; end;"))
  }
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const scope = { mode: 'library', shelf: 'all', includeFacets: false, filters: { ...defaultReadingFilters, randomSeed: 'indexed-regression' } }
  const first = (await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r', [JSON.stringify(scope)])).rows[0].r
  const last = (await db.query<{r:LibraryResults}>('select public.query_library($1,999,25) r', [JSON.stringify(scope)])).rows[0].r
  expect(first.total).toBe((await documents()).length)
  expect(first.stories).toHaveLength(Math.min(25,first.total))
  expect(last.page).toBe(last.pages)
  expect(first.stories.every(story => typeof story.metadata.summary === 'string')).toBe(true)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('reuses exact totals and combined navigation counts across pages, then invalidates them after worker edits', async () => {
 await db.exec('reset role;begin')
 try {
  const fn = (await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_query_work_sql(jsonb,boolean,boolean)'::regprocedure")).rows[0]
  const nav = (await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_navigation_counts()'::regprocedure")).rows[0]
  await db.exec(`create sequence public.match_scans;create sequence public.navigation_scans;
   grant usage,select on sequence public.match_scans,public.navigation_scans to authenticated;`)
  await db.exec(fn.definition.replace(fn.source, fn.source.replace(/\bbegin\b/i,"begin perform nextval('public.match_scans');")))
  await db.exec(nav.definition.replace('LANGUAGE sql','LANGUAGE plpgsql').replace(nav.source,"begin perform nextval('public.navigation_scans'); return ("+nav.source.trim().replace(/;$/,'')+'); end;'))
  await db.query('select public.invalidate_library_queries($1)',[alice])
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const scope = {mode:'reading',shelf:'view_all',includeFacets:false,filters:defaultReadingFilters}
  const first=(await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r',[JSON.stringify(scope)])).rows[0].r
  const second=(await db.query<{r:LibraryResults}>('select public.query_library($1,2,50) r',[JSON.stringify(scope)])).rows[0].r
  expect(second.total).toBe(first.total)
  expect(second.sections).toEqual(first.sections)
  await db.query('select public.library_navigation()')
  await db.query('select public.library_navigation()')
  expect((await db.query<{n:number}>('select last_value::integer n from public.match_scans')).rows[0].n).toBe(1)
  expect((await db.query<{n:number}>('select last_value::integer n from public.navigation_scans')).rows[0].n).toBe(1)
  const removed=first.stories[0].id
  // A worker does not have the reader's JWT; owner invalidation comes from the row.
  await db.exec('reset role;reset request.jwt.claim.sub')
  await db.query('delete from public.library_entries where id=$1',[removed])
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const refreshed=(await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r',[JSON.stringify(scope)])).rows[0].r
  expect(refreshed.total).toBe(first.total-1)
  expect(refreshed.stories.map(story=>story.id)).not.toContain(removed)
  await db.query('select public.library_navigation()')
  expect((await db.query<{n:number}>('select last_value::integer n from public.match_scans')).rows[0].n).toBe(2)
  expect((await db.query<{n:number}>('select last_value::integer n from public.navigation_scans')).rows[0].n).toBe(2)
  for(let index=0;index<24;index++)await db.query('select public.query_library($1,1,25)',[JSON.stringify({...scope,filters:{...defaultReadingFilters,query:`Cache limit ${index}`}})])
  await db.exec('reset role')
  expect((await db.query<{n:number}>('select count(*)::integer n from public.library_query_cache where user_id=$1',[alice])).rows[0].n).toBeLessThanOrEqual(20)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('cascades private derived memberships and query caches when an account is deleted', async () => {
 await db.exec('reset role;begin')
 try {
  const owner='10000000-0000-0000-0000-000000000099'
  await db.query('insert into auth.users values($1)',[owner])
  await db.query("insert into public.library_entries(user_id,work_id,original_url) select $1,id,'https://archiveofourown.org/works/'||ao3_work_id from public.works limit 1",[owner])
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`)
  await db.query('insert into public.collections(name,automatic_rules) values($1,$2)',['All Automatic',JSON.stringify({filters:defaultReadingFilters,terms:[]})])
  await db.query('select public.query_library($1,1,25)',[JSON.stringify({mode:'library',shelf:'all',includeFacets:false,filters:defaultReadingFilters})])
  await db.query('select public.library_navigation()')
  expect((await db.query('select * from public.automatic_collection_works')).rows).toHaveLength(1)
  await db.exec(`set request.jwt.claim.sub='${bob}'`)
  expect((await db.query('select * from public.automatic_collection_works where user_id=$1',[owner])).rows).toEqual([])
  await db.exec('savepoint private_cache')
  await expect(db.query('select * from public.library_query_cache')).rejects.toThrow('permission denied')
  await db.exec('rollback to savepoint private_cache;reset role')
  await db.query('select public.store_tag_resolutions($1,$2)',[owner,JSON.stringify([{category:'character',name:'Canonical',status:'canonical',canonical_name:'Canonical'}])])
  await db.query('delete from auth.users where id=$1',[owner])
  for(const table of ['library_query_state','library_query_cache','automatic_collection_works'])expect((await db.query(`select * from public.${table} where user_id=$1`,[owner])).rows).toEqual([])
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})


it('reuses matching IDs and exact totals when only sorting changes', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const scope={mode:'library',shelf:'all',includeFacets:false,filters:{...defaultReadingFilters,within:'Private',scope:'notes'},terms:parseSearch('Private')}
  const first=(await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r',[JSON.stringify(scope)])).rows[0].r
  await db.exec('reset role')
  const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_filter(jsonb,jsonb,jsonb,text)'::regprocedure")).rows[0]
  await db.exec(fn.definition.replace(fn.source,"begin raise exception 'Repeated matching for sorting'; end;"))
  await db.exec('set role authenticated')
  const sorted=(await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r',[JSON.stringify({...scope,filters:{...scope.filters,sort:'alpha'}})])).rows[0].r
  expect(sorted.total).toBe(first.total)
  expect(sorted.revision).toBe(first.revision)
  expect(sorted.stories.map(story=>story.id)).toEqual(filterReading(await documents(),{...defaultReadingFilters,within:'Private',scope:'notes',sort:'alpha'}).slice(0,25).map(story=>story.id))
 } finally {await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`)}
})

it('uses the shared shelf semantics for every status, including re-reads on Finished', async () => {
 await db.exec('reset role;begin')
 try {
  const docs=await documents()
  const statuses=['to_read','reading','re_reading','waiting_for_updates','paused_reading','finished','did_not_finish']
  for(const [index,status] of statuses.entries())await db.query('update public.library_entries set reading_status=$2::public.reading_status where id=$1',[docs[index].id,status])
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  for(const shelf of ['all','currently_reading','to_read','paused_reading','finished','did_not_finish','favorites','recs']) {
   const expected=(await db.query<{id:string}>("select id from public.library_search_documents where user_id=auth.uid() and public.library_in_shelf(story,$1,'library')",[shelf])).rows.map(row=>row.id)
   const result=(await db.query<{r:LibraryResults}>('select public.query_library($1,1,250) r',[JSON.stringify({mode:'library',shelf,includeFacets:false,filters:defaultReadingFilters})])).rows[0].r
   expect(result.stories.map(story=>story.id).sort()).toEqual(expected.sort())
  }
 } finally {await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`)}
})

it('retries a page if a newer revision appears between identity selection and document loading', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const scope={mode:'library',shelf:'all',includeFacets:false,filters:defaultReadingFilters}
  const before=(await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r',[JSON.stringify(scope)])).rows[0].r
  await db.exec('reset role')
  const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.automatic_collection_ids(jsonb,uuid)'::regprocedure")).rows[0]
  await db.exec('create sequence public.page_mutation;grant usage,select on sequence public.page_mutation to authenticated')
  await db.exec(fn.definition.replace(' STABLE',' VOLATILE').replace(fn.source,fn.source.replace(/\bbegin\b/i,"begin if not (select is_called from public.page_mutation) then perform nextval('public.page_mutation'); delete from public.library_entries where id=(s->>'id')::uuid; end if;")))
  await db.exec('set role authenticated')
  const after=(await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r',[JSON.stringify(scope)])).rows[0].r
  expect(after.total).toBe(before.total-1)
  expect(after.stories.map(story=>story.id)).not.toContain(before.stories[0].id)
  expect(after.revision).toBe((await db.query<{r:number}>('select public.library_revision() r')).rows[0].r)
 } finally {await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`)}
})

it('does not build series search text for facets or In a Series Only without a text search', async () => {
 await db.exec('reset role;begin')
 try {
  const fn = (await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_search_text(jsonb,text)'::regprocedure")).rows[0]
  await db.exec(fn.definition.replace('LANGUAGE sql','LANGUAGE plpgsql').replace(fn.source,"begin raise exception 'Unexpected search text construction'; end;"))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  for (const shelf of ['all', 'series']) {
   const scope = {mode:'library',shelf,filters:{showSeries:true,inSeries:true},includeFacets:false}
   expect((await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r',[JSON.stringify(scope)])).rows[0].r.total).toBeGreaterThan(0)
   expect((await db.query<{r:{total:number}}>('select public.library_query_facets($1) r',[JSON.stringify(scope)])).rows[0].r.total).toBeGreaterThan(0)
  }
  await expect(query({showSeries:true,inSeries:true,within:'force a fresh text search'})).rejects.toThrow('Unexpected search text construction')
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('aggregates merged series metadata once per series while preserving compact navigation', async () => {
 const stories = JSON.stringify(await documents())
 await db.exec('reset role;begin')
 try {
  const fn = (await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_unique_values(jsonb)'::regprocedure")).rows[0]
  await db.exec('create sequence public.series_aggregations;grant usage,select on sequence public.series_aggregations to authenticated')
  await db.exec(fn.definition.replace('LANGUAGE sql','LANGUAGE plpgsql').replace(fn.source,"begin perform nextval('public.series_aggregations'); return ("+fn.source.trim().replace(/;$/,'')+'); end;'))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const full = (await db.query('select * from public.library_series_results($1)',[stories])).rows
  expect(full.length).toBeGreaterThan(0)
  expect((await db.query<{n:number}>('select last_value::integer n from public.series_aggregations')).rows[0].n).toBe(full.length * 7)
  await db.exec("reset role;select setval('public.series_aggregations',1,false);set role authenticated")
  const compact = (await db.query('select * from public.library_series_results($1,true)',[stories])).rows
  expect(compact).toHaveLength(full.length)
  expect((await db.query<{is_called:boolean}>('select is_called from public.series_aggregations')).rows[0].is_called).toBe(false)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('builds the series pool once per page for cold loads, paging and sorting', async () => {
 await db.exec('reset role;begin')
 try {
  const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_query_pool(jsonb,boolean)'::regprocedure")).rows[0]
  await db.exec('create sequence public.series_pool_reads;grant usage,select on sequence public.series_pool_reads to authenticated')
  await db.exec(fn.definition.replace(fn.source,fn.source.replace(/\bbegin\b/i,"begin perform nextval('public.series_pool_reads');")))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  let calls=0
  for(const [shelf,filters,page] of [
   ['series',{},1],['series',{},999],['series',{sort:'alpha'},1],
   ['all',{showSeries:true,inSeries:true},1],['all',{showSeries:true},1],
  ] as const) {
   const result=(await db.query<{r:LibraryResults}>('select public.query_library($1,$2,25) r',[JSON.stringify({mode:'library',shelf,includeFacets:false,filters:{...defaultReadingFilters,...filters}}),page])).rows[0].r
   expect(result.total).toBeGreaterThan(0)
   expect(result.stories.length).toBeGreaterThan(0)
   expect(result.page).toBeLessThanOrEqual(result.pages)
   expect((await db.query<{n:number}>('select last_value::integer n from public.series_pool_reads')).rows[0].n).toBe(++calls)
  }
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('keeps stored series inputs current after effective work and reading edits', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const saved=(await documents())[0]
  const compact=async()=> (await db.query<{s:Story}>('select series_story s from public.library_search_documents where id=$1',[saved.id])).rows[0].s
  expect(await compact()).toMatchObject({id:saved.id,metadata:{title:saved.metadata.title},work:{ao3_work_id:saved.work.ao3_work_id}})
  await db.query("update public.library_entries set notes='Changed reading note',last_read_chapter=2,metadata_overrides=metadata_overrides||$2::jsonb where id=$1",[saved.id,JSON.stringify({title:'Corrected series work',summary:'Current summary',summary_html:'<p>Current summary</p>'})])
  expect(await compact()).toMatchObject({notes:'Changed reading note',last_read_chapter:2,metadata:{title:'Corrected series work',summary:'Current summary'}})
  expect((await compact()).metadata).not.toHaveProperty('summary_html')
  expect(await compact()).not.toHaveProperty('extension_metadata')
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`)
  expect((await db.query('select series_story from public.library_search_documents where id=$1',[saved.id])).rows).toEqual([])
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('loads series cards and suggestions without reading full work documents', async () => {
 await db.exec('reset role;begin')
 try {
  // A trigger-maintained plain column lets this transaction invalidate the large
  // source documents without changing the stored series projection under test.
  await db.exec('alter table public.library_search_documents alter column series_story drop expression, alter column catalog_story drop expression')
  await db.exec('alter table public.library_search_documents disable trigger all')
  await db.exec(`update public.library_search_documents set story='null'::jsonb`)
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const q=JSON.stringify({mode:'library',shelf:'series',includeFacets:false,filters:defaultReadingFilters})
  const page=(await db.query<{r:LibraryResults}>('select public.query_library($1,1,25) r',[q])).rows[0].r
  const facets=(await db.query<{r:{total:number}}>('select public.library_query_facets($1) r',[q])).rows[0].r
  expect(page.total).toBeGreaterThan(0)
  expect(page.series.length).toBeGreaterThan(0)
  expect(facets.total).toBe(page.total)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})


it('keeps compact series card payloads equal to the existing page contract', async () => {
 const inputs=JSON.stringify((await db.query<{s:unknown}>('select series_story s from public.library_search_documents where user_id=auth.uid()')).rows.map(row=>row.s))
 const rows=(await db.query<{full:Record<string,unknown>;compact:Record<string,unknown>}>(`
  with full_results as materialized (select * from public.library_series_results($1,false,false,true)),
  compact_results as materialized (select * from public.library_series_results($1,false,true,true))
  select f.payload||jsonb_build_object('record',nullif(f.payload->'record','null'::jsonb)-'metadata','savedStories',public.library_series_saved_stories(f.payload->'savedStories')) full,c.payload compact
  from full_results f join compact_results c on c.story->>'id'=f.story->>'id'`,[inputs])).rows
 expect(rows.length).toBeGreaterThan(0)
 for(const row of rows) expect(row.compact).toEqual(row.full)
})

it('builds series suggestions without constructing any card payload', async () => {
 await db.exec('reset role;begin')
 await db.query("delete from public.library_query_cache where user_id=$1 and key='series-pool'",[alice])
 try {
  const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_series_saved_stories(jsonb)'::regprocedure")).rows[0]
  await db.exec(fn.definition.replace('LANGUAGE sql','LANGUAGE plpgsql').replace(fn.source,"begin raise exception 'Unexpected series card payload'; end;"))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const scope=JSON.stringify({mode:'library',shelf:'series',includeFacets:false,filters:defaultReadingFilters})
  expect((await db.query<{r:{total:number}}>('select public.library_query_facets($1) r',[scope])).rows[0].r.total).toBeGreaterThan(0)
  await expect(db.query('select public.query_library($1,1,25)',[scope])).rejects.toThrow('Unexpected series card payload')
 } finally {await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`)}
})


it('reuses one owner-scoped series pool across filters and invalidates it after source edits',async()=>{
 await db.exec('reset role;begin')
 try {
  const saved=(await db.query<{id:string}>('select id from public.library_search_documents where user_id=$1 limit 1',[alice])).rows[0]
  await db.query("update public.library_entries set metadata_overrides=jsonb_set(metadata_overrides,'{series_memberships}',$2::jsonb) where id=$1",[saved.id,JSON.stringify([{id:880099,name:'Cached series',url:'https://archiveofourown.org/series/880099',position:1}])])
  await db.query("select public.ensure_library_series(880099,'Cached series')")
  await db.query("delete from public.library_query_cache where key='series-pool' and user_id=$1",[alice])
  const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_series_results(jsonb,boolean,boolean,boolean)'::regprocedure")).rows[0]
  await db.exec('create sequence public.series_cache_builds;grant usage,select on sequence public.series_cache_builds to authenticated')
  await db.exec(fn.definition.replace('LANGUAGE sql','LANGUAGE plpgsql').replace(fn.source,()=>"begin perform nextval('public.series_cache_builds'); return query "+fn.source.trim().replace(/;$/,'')+"; end;"))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const first=await query({},1,25,'series')
  expect(first.total).toBeGreaterThan(0)
  await query({sort:'alpha'},1,25,'series')
  await query({within:'unmatched series text'},1,25,'series')
  await query({showSeries:true,inSeries:true},1,25,'all')
  await db.query('select public.library_query_facets($1)',[JSON.stringify({mode:'library',shelf:'series'})])
  expect((await db.query<{n:number}>('select last_value::integer n from public.series_cache_builds')).rows[0].n).toBe(1)
  await db.query("update public.library_entries set notes='Changed cached series note' where id=$1",[saved.id])
  const changed=await query({},1,25,'series')
  expect(changed.stories.some(story=>story.notes.includes('Changed cached series note'))).toBe(true)
  expect((await db.query<{n:number}>('select last_value::integer n from public.series_cache_builds')).rows[0].n).toBe(2)
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`)
  const other=await query({},1,25,'series')
  expect(other.stories.some(story=>story.notes.includes('Changed cached series note'))).toBe(false)
  await expect(db.query('select * from public.library_query_cache')).rejects.toThrow('permission denied')
 } finally {await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`)}
})


it('loads catalog and navigation from compact documents while retaining exact responses and ownership', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const snapshot = async () => {
   await db.exec('reset role;update public.library_query_state set navigation_revision=-1 where user_id=auth.uid();set role authenticated')
   const result = (await db.query<{ catalog: {stories:Story[]}; navigation: unknown }>('select public.library_catalog() catalog,public.library_navigation_snapshot() navigation')).rows[0]
   result.catalog.stories.sort((a,b)=>a.id.localeCompare(b.id))
   return result
  }
  const before = await snapshot()
  await db.exec('reset role;alter table public.library_search_documents alter column catalog_story drop expression;alter table public.library_search_documents disable trigger all')
  // Full source documents remain unavailable throughout both reads. Neither RPC
  // may reconstruct metadata or access the general work browsing pool.
  await db.exec("update public.library_search_documents set story='null'::jsonb")
  const pool = (await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_query_pool(jsonb,boolean)'::regprocedure")).rows[0]
  await db.exec(pool.definition.replace(pool.source,"begin raise exception 'Unexpected full document pool'; end;"))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  expect(await snapshot()).toEqual(before)
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`)
  const other = await snapshot() as { catalog: { stories: Story[] }; navigation: unknown }
  expect(other.catalog.stories.every(story => story.id !== (before.catalog as {stories: Story[]}).stories[0].id)).toBe(true)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('refreshes compact catalog fields and automatic memberships after personal and metadata edits', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const saved = (await documents())[0]
  await db.query("update public.library_entries set reading_status='re_reading',is_favorite=true,last_read_chapter=2,metadata_overrides=metadata_overrides||$2::jsonb where id=$1",[saved.id,JSON.stringify({title:'Compact edited title',fandoms:['Compact Fandom']})])
  const automatic = (await db.query<{id:string}>(`insert into public.collections(name,automatic_rules) values ('Compact Automatic','{"filters":{"fandoms":["Compact Fandom"]},"terms":[]}'::jsonb) returning id`)).rows[0].id
  const catalog = (await db.query<{r:{stories:Story[]}}>('select public.library_catalog() r')).rows[0].r
  const compact = catalog.stories.find(story => story.id === saved.id)!
  expect(compact).toMatchObject({reading_status:'re_reading',is_favorite:true,last_read_chapter:2,metadata:{title:'Compact edited title',fandoms:['Compact Fandom']}})
  expect(compact.metadata).not.toHaveProperty('summary')
  expect(compact).not.toHaveProperty('reading_history')
  expect(compact.automaticCollectionIds).toContain(automatic)
  await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"fandoms\":[\"Other Fandom\"]}'::jsonb where id=$1",[saved.id])
  const changed = (await db.query<{r:{stories:Story[]}}>('select public.library_catalog() r')).rows[0].r.stories.find(story=>story.id===saved.id)!
  expect(changed.automaticCollectionIds).not.toContain(automatic)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})


it('excludes chapter-date maps from stored series inputs while preserving full works and merged results', async () => {
 await db.exec('reset role;begin')
 try {
  const definition=(await db.query<{definition:string}>("select pg_get_functiondef('public.library_series_input(jsonb)'::regprocedure) definition")).rows[0].definition
  await db.exec(definition.replace("-'chapter_dates'",''))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const saved=(await documents())[0]
  await db.query("update public.library_entries set metadata_overrides=metadata_overrides||$2::jsonb where id=$1",[saved.id,JSON.stringify({series_memberships:[{id:999,name:'Series title',url:'https://archiveofourown.org/series/999',position:1}]})])
  await db.exec('reset role')
  await db.query("update public.library_entries set extension_metadata=extension_metadata||jsonb_build_object('chapter_dates',(select jsonb_object_agg(n::text,'2026-10-01') from generate_series(1,300) n)) where id=$1",[saved.id])
  await db.exec('set role authenticated')
  const full=(await documents()).find(story=>story.id===saved.id)!
  expect((full.metadata as unknown as {chapter_dates:object}).chapter_dates).toHaveProperty('300','2026-10-01')
  expect((await db.query<{s:Story}>('select series_story s from public.library_search_documents where id=$1',[saved.id])).rows[0].s.metadata).toHaveProperty('chapter_dates')
  await db.exec('reset role')
  const migration=await readFile(new URL('../migrations/20261028000800_trim_series_chapter_dates.sql',import.meta.url),'utf8')
  await db.exec(migration.replace(/^begin;/,'').replace(/commit;\s*$/,''))
  await db.exec('set role authenticated')
  const compact=(await db.query<{s:Story}>('select series_story s from public.library_search_documents where id=$1',[saved.id])).rows[0].s
  expect(compact.metadata).not.toHaveProperty('chapter_dates')
  expect((await documents()).find(story=>story.id===saved.id)).toEqual(full)
  const allInputs=(await db.query<{s:Story}>('select series_story s from public.library_search_documents where user_id=auth.uid() order by id')).rows.map(row=>row.s)
  const merge=async(inputs:Story[])=>(await db.query<{story:Story}>("select story,payload from public.library_series_results($1,false,true,true) order by story->>'id'",[JSON.stringify(inputs)])).rows
  expect(await merge(allInputs)).toEqual(await merge(await documents()))
  // Backfilling an existing document must regenerate the stored projection too.
  await db.exec('reset role')
  await db.query('update public.library_search_documents set story=story where id=$1',[saved.id])
  expect((await db.query<{s:Story}>('select series_story s from public.library_search_documents where id=$1',[saved.id])).rows[0].s.metadata).not.toHaveProperty('chapter_dates')
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('requires two distinct owned works for inferred series across pages, facets and navigation', async () => {
 await db.exec('reset role;begin')
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const saved=(await documents()).slice(0,2)
  const membership={id:991122,name:'Two Work Inference',url:'https://archiveofourown.org/series/991122',position:1}
  const assign=async(id:string)=>db.query("update public.library_entries set metadata_overrides=metadata_overrides||jsonb_build_object('series_memberships',$2::jsonb) where id=$1",[id,JSON.stringify([membership,membership])])
  await assign(saved[0].id)
  const scope=JSON.stringify({mode:'library',shelf:'series',filters:{query:'Two Work Inference'}})
  const facets=async()=>(await db.query<{r:{total:number}}>('select public.library_query_facets($1) r',[scope])).rows[0].r.total
  const contains=async()=>(await query({},1,100,'series')).series.some(series=>series.seriesId===membership.id)
  expect(await contains()).toBe(false)
  const beforeFacets=await facets()
  const navigation=async()=>(await db.query<{r:Record<string,{series:number}>}>('select public.library_navigation() r')).rows[0].r.series.series
  const before=await navigation()
  await assign(saved[1].id)
  expect(await contains()).toBe(true)
  expect((await query({},1,100,'series')).series.find(series=>series.seriesId===membership.id)).toMatchObject({record:null,savedStories:[expect.anything(),expect.anything()]})
  expect(await facets()).toBe(beforeFacets+1)
  expect(await navigation()).toBe(before+1)
  await db.query("update public.library_entries set metadata_overrides=metadata_overrides-'series_memberships' where id=$1",[saved[1].id])
  expect(await contains()).toBe(false)
  expect(await facets()).toBe(beforeFacets)
  expect(await navigation()).toBe(before)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('matches crossover and word-count filters in work and series queries, including cached sorts', async () => {
 await db.exec('reset role;begin')
 try {
  const ids=(await documents()).slice(0,3).map(story=>story.id)
  for (const [index,id] of ids.entries()) await db.query('update public.library_entries set metadata_overrides=metadata_overrides||$2::jsonb where id=$1',[id,JSON.stringify({fandoms:index===0?['One','Two']:['One'],word_count:index===2?null:100*(index+1)})])
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  for (const crossovers of ['allowed','only','exclude'] as const) for (const sort of ['words','words_reverse'] as const) {
   const filters={...defaultReadingFilters,crossovers,sort}
   const expected=filterReading(await documents(),filters)
   const result=await query(filters)
   expect(result.total).toBe(expected.length)
   expect(result.stories.map(story=>story.id)).toEqual(expected.slice(0,25).map(story=>story.id))
   const series=await query(filters,1,25,'series')
   for(const story of series.stories) expect(story.id).toMatch(/^series:/)
  }
  await db.query('insert into public.collections(name,automatic_rules) values($1,$2)',['Crossovers',JSON.stringify({filters:{...defaultReadingFilters,crossovers:'only'},terms:[]})])
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})
it.each(['in_progress','hiatus'])('moves caught-up %s reads to waiting while retaining partial rereads', async publication_status => {
 await db.exec('reset role;begin')
 try {
  const id=(await documents())[0].id
  await db.query("update public.library_entries set metadata_overrides=metadata_overrides||$2::jsonb,reading_status='re_reading',last_read_chapter=2 where id=$1",[id,JSON.stringify({publication_status,published_chapters:6})])
  expect((await db.query<{reading_status:string}>('select reading_status from public.library_entries where id=$1',[id])).rows[0].reading_status).toBe('re_reading')
  await db.query('update public.library_entries set last_read_chapter=6 where id=$1',[id])
  expect((await db.query<{reading_status:string}>('select reading_status from public.library_entries where id=$1',[id])).rows[0].reading_status).toBe('waiting_for_updates')
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('reuses normalized installment titles when searching the series collection again', async () => {
 await db.exec('reset role;begin')
 try {
  const ids=(await documents()).slice(0,2).map(story=>story.id)
  for(const id of ids) await db.query('update public.library_entries set metadata_overrides=metadata_overrides||$2::jsonb where id=$1',[id,JSON.stringify({title:'A very long installment title '.repeat(40),series_memberships:[{id:987654,name:'Cached Search Series',url:'https://archiveofourown.org/series/987654',position:1}]})])
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  expect((await query({query:'long installment'},1,25,'series')).total).toBeGreaterThan(0)
  await db.exec('reset role')
  const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_normalize(text)'::regprocedure")).rows[0]
  await db.exec(fn.definition.replace(fn.source,fn.source.replace(/\bbegin\b/i,"begin if length(p_text)>500 then raise exception 'Series titles normalized again'; end if;")))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  expect((await query({query:'installment',sort:'words_reverse'},1,25,'series')).total).toBeGreaterThan(0)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('lazily caches each series search scope without normalizing long text again', async () => {
 await db.exec('reset role;begin')
 try {
  const id=(await documents())[0].id
  await db.query("update public.library_entries set notes=repeat('Scope notes ',80),metadata_overrides=metadata_overrides||$2::jsonb where id=$1",[id,JSON.stringify({title:'Scope Cache Installment',summary:'Scope cache prose '.repeat(80),summary_html:`<p>${'Scope cache prose '.repeat(80)}</p>`,series_memberships:[{id:987655,name:'Scope Cache Series',url:'https://archiveofourown.org/series/987655',position:1}]})])
  await db.query('insert into public.library_series(user_id,ao3_series_id,notes,metadata) values($1,987655,$2,$3)',[alice,'Scope notes '.repeat(80),JSON.stringify({seriesId:987655,title:'Scope Cache Series',normalizedUrl:'https://archiveofourown.org/series/987655',description:'Scope cache prose '.repeat(80),works:[]})])
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  for (const scope of ['any','summary','notes']) expect((await query({within:'Scope',scope},1,25,'series')).total,scope).toBeGreaterThan(0)
  await db.exec('reset role')
  const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_normalize(text)'::regprocedure")).rows[0]
  await db.exec(fn.definition.replace(fn.source,fn.source.replace(/\bbegin\b/i,"begin if length(p_text)>500 then raise exception 'Series text normalized again'; end if;")))
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  for(const scope of ['any','summary','notes']) {
   const result=await query({within:'Scope',scope},1,25,'series')
   expect(result.total,scope).toBeGreaterThan(0)
   for(const story of result.stories) for(const key of ['normalizedSearchAny','normalizedSearchSummary','normalizedSearchNotes']) expect(story).not.toHaveProperty(key)
  }
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})

it('starts rereading at zero through the checked organizer boundary without adding chapter observations', async () => {
 await db.exec('reset role;begin')
 try {
  const id=(await documents())[0].id
  await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"publication_status\":\"complete\",\"published_chapters\":6,\"total_chapters\":6}',reading_status='finished',last_read_chapter=6 where id=$1",[id])
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  const before=(await db.query<{history:unknown[]}>('select reading_history history from public.library_entries where id=$1',[id])).rows[0].history
  await db.exec('reset role')
  const baseline=(await db.query<{snapshot:unknown}>('select public.library_edit_snapshot($1) snapshot',[id])).rows[0].snapshot
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
  await db.query("select public.update_library_entry_checked($1,'{\"status\":\"re_reading\",\"progress\":0}',$2)",[id,JSON.stringify(baseline)])
  const entry=(await db.query<{reading_status:string;last_read_chapter:number;reading_history:{action:string}[];finished_at:string|null}>('select reading_status,last_read_chapter,reading_history,finished_at from public.library_entries where id=$1',[id])).rows[0]
  expect(entry).toMatchObject({reading_status:'re_reading',last_read_chapter:0,finished_at:null})
  expect(entry.reading_history.filter(event=>event.action==='chapter_read')).toHaveLength(before.filter(event=>(event as {action:string}).action==='chapter_read').length)
 } finally { await db.exec(`rollback;set role authenticated;set request.jwt.claim.sub='${alice}'`) }
})
