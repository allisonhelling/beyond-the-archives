// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db:PGlite
const owner='60000000-0000-0000-0000-000000000001',other='60000000-0000-0000-0000-000000000002',pending='60000000-0000-0000-0000-000000000003'
async function asUser(id=owner) {await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`)}
const manage=async(username?:string)=>(await db.query<{name:string|null}>('select public.manage_account_username($1) name',[username??null])).rows[0].name
const lookup=async(username:string)=>(await db.query<{email:string|null}>('select public.account_login_email($1) email',[username])).rows[0].email
beforeAll(async()=>{
 db=await createTestDatabase()
 await db.exec(`
  drop function public.account_login_email(text);
  drop function public.manage_account_username(text);
  drop table public.account_usernames;
  create role username_migration nologin nosuperuser;
  grant usage, create on schema public to username_migration;
  grant usage on schema auth to username_migration;
  grant select, references on auth.users to username_migration;
  set role username_migration;
 `)
 // Apply both migrations without ownership of Supabase's managed Auth table.
 for(const migration of ['20261031000500_username_login.sql','20261031000600_self_service_usernames.sql']) {
  await db.exec(await readFile(new URL(`../migrations/${migration}`,import.meta.url),'utf8'))
 }
 await db.exec(`reset role;
  insert into auth.users(id,email,email_confirmed_at) values
  ('${owner}','reader@example.com',now()),('${other}','other@example.com',now()),('${pending}','pending@example.com',null);
 `)
},30000)
afterAll(async()=>{await db?.close()})
it('lets users create and change their own unique username',async()=>{
 await asUser();expect(await manage()).toBeNull();expect(await manage(' Reader ')).toBe('Reader')
 await asUser(other);expect(await manage()).toBeNull()
 await expect(manage('rEaDeR')).rejects.toThrow('duplicate key')
 expect(await manage('OtherReader')).toBe('OtherReader')
 await asUser();expect(await manage()).toBe('Reader')
 for(const invalid of ['','ab','has space','reader@example.com','a'.repeat(31)])await expect(manage(invalid)).rejects.toThrow('3–30')
 expect(await manage('NewReader')).toBe('NewReader')
 await asUser(other);expect(await manage('Reader')).toBe('Reader')
})
it('uses the chosen username for login and keeps emails private',async()=>{
 await db.exec('reset role;set role service_role')
 expect(await lookup(' newreader ')).toBe('reader@example.com')
 expect(await lookup('READER')).toBe('other@example.com')
 expect(await lookup('missing')).toBeNull()
 for(const role of ['anon','authenticated']) {
  await db.exec(`reset role;set role ${role}`)
  await expect(lookup('NewReader')).rejects.toThrow('permission denied')
  await expect(db.query('select * from public.account_usernames')).rejects.toThrow('permission denied')
 }
 await asUser();await expect(db.exec(`update public.account_usernames set username='Hijacked' where user_id='${other}'`)).rejects.toThrow('permission denied')
 await asUser(pending);await expect(manage('Pending')).rejects.toThrow('Sign in')
 await db.exec('reset role;set role anon');await expect(manage('Anonymous')).rejects.toThrow('permission denied')
})
it('ignores Auth metadata and denies usernames after account confirmation is revoked',async()=>{
 await db.exec(`reset role;update auth.users set raw_app_meta_data='{"username":"Pretend"}',email_confirmed_at=null where id='${owner}';set role service_role`)
 expect(await lookup('NewReader')).toBeNull();expect(await lookup('Pretend')).toBeNull()
})
