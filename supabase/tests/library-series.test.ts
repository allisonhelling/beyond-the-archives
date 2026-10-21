// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
const preview = { seriesId: 77, normalizedUrl: 'https://archiveofourown.org/series/77', title: 'Series', works: [{ workId: 101, url: 'https://archiveofourown.org/works/101' }] }
async function asUser<T>(id: string, action: () => Promise<T>) {
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`)
 try { return await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
const remember = (value: object = preview) => db.query('select public.remember_library_series($1)', [JSON.stringify(value)])
const note = (notes: string, base: string) => db.query('select public.save_library_series_note(77,$1,$2)', [notes, base])
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values ('${alice}'),('${bob}')`) }, 30000)
afterAll(async () => { await db?.close() })
it('caches private series metadata without importing works, and refresh preserves personal notes', async () => {
 await asUser(alice, async () => { await remember(); await note('My notes', ''); await remember({ ...preview, title: 'Refreshed' }) })
 expect((await asUser(alice, () => db.query<{ metadata: { title: string }; notes: string }>('select metadata,notes from public.library_series'))).rows).toEqual([{ metadata: { ...preview, title: 'Refreshed' }, notes: 'My notes' }])
 expect((await db.query('select id from public.works')).rows).toEqual([])
 expect((await asUser(bob, () => db.query('select id from public.library_series'))).rows).toEqual([])
 await expect(asUser(bob, () => note('Foreign notes', ''))).rejects.toThrow(/Load the series/)
 await db.exec('set role anon')
 try { await expect(remember()).rejects.toThrow(/permission denied/); await expect(db.query('select * from public.library_series')).rejects.toThrow(/permission denied/) } finally { await db.exec('reset role') }
})
it('requires review for divergent device notes and permits saving against the latest version', async () => {
 await asUser(alice, async () => {
  await note('Desktop notes', 'My notes')
  await expect(note('Mobile notes', 'My notes')).rejects.toThrow(/Review both versions/)
  expect((await db.query<{ notes: string }>('select notes from public.library_series')).rows[0].notes).toBe('Desktop notes')
  await note('Combined notes', 'Desktop notes')
 })
})
it('rejects malformed identifiers and noncanonical destinations before storing snapshots', async () => {
 for (const value of [{ ...preview, seriesId: 0 }, { ...preview, normalizedUrl: 'https://evil.example/series/77' }, { ...preview, works: [{ workId: 101, url: 'https://evil.example/works/101' }] }, { ...preview, works: [{ workId: null }] }]) {
  await expect(asUser(alice, () => remember(value))).rejects.toThrow(/Invalid series/)
 }
})

