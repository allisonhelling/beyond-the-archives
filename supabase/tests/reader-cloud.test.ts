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
