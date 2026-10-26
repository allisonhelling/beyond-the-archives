// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import type { Story } from '../../src/features/library/model'
import type { LibraryResults } from '../../src/features/library/repository'
import { blankMetadata } from '../../src/features/library/model'
let db: PGlite, secret: string
const alice='10000000-0000-0000-0000-000000000001', bob='10000000-0000-0000-0000-000000000002'
beforeAll(async () => {
 db=await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}');set role authenticated;set request.jwt.claim.sub='${alice}';`)
 const code=(await db.query<{result:{code:string}}>("select public.manage_userscript_device('create','Safari') result")).rows[0].result.code
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 secret=(await db.query<{result:{secret:string}}>("select public.userscript_library($1,'claim') result",[code])).rows[0].result.secret
},30000)
afterAll(async()=>{await db?.close()})
async function request(action:string,input:object={},work=123,token=secret) {
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 return (await db.query<{result:{entry:{id:string;version:string;status:string;progress:number;notes:string;favorite:boolean};savedWorks:number[]}}>('select public.userscript_library($1,$2,$3,$4) result',[token,action,work,JSON.stringify(input)])).rows[0].result
}
const metadata={...blankMetadata,title:'Test work',published_chapters:5,total_chapters:5,publication_status:'complete'}
it('tracks every status path and includes re-reads in Finished, View All and the Re-Reading category',async()=>{
 const saved=await request('save',{metadata,status:'re_reading',progress:2,notes:'',rating:null,collections:[],tags:[]})
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
 for (const [mode,shelf] of [['library','finished'],['reading','view_all'],['reading','re_reading']]) {
  const result=(await db.query<{result:LibraryResults}>('select public.query_library($1) result',[JSON.stringify({mode,shelf})])).rows[0].result
  expect(result.stories.find(story=>story.id===saved.entry.id)).toMatchObject({reading_status:'re_reading',last_read_chapter:2})
  if(mode==='reading') expect(result.sections.re_reading).toBe(1)
 }
 const paused=await request('progress',{status:'paused_reading',progress:2,version:saved.entry.version,base:{status:'re_reading',progress:2}})
 const resumed=await request('progress',{status:'re_reading',progress:2,version:paused.entry.version,base:{status:'paused_reading',progress:2}})
 await request('progress',{status:'finished',progress:5,version:resumed.entry.version,base:{status:'re_reading',progress:2}})
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
 const entry=(await db.query<Story>('select * from public.library_entries where id=$1',[saved.entry.id])).rows[0]
 expect(entry.finished_at).toBeTruthy()
 expect(entry.reading_history?.map(event=>event.action)).toEqual(['added','status','paused_reading','resumed','finished'])
 await db.query("select public.update_library_entry_checked($1,'{\"notes\":\"Updated\"}','{\"notes\":\"\"}')",[entry.id])
 const edited=(await db.query<Story>('select * from public.library_entries where id=$1',[entry.id])).rows[0]
 expect(edited.finished_at).toEqual(entry.finished_at)
 expect(edited.reading_history).toEqual(entry.reading_history)
})
it('adds only selected series works with personal details, preserves saved works and checks device scope',async()=>{
 const preview={seriesId:77,normalizedUrl:'https://archiveofourown.org/series/77',title:'Test series',works:[123,456,789].map((workId,index)=>({workId,url:`https://archiveofourown.org/works/${workId}`,title:`Part ${index+1}`,position:index+1,authors:[],summary:'',tags:[],chapters:'5/5',wordCount:100,complete:true}))}
 const existing=await request('get')
 const input={preview,version:null,notes:'Series reminder',favorite:true,collections:[],works:[123,456].map(workId=>({workId,metadata,status:'finished',progress:5,notes:'Selected work note',rating:4,tags:['Personal'],collections:[]}))}
 const result=await request('series_save',input,77)
 expect(result.entry).toMatchObject({notes:'Series reminder',favorite:true})
 expect(result.savedWorks).toEqual(expect.arrayContaining([123,456]))
 expect(result.savedWorks).not.toContain(789)
 expect((await request('get')).entry).toEqual(existing.entry)
 expect((await request('get',{},456)).entry).toMatchObject({notes:'Selected work note',status:'finished',progress:5})
 await expect(request('series_save',input,77)).rejects.toThrow('Series changed')
 await expect(request('series_get',{},77,'invalid')).rejects.toThrow()
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`)
 expect((await db.query('select * from public.library_series')).rows).toHaveLength(0)
 await expect(db.query("select public.userscript_series('series_get',77,'{}')")).rejects.toThrow('permission denied')
 // Saving another AO3 listing page retains previous installments.
 const next={...preview,works:[{...preview.works[2],workId:999,url:'https://archiveofourown.org/works/999',position:4}]}
 await request('series_save',{...input,preview:next,version:result.entry.version,works:[]},77)
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
 expect((await db.query<{metadata:{works:{workId:number}[]}}>('select metadata from public.library_series where ao3_series_id=77')).rows[0].metadata.works.map(work=>work.workId)).toEqual([123,456,789,999])
})

it.each([
 { work: 201, started: null, via: 'companion' },
 { work: 202, started: '2026-09-01T00:00:00.000Z', via: 'web' },
])('starts a new reading session after a historical finish through $via, preserving earlier dates: $started', async ({ work, started, via }) => {
 let saved = await request('save', { metadata, status: 'finished', progress: 5, notes: '', rating: null, collections: [], tags: [] }, work)
 const finished = '2026-10-01T00:00:00.000Z'
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
 await db.query('update public.library_entries set started_at=$2,finished_at=$3 where id=$1', [saved.entry.id, started, finished])
 const before = (await db.query<Story>('select * from public.library_entries where id=$1', [saved.entry.id])).rows[0]
 if (via === 'companion') {
  saved = await request('get', {}, work)
  await request('progress', { status: 're_reading', progress: 1, version: saved.entry.version, base: { status: 'finished', progress: 5 } }, work)
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
 } else {
  await db.query(`select public.update_library_entry_checked($1,'{"status":"re_reading","progress":1}','{"status":"finished","progress":5}')`, [saved.entry.id])
 }
 const current = async () => (await db.query<Story>('select * from public.library_entries where id=$1', [saved.entry.id])).rows[0]
 const reread = await current()
 expect(reread.reading_status).toBe('re_reading')
 expect(reread.finished_at).toBeNull()
 expect(new Date(reread.started_at!).getTime()).toBeGreaterThan(Date.parse(finished))
 expect(reread.reading_history?.slice(0, -1)).toEqual(before.reading_history)
 const session = reread.reading_history!.at(-1)!
 expect(session).toMatchObject({ status: 're_reading' })
 if (!('previous_finished_at' in session)) throw new Error('Missing previous session dates')
 expect(Date.parse(session.previous_finished_at!)).toBe(Date.parse(finished))
 expect(session.previous_started_at ? Date.parse(session.previous_started_at) : null).toBe(started ? Date.parse(started) : null)
 await db.query(`select public.update_library_entry_checked($1,'{"status":"paused_reading"}','{"status":"re_reading","progress":1}')`, [saved.entry.id])
 await db.query(`select public.update_library_entry_checked($1,'{"status":"re_reading"}','{"status":"paused_reading","progress":1}')`, [saved.entry.id])
 expect((await current()).started_at).toEqual(reread.started_at)
 await db.query(`select public.update_library_entry_checked($1,'{"status":"finished","progress":5}','{"status":"re_reading","progress":1}')`, [saved.entry.id])
 const completed = await current()
 expect(new Date(completed.finished_at!).getTime()).toBeGreaterThanOrEqual(new Date(completed.started_at!).getTime())
 expect(completed.reading_history?.at(-1)).toMatchObject({ action: 'finished', status: 'finished' })
 // A later reading session replaces only the entry's date range, not its history.
 await db.query(`select public.update_library_entry_checked($1,'{"status":"reading","progress":0}','{"status":"finished","progress":5}')`, [saved.entry.id])
 const again = await current()
 expect(again.finished_at).toBeNull()
 const nextSession = again.reading_history!.at(-1)!
 if (!('previous_finished_at' in nextSession)) throw new Error('Missing previous session dates')
 expect(Date.parse(nextSession.previous_finished_at!)).toBe(new Date(completed.finished_at!).getTime())
 expect(again.reading_history?.slice(0, -1)).toEqual(completed.reading_history)
})

it('restores older backups without manufacturing dates or requiring a timeline column', async () => {
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
 const backup=(await db.query<{result:{tables:{library_entries:Record<string,unknown>[]}}}>('select public.export_library_backup() result')).rows[0].result
 const finished=backup.tables.library_entries.find(entry=>entry.reading_status==='finished')!
 const date=finished.finished_at
 backup.tables.library_entries.forEach(entry=>{delete entry.reading_history})
 await db.exec('reset role;reset request.jwt.claim.sub;set role service_role')
 await db.query('select public.restore_library_backup($1,$2,true)',[JSON.stringify(backup),bob])
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`)
 const restored=(await db.query<Story>('select * from public.library_entries where reading_status=\'finished\'')).rows
 expect(restored.length).toBeGreaterThan(0)
 expect(restored.some(entry=>new Date(entry.finished_at!).getTime()===Date.parse(date as string))).toBe(true)
 expect(restored.every(entry=>JSON.stringify(entry.reading_history)==='[]')).toBe(true)
})