it('keeps series favorites and collection membership private and independent from fic organization', async () => {
 const collection = (await asUser(alice, () => db.query<{id:string}>("insert into public.collections(name) values ('Series reads') returning id"))).rows[0].id
 const foreign = (await asUser(bob, () => db.query<{id:string}>("insert into public.collections(name) values ('Other reader') returning id"))).rows[0].id
 await asUser(alice, async () => {
  await db.query('select public.update_library_series(77,$1,$2)', [JSON.stringify({ favorite:true,collections:[collection] }),JSON.stringify({favorite:false,collections:[]})])
  await remember({ ...preview, title:'Refreshed again' })
  expect((await db.query<{is_favorite:boolean;notes:string}>('select is_favorite,notes from public.library_series')).rows[0]).toEqual({is_favorite:true,notes:'Combined notes'})
  expect((await db.query('select collection_id from public.collection_series')).rows).toEqual([{collection_id:collection}])
  await expect(db.query('select public.update_library_series(77,$1,$2)',[JSON.stringify({collections:[foreign]}),JSON.stringify({collections:[collection]})])).rejects.toThrow(/Collection unavailable/)
  await db.query('select public.update_library_series(77,$1,$2)',[JSON.stringify({collections:[]}),JSON.stringify({collections:[collection]})])
  await expect(db.query('select public.update_library_series(77,$1,$2)',[JSON.stringify({collections:[foreign]}),JSON.stringify({collections:[collection]})])).rejects.toThrow(/Review both versions/)
 })
 expect((await asUser(bob, () => db.query('select * from public.collection_series'))).rows).toEqual([])
 await expect(asUser(bob, () => db.query("select public.update_library_series(77,'{}','{}')"))).rejects.toThrow(/Load the series/)
})
it('finishes only owned works atomically without saving missing works and preserves existing fic data', async () => {
 await asUser(alice, async () => {
  await remember({ ...preview, complete:false, works:[{workId:101,url:'https://archiveofourown.org/works/101',title:'First',chapters:'3/3',complete:true,position:1,authors:['Author'],fandoms:['Fandom'],summary:'Summary',tags:['Tag']},{workId:102,url:'https://archiveofourown.org/works/102',title:'Second',chapters:'2/?',complete:false,position:2,authors:['Author'],fandoms:['Other fandom'],summary:'Second summary',tags:[],wordCount:123}] })
  await db.query("select public.save_library_story('https://archiveofourown.org/works/101','{\"title\":\"My correction\",\"published_chapters\":4}','reading',1,'Keep notes',4::smallint,true,array[]::uuid[],array['Comfort'])")
 })
 await asUser(bob, async () => { await remember(); await db.query("select public.save_library_story('https://archiveofourown.org/works/101','{\"title\":\"Bob story\"}','reading',0,'Bob notes',null,false,array[]::uuid[],array[]::text[])") })
 await asUser(alice, async () => {
  expect((await db.query<{count:number}>('select public.finish_library_series(77) count')).rows[0].count).toBe(1)
  const entries = (await db.query<{ao3_work_id:number;reading_status:string;last_read_chapter:number;notes:string;personal_rating:number;is_favorite:boolean;metadata_overrides:object;extension_metadata:object}>('select w.ao3_work_id,e.* from public.library_entries e join public.works w on w.id=e.work_id order by w.ao3_work_id')).rows
  expect(entries[0]).toMatchObject({reading_status:'finished',last_read_chapter:4,notes:'Keep notes',personal_rating:4,is_favorite:true,metadata_overrides:{title:'My correction'}})
  expect(entries).toHaveLength(1)
  expect((await db.query('select id from public.works where ao3_work_id=102')).rows).toEqual([])
  expect((await db.query('select name from public.personal_tags')).rows).toEqual([{name:'Comfort'}])
  expect((await db.query('select reading_status,metadata from public.library_series')).rows[0]).toMatchObject({reading_status:'finished',metadata:{complete:false}})
  await remember({...preview,complete:true})
  expect((await db.query('select reading_status,is_favorite from public.library_series')).rows[0]).toEqual({reading_status:'finished',is_favorite:true})
 })
 expect((await asUser(bob, () => db.query('select reading_status,notes from public.library_entries'))).rows).toEqual([{reading_status:'reading',notes:'Bob notes'}])
})

it('can finish a series without saved works and leaves a later added work at its chosen status', async () => {
 await asUser(alice, async () => {
  await remember({...preview,seriesId:88,normalizedUrl:'https://archiveofourown.org/series/88',works:[{workId:103,url:'https://archiveofourown.org/works/103'}]})
  expect((await db.query<{count:number}>('select public.finish_library_series(88) count')).rows[0].count).toBe(0)
  expect((await db.query("select reading_status from public.library_series where ao3_series_id=88")).rows).toEqual([{reading_status:'finished'}])
  expect((await db.query('select id from public.works where ao3_work_id=103')).rows).toEqual([])
  await db.query("select public.save_library_story('https://archiveofourown.org/works/103',jsonb_build_object('title','New work'),'to_read',0,'',null,false,array[]::uuid[],array[]::text[])")
  expect((await db.query('select e.reading_status from public.library_entries e join public.works w on w.id=e.work_id where w.ao3_work_id=103')).rows).toEqual([{reading_status:'to_read'}])
 })
})

