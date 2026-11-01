// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db:PGlite
const owner='70000000-0000-0000-0000-000000000001',other='70000000-0000-0000-0000-000000000002'
beforeAll(async()=>{db=await createTestDatabase()},30000)
afterAll(async()=>{await db?.close()})
const register=(id:string,name:string)=>db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${id}@example.com`,JSON.stringify({username:name})])
it('reserves a username atomically but grants login and reader access only after confirmation',async()=>{
 await register(owner,' NewReader ')
 expect((await db.query('select username from public.account_usernames where user_id=$1',[owner])).rows).toEqual([{username:'NewReader'}])
 expect((await db.query('select * from public.reader_app_access where user_id=$1',[owner])).rows).toEqual([])
 expect((await db.query('select public.account_login_email($1) email',['newreader'])).rows[0]).toEqual({email:null})
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[owner])
 expect((await db.query('select public.account_login_email($1) email',['NEWREADER'])).rows[0]).toEqual({email:`${owner}@example.com`})
 expect((await db.query('select user_id from public.reader_app_access where user_id=$1',[owner])).rows).toEqual([{user_id:owner}])
 expect((await db.query('select * from public.reader_organizer_links where user_id=$1',[owner])).rows).toEqual([])
})
it('rolls back a signup with a duplicate or invalid username without changing an existing account',async()=>{
 await expect(register(other,'newreader')).rejects.toThrow('duplicate key')
 expect((await db.query('select id from auth.users where id=$1',[other])).rows).toEqual([])
 await expect(register(other,'bad name')).rejects.toThrow('3–30')
 expect((await db.query('select id from auth.users where id=$1',[other])).rows).toEqual([])
 await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[JSON.stringify({username:'Hijacked'}),owner])
 expect((await db.query('select username from public.account_usernames where user_id=$1',[owner])).rows).toEqual([{username:'NewReader'}])
})
