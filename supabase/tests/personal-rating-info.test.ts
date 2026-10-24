// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite, safari: string, chrome: string
const alice='10000000-0000-0000-0000-000000000001', bob='10000000-0000-0000-0000-000000000002'
async function asUser(id=alice) { await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`) }
async function settings(input={}) { return (await db.query<{result:{ratingInfo:string|null}}>('select public.personal_rating_settings($1) result',[JSON.stringify(input)])).rows[0].result }
async function device(secret:string, action:string, input={}, work=123) {
 await db.exec("reset role;reset request.jwt.claim.sub;set role anon")
 return (await db.query<{result:{ratingInfo:string|null;entry:{id:string;version:string;status:string;progress:number;readingHistory:unknown[]}}}>('select public.userscript_library($1,$2,$3,$4) result',[secret,action,work,JSON.stringify(input)])).rows[0].result
}
beforeAll(async()=>{
 db=await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}')`)
 const secrets=[]
 for (const name of ['Safari','Chrome']) {
  await asUser()
  const code=(await db.query<{result:{code:string}}>("select public.manage_userscript_device('create',$1) result",[name])).rows[0].result.code
  await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
  secrets.push((await db.query<{result:{secret:string}}>("select public.userscript_library($1,'claim') result",[code])).rows[0].result.secret)
 }
 ;[safari,chrome]=secrets
},30000)
afterAll(async()=>{await db?.close()})
it('shares rating text between app and both paired browsers, isolates owners and rejects stale edits',async()=>{
 await asUser(); expect(await settings()).toEqual({ratingInfo:null})
 await db.exec("insert into public.metadata_preferences(retrieval_mode) values('extension')")
 expect(await settings({text:'My stars\n5: Favorite',base:null})).toEqual({ratingInfo:'My stars\n5: Favorite'})
 expect((await device(safari,'get')).ratingInfo).toBe('My stars\n5: Favorite')
 await device(safari,'rating_save',{text:'Changed on Safari',base:'My stars\n5: Favorite'})
 expect((await device(chrome,'rating_get')).ratingInfo).toBe('Changed on Safari')
 expect((await device(safari,'series_get',{},77)).ratingInfo).toBe('Changed on Safari')
 await asUser(); expect((await settings()).ratingInfo).toBe('Changed on Safari')
 await expect(settings({text:'Stale edit',base:'My stars\n5: Favorite'})).rejects.toThrow('changed on another device')
 expect((await db.query<{retrieval_mode:string}>('select retrieval_mode from public.metadata_preferences')).rows[0].retrieval_mode).toBe('extension')
 await asUser(bob); expect((await settings()).ratingInfo).toBeNull()
 await expect(device('x'.repeat(64),'rating_get')).rejects.toThrow('Reconnect')
 await expect(device(safari,'rating_save',{text:7,base:'Changed on Safari'})).rejects.toThrow('Invalid personal rating')
 await device(chrome,'rating_save',{text:'',base:'Changed on Safari'})
 await asUser(); expect((await settings()).ratingInfo).toBe('')
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 await expect(settings()).rejects.toThrow('permission denied')
})
it('saves manual Rec choices through the existing checked save and preserves them on unrelated saves',async()=>{
 await asUser()
 const input={metadata:{title:'Manual Rec',published_chapters:5,total_chapters:5},status:'reading',progress:2,notes:'',rating:4,favorite:false,rec:true,collections:[],tags:[]}
 const id=(await db.query<{id:string}>("select public.save_library_story_checked(null,'https://archiveofourown.org/works/123',$1,null) id",[JSON.stringify(input)])).rows[0].id
 expect((await db.query<{is_rec:boolean}>('select is_rec from public.library_entries where id=$1',[id])).rows[0].is_rec).toBe(true)
 const snapshot=input
 await db.query("select public.save_library_story_checked($1,'https://archiveofourown.org/works/123',$2,$3)",[id,JSON.stringify({...input,rec:false}),JSON.stringify(snapshot)])
 expect((await db.query<{is_rec:boolean}>('select is_rec from public.library_entries where id=$1',[id])).rows[0].is_rec).toBe(false)
 const entry=(await device(chrome,'get')).entry
 const paused=await device(chrome,'progress',{status:'paused_reading',progress:2,version:entry.version,base:{status:'reading',progress:2}})
 expect(paused.entry.readingHistory).toEqual(expect.arrayContaining([expect.objectContaining({action:'paused_reading',previous_status:'reading'})]))
 await asUser()
 const shelf=await db.query<{result:{stories:{id:string}[]}}>("select public.query_library('{\"mode\":\"library\",\"shelf\":\"currently_reading\"}') result")
 expect(shelf.rows[0].result.stories.map(story=>story.id)).not.toContain(id)
 await db.exec(`reset role;update public.library_entries set last_update_notification_at=now() where id='${id}';update public.works set verified_chapters='{"3":"103"}' where ao3_work_id=123`)
 await asUser()
 for (const section of ['complete','in_progress','new','view_all','waiting','re_reading']) {
  const result=(await db.query<{result:{stories:{id:string}[]}}>('select public.query_library($1) result',[JSON.stringify({mode:'reading',shelf:section})])).rows[0].result
  expect(result.stories.map(story=>story.id)).not.toContain(id)
 }
 const pausedShelf=(await db.query<{result:{stories:{id:string}[]}}>("select public.query_library('{\"mode\":\"reading\",\"shelf\":\"paused_reading\"}') result")).rows[0].result
 expect(pausedShelf.stories.map(story=>story.id)).toContain(id)
})