it('stores a basic identity independently, preserves full details on organization, and removes only downloaded data', async () => {
 await asUser(alice, async () => {
  await db.query("select public.ensure_library_series(199,'Basic series')")
  await db.query("select public.save_library_series_note(199,'Keep this note','')")
  await db.query("select public.update_library_series(199,'{\"favorite\":true}','{\"favorite\":false}')")
  const full = { ...preview, seriesId: 199, normalizedUrl: 'https://archiveofourown.org/series/199', basic: false, fetchedAt: '2026-10-20T12:00:00Z' }
  await remember(full)
  await db.query("select public.ensure_library_series(199,'Stale title')")
  expect((await db.query<{metadata:object}>('select metadata from public.library_series where ao3_series_id=199')).rows[0].metadata).toEqual(full)
 })
 await asUser(bob, () => db.query('select public.remove_library_series_details(199)'))
 await asUser(alice, async () => {
  const full = { ...preview, seriesId: 199, normalizedUrl: 'https://archiveofourown.org/series/199', basic: false, fetchedAt: '2026-10-20T12:00:00Z' }
  expect((await db.query<{metadata:object}>('select metadata from public.library_series where ao3_series_id=199')).rows[0].metadata).toEqual(full)
  await db.query('select public.remove_library_series_details(199)')
  expect((await db.query('select metadata,notes,is_favorite from public.library_series where ao3_series_id=199')).rows[0]).toEqual({ metadata: { seriesId:199,title:'Series',normalizedUrl:full.normalizedUrl,description:'',works:[],basic:true },notes:'Keep this note',is_favorite:true })
  expect((await db.query('select id from public.works where ao3_work_id=102')).rows).toEqual([])
 })
 await db.exec('set role anon')
 try {
  await expect(db.query("select public.ensure_library_series(199,'No access')")).rejects.toThrow(/permission denied/)
  await expect(db.query('select public.remove_library_series_details(199)')).rejects.toThrow(/permission denied/)
 } finally { await db.exec('reset role') }
})
it('projects identity-only series as basic and explicit downloads as full without owned works', async () => {
 await asUser(alice, async () => {
  const story = { id:'basic-work', work:{ao3_work_id:201}, metadata:{ title:'A saved work',authors:['Author'],fandoms:[],word_count:123,series_memberships:[{id:199,name:'Series',url:'https://archiveofourown.org/series/199',position:4}],ao3_tags:[],relationship_tags:[],character_tags:[],additional_tags:[] },reading_status:'to_read',personalTags:[],last_read_chapter:0 }
  const result = (await db.query<{payload:{detailsLoaded:boolean;wordCount:number;works:object[]}}>('select payload from public.library_series_results($1) where payload->>\'seriesId\'=\'199\'', [JSON.stringify([story])])).rows[0].payload
  expect(result).toMatchObject({detailsLoaded:false,wordCount:123,works:[{workId:201,position:4}]})
  await remember({...preview,seriesId:299,normalizedUrl:'https://archiveofourown.org/series/299',basic:false})
  const full = (await db.query<{payload:{detailsLoaded:boolean;savedStories:object[]}}>("select payload from public.library_series_results('[]') where payload->>'seriesId'='299'")).rows[0].payload
  expect(full).toMatchObject({detailsLoaded:true,savedStories:[]})
 })
})
it('rejects invalid minimal identities', async () => {
 await asUser(alice, async () => {
  for (const id of [0,-1,9007199254740992]) await expect(db.query('select public.ensure_library_series($1,$2)',[id,'Series'])).rejects.toThrow(/Invalid series identity/)
  await expect(db.query("select public.ensure_library_series(399,' ')")).rejects.toThrow(/Invalid series identity/)
 })
})
