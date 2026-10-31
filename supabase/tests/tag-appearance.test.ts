// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite, reader: string
const alice='10000000-0000-0000-0000-000000000001', bob='10000000-0000-0000-0000-000000000002'
const appearance = { shape: 'filled', colors: { tags: '#123456' } }
async function asUser(id=alice) { await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`) }
async function settings(input={}) { return (await db.query<{result:{tagAppearance:typeof appearance|null}}>('select public.tag_appearance_settings($1) result',[JSON.stringify(input)])).rows[0].result }
async function device(secret:string, action:string, input={}) {
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 return (await db.query<{result:{tagAppearance:typeof appearance|null}}>('select public.userscript_library($1,$2,null,$3) result',[secret,action,JSON.stringify(input)])).rows[0].result
}
beforeAll(async()=>{
 db=await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}')`)
 await asUser()
 const code=(await db.query<{result:{code:string}}>("select public.manage_userscript_device('create','Reader') result")).rows[0].result.code
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 reader=(await db.query<{result:{secret:string}}>("select public.userscript_library($1,'claim') result",[code])).rows[0].result.secret
},30000)
afterAll(async()=>{await db?.close()})
it('shares owner-scoped tag appearance through paired credentials, checks baselines and validates values',async()=>{
 await asUser(); expect(await settings()).toEqual({tagAppearance:null})
 await settings({tagAppearance:appearance,base:null})
 expect(await device(reader,'tag_get')).toEqual({tagAppearance:appearance})
 const next={shape:'commas',colors:{}}
 expect(await device(reader,'tag_save',{tagAppearance:next,base:appearance})).toEqual({tagAppearance:next})
 await asUser(); expect(await settings()).toEqual({tagAppearance:next})
 await expect(settings({tagAppearance:appearance,base:appearance})).rejects.toThrow('changed on another device')
 await expect(settings({tagAppearance:{shape:'bad',colors:{}},base:next})).rejects.toThrow('Invalid tag appearance')
 await expect(settings({tagAppearance:{shape:'pill',colors:{tags:'red'}},base:next})).rejects.toThrow('Invalid tag color')
 await expect(settings({tagAppearance:{shape:'pill',colors:{secret:'#123456'}},base:next})).rejects.toThrow('Invalid tag color')
 await asUser(bob); expect(await settings()).toEqual({tagAppearance:null})
 await expect(device('x'.repeat(64),'tag_get')).rejects.toThrow('Reconnect')
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 await expect(settings()).rejects.toThrow('permission denied')
 await asUser()
 expect((await db.query<{preferences:{tag_appearance:unknown}}>("select (public.export_library_backup()->'tables'->'metadata_preferences'->0) preferences")).rows[0].preferences).toMatchObject({tag_appearance:next})
})

it('shares category order, rejects invalid orders, detects conflicting reorders, and preserves order for older clients',async()=>{
 await asUser()
 const base=(await settings()).tagAppearance
 const order=['characters','relationships','tags','categories','warnings']
 const next={shape:'pill',colors:{tags:'#123456'},order}
 expect(await settings({tagAppearance:next,base})).toEqual({tagAppearance:next})
 expect(await device(reader,'tag_get')).toEqual({tagAppearance:next})
 const reordered={...next,order:['tags','characters','relationships','categories','warnings']}
 expect(await device(reader,'tag_save',{tagAppearance:reordered,base:next})).toEqual({tagAppearance:reordered})
 await asUser()
 await expect(settings({tagAppearance:next,base:next})).rejects.toThrow('changed on another device')
 for(const invalid of [null,{},['tags'],['tags','tags','characters','categories','warnings'],['tags','relationships','characters','categories','unknown']]) {
  await expect(settings({tagAppearance:{...next,order:invalid},base:reordered})).rejects.toThrow('Invalid tag category order')
 }
 const legacy={shape:'sharp',colors:{}}
 expect(await settings({tagAppearance:legacy,base:reordered})).toEqual({tagAppearance:{...legacy,order:reordered.order}})
})
