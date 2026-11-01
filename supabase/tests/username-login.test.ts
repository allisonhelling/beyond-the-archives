// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db:PGlite
beforeAll(async()=>{db=await createTestDatabase();await db.exec(`
 insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('60000000-0000-0000-0000-000000000001','reader@example.com',now(),'{"username":"Reader"}'),
 ('60000000-0000-0000-0000-000000000002','pending@example.com',null,'{"username":"Pending"}');
`)},30000)
afterAll(async()=>{await db?.close()})
it('resolves confirmed account usernames case-insensitively and denies public access',async()=>{
 const lookup=async(name:string)=>(await db.query<{email:string|null}>('select public.account_login_email($1) email',[name])).rows[0].email
 await db.exec('set role service_role')
 expect(await lookup(' reader ')).toBe('reader@example.com')
 expect(await lookup('Pending')).toBeNull();expect(await lookup('missing')).toBeNull()
 for(const role of ['anon','authenticated']){
  await db.exec(`reset role;set role ${role}`)
  await expect(lookup('Reader')).rejects.toThrow('permission denied')
 }
 await db.exec('reset role')
 await expect(db.exec(`update auth.users set raw_app_meta_data='{"username":" READER "}' where email='pending@example.com'`)).rejects.toThrow('duplicate key')
})
