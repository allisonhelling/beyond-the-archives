// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const owner='20000000-0000-0000-0000-000000000001',other='20000000-0000-0000-0000-000000000002',destination='20000000-0000-0000-0000-000000000003',job='20000000-0000-0000-0000-000000000004'
async function asUser(id=owner){await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`)}
beforeAll(async()=>{db=await createTestDatabase();await db.exec(`insert into auth.users values('${owner}'),('${other}');insert into public.reader_app_access values('${owner}')`);await asUser()},30000)
afterAll(async()=>{await db?.close()})
it('requires reader access and prevents pairing to another account',async()=>{
 await expect(db.query('insert into public.reader_transfer_destinations(id,user_id,device,label,token_hash) values($1,$2,$3,$4,$5)',[destination,other,'device','Reader','a'.repeat(64)])).rejects.toThrow()
 await asUser(other)
 await expect(db.query('insert into public.reader_transfer_destinations(id,user_id,device,label,token_hash) values($1,$2,$3,$4,$5)',[destination,other,'device','Reader','a'.repeat(64)])).rejects.toThrow()
 await asUser()
 await db.query('insert into public.reader_transfer_destinations(id,user_id,device,label,token_hash) values($1,$2,$3,$4,$5)',[destination,owner,'device','Reader','a'.repeat(64)])
})
it('allows account-scoped results but prevents EPUB identity and credential mutation',async()=>{
 await db.exec('reset role')
 await db.query('insert into public.reader_import_inbox(destination,id,user_id,hash) values($1,$2,$3,$4)',[destination,job,owner,'b'.repeat(64)])
 await asUser(other)
 expect((await db.query('select * from public.reader_import_inbox')).rows).toEqual([])
 expect((await db.query('select * from public.reader_transfer_destinations')).rows).toEqual([])
 await asUser()
 await expect(db.exec(`update public.reader_import_inbox set hash='${'c'.repeat(64)}'`)).rejects.toThrow()
 await expect(db.exec(`update public.reader_transfer_destinations set user_id='${other}'`)).rejects.toThrow()
 await expect(db.exec(`insert into public.reader_import_inbox(destination,id,user_id,hash) values('${destination}','${crypto.randomUUID()}','${owner}','${'a'.repeat(64)}')`)).rejects.toThrow()
 await db.exec("update public.reader_import_inbox set status='imported',message='Saved'")
 expect((await db.query('select status from public.reader_import_inbox')).rows).toEqual([{status:'imported'}])
 await db.exec('update public.reader_transfer_destinations set revoked=true')
 await expect(db.exec('update public.reader_transfer_destinations set revoked=false')).rejects.toThrow()
})
