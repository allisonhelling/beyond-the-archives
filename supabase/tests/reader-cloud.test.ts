// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db:PGlite
const owner='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002'
async function asUser(id=owner){await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`)}
async function apply(key:string,value:unknown,base=0,id=crypto.randomUUID()) {return (await db.query<{result:{key:string;value:unknown;revision:number;conflict?:boolean}}>('select public.reader_cloud_apply($1,$2,$3,$4) result',[id,key,JSON.stringify(value),base])).rows[0].result}
beforeAll(async()=>{db=await createTestDatabase();await db.exec(`insert into auth.users values('${owner}'),('${other}');insert into public.reader_app_access values('${owner}')`);await asUser()},30000)
afterAll(async()=>{await db?.close()})
it('denies unapproved accounts and isolates rows',async()=>{
 await apply('book/notes','private')
 await asUser(other)
 expect((await db.query('select * from public.reader_cloud_values')).rows).toEqual([])
 await expect(apply('book/notes','intruder')).rejects.toThrow('Reader cloud access')
 await expect(db.exec(`insert into public.reader_app_access values('${other}')`)).rejects.toThrow()
 await asUser()
 await expect(db.exec("update public.reader_cloud_values set value='null'")).rejects.toThrow()
})
it('checks revisions and retries a lost response without duplicating writes',async()=>{
 const id=crypto.randomUUID()
 const first=await apply('book/position',{chapter:'two',textOffset:20},0,id)
 expect(await apply('book/position',{chapter:'two',textOffset:20},0,id)).toEqual(first)
 expect(await apply('book/position',{chapter:'one',textOffset:0},0)).toMatchObject({conflict:true,revision:1})
 expect(await apply('book/position',{chapter:'one',textOffset:0},1)).toMatchObject({revision:2,value:{chapter:'one',textOffset:0}})
 // Same-value concurrent writes do not produce false conflicts.
 expect(await apply('book/position',{chapter:'one',textOffset:0},0)).not.toHaveProperty('conflict')
})
it('retains distinct history IDs and immutable private EPUB objects',async()=>{
 await apply('book/history:a',{id:'a'});await apply('book/history:b',{id:'b'})
 expect((await db.query("select key from public.reader_cloud_values where key like '%history:%'")).rows).toHaveLength(2)
 const name=`${owner}/${'a'.repeat(64)}.epub`
 await db.query("insert into storage.objects(bucket_id,name) values('reader-epubs',$1)",[name])
 await expect(db.query("insert into storage.objects(bucket_id,name) values('reader-epubs',$1)",[`${other}/${'b'.repeat(64)}.epub`])).rejects.toThrow()
 await asUser(other)
 expect((await db.query("select * from storage.objects where bucket_id='reader-epubs'")).rows).toEqual([])
 await asUser()
 expect((await db.query("update storage.objects set metadata='{}' where bucket_id='reader-epubs' returning name")).rows).toEqual([])
})

it('grants reader access to invited/confirmed organizer users but not anonymous or unconfirmed accounts',async()=>{
 await db.exec('reset role')
 const invited='20000000-0000-0000-0000-000000000001',confirmed='20000000-0000-0000-0000-000000000002',anonymous='20000000-0000-0000-0000-000000000003'
 await db.query('insert into auth.users(id,invited_at) values($1,now())',[invited])
 await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[confirmed])
 await db.query('insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,now(),true)',[anonymous])
 const grants=(await db.query<{user_id:string}>('select user_id from public.reader_app_access')).rows.map(row=>row.user_id)
 expect(grants).toContain(invited);expect(grants).toContain(confirmed);expect(grants).not.toContain(anonymous);expect(grants).not.toContain(other)
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[other])
 expect((await db.query('select user_id from public.reader_app_access where user_id=$1',[other])).rows).toHaveLength(1)
 await asUser()
})
it('erases cloud reading data and receipts, blocks stale-device resurrection, and permits explicit reimport',async()=>{
 const book='d'.repeat(64),key=`${book}/deleted`,id=crypto.randomUUID()
 await apply(`${book}/manifest`,{title:'Private title'})
 await apply(`${book}/notes`,'Private notes');await apply(`${book}/history:read`,{id:'read'})
 const name=`${owner}/${book}.epub`
 await db.query("insert into storage.objects(bucket_id,name) values('reader-epubs',$1)",[name])
 const destination=crypto.randomUUID()
 await db.query('insert into public.reader_transfer_destinations(id,user_id,device,label,token_hash) values($1,$2,$3,$4,$5)',[destination,owner,'device','Reader','c'.repeat(64)])
 await db.exec('reset role')
 await db.query('insert into public.reader_import_inbox(destination,id,user_id,hash,metadata) values($1,$2,$3,$4,$5)',[destination,crypto.randomUUID(),owner,book,JSON.stringify({title:'Delete inbox metadata'})])
 await asUser()
 const deleted=await apply(key,true,0,id)
 expect(await apply(key,true,0,id)).toEqual(deleted)
 expect((await db.query('select * from public.reader_import_inbox where hash=$1',[book])).rows).toEqual([])
 expect((await db.query('select key from public.reader_cloud_values where starts_with(key,$1)',[`${book}/`])).rows).toEqual([{key}])
 await db.exec('reset role')
 expect((await db.query("select result from public.reader_cloud_receipts where starts_with(result->>'key',$1)",[`${book}/`])).rows).toEqual([{result:deleted}])
 await asUser()
 expect(await apply(`${book}/notes`,'Stale notes')).toEqual(deleted)
 await expect(db.query("insert into storage.objects(bucket_id,name) values('reader-epubs',$1)",[`${owner}/${book}.epub`])).rejects.toThrow()
 await asUser(other)
 expect((await db.query("delete from storage.objects where name=$1 returning name",[name])).rows).toEqual([])
 await asUser()
 expect((await db.query("delete from storage.objects where name=$1 returning name",[name])).rows).toEqual([{name}])
 expect(await apply(key,false,deleted.revision)).toMatchObject({value:false,revision:2})
 await db.query("insert into storage.objects(bucket_id,name) values('reader-epubs',$1)",[name])
 expect(await apply(`${book}/manifest`,{title:'Fresh import'})).toMatchObject({revision:1})
})
