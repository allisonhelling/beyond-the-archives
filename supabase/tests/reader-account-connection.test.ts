// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db:PGlite
const owner='30000000-0000-0000-0000-000000000001',other='30000000-0000-0000-0000-000000000002',unapproved='30000000-0000-0000-0000-000000000003'
const installation='40000000-0000-0000-0000-000000000001',second='40000000-0000-0000-0000-000000000002'
async function asUser(id=owner){await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`)}
async function connection(action:string,device:string|null=null,secret:string|null=null){return(await db.query<{result:{enabled:boolean;secret?:string;userId?:string}}>('select public.reader_organizer_connection($1,$2,$3) result',[action,device,secret])).rows[0].result}
beforeAll(async()=>{db=await createTestDatabase();await db.exec(`insert into auth.users values('${owner}'),('${other}'),('${unapproved}');insert into public.reader_app_access values('${owner}'),('${other}')`);await asUser()},30000)
afterAll(async()=>{await db?.close()})
it('requires granted account access and prevents direct writes',async()=>{
 await asUser(unapproved);await expect(connection('enable')).rejects.toThrow('Reader account access required')
 await asUser();await expect(db.exec(`insert into public.reader_organizer_links(user_id) values('${owner}')`)).rejects.toThrow()
 await db.exec('reset role;set role anon');await expect(connection('enable')).rejects.toThrow();await asUser()
})
it('persists one account association and restores independent device credentials',async()=>{
 expect(await connection('status')).toEqual({enabled:false})
 await connection('enable')
 const a=await connection('restore',installation),b=await connection('restore',second)
 expect(a).toMatchObject({enabled:true,userId:owner});expect(a.secret).toHaveLength(64);expect(b.secret).not.toBe(a.secret)
 await asUser(other);expect(await connection('status')).toEqual({enabled:false})
 expect((await db.query('select * from public.reader_organizer_links')).rows).toEqual([])
 await expect(connection('enable',null,a.secret!)).rejects.toThrow('different account')
 await asUser();expect(await connection('status')).toEqual({enabled:true})
})
it('rotates only the requesting installation and revokes all managed devices on disconnect',async()=>{
 const a=await connection('restore',installation)
 await connection('restore',installation)
 await db.exec('reset role')
 expect((await db.query('select * from public.userscript_devices where secret_hash=encode(sha256(convert_to($1,\'UTF8\')),\'hex\')',[a.secret])).rows).toHaveLength(0)
 expect((await db.query('select * from public.reader_organizer_devices where user_id=$1',[owner])).rows).toHaveLength(2)
 await asUser();await connection('disable');expect(await connection('restore',installation)).toEqual({enabled:false})
 await db.exec('reset role');expect((await db.query('select * from public.userscript_devices where user_id=$1',[owner])).rows).toHaveLength(0);await asUser()
})
it('adopts an existing verified paired credential but rejects other accounts',async()=>{
 const secret='a'.repeat(64)
 await db.exec('reset role')
 await db.query("insert into public.userscript_devices(user_id,name,secret_hash,paired,expires_at) values($1,'Existing Reader',encode(sha256(convert_to($2,'UTF8')),'hex'),true,now()+interval '1 day')",[owner,secret])
 await asUser(other);await expect(connection('enable',installation,secret)).rejects.toThrow('different account')
 await asUser();expect(await connection('enable',installation,secret)).toEqual({enabled:true})
 await connection('disable');await db.exec('reset role');expect((await db.query('select * from public.userscript_devices where user_id=$1',[owner])).rows).toHaveLength(0);await asUser()
})
it('binds one-time handoffs to verifier, origin, expiry, and a current account association',async()=>{
 await connection('enable');await db.exec('reset role')
 const code='b'.repeat(64),challenge='c'.repeat(64),origin='https://reader.example'
 await db.query('insert into public.app_login_handoffs(code_hash,challenge,user_id,target_origin) values($1,$2,$3,$4)',[code,challenge,owner,origin])
 await asUser();await expect(db.query('select * from public.app_login_handoffs')).rejects.toThrow();await expect(db.query('select public.consume_app_login_handoff($1,$2,$3)',[code,challenge,origin])).rejects.toThrow()
 await db.exec('reset role;set role service_role')
 const consume=async(hash=code,proof=challenge,target=origin)=>(await db.query<{id:string|null}>('select public.consume_app_login_handoff($1,$2,$3) id',[hash,proof,target])).rows[0].id
 expect(await consume(code,'d'.repeat(64))).toBeNull();expect(await consume(code,challenge,'https://attacker.example')).toBeNull()
 expect(await consume()).toBe(owner);expect(await consume()).toBeNull()
 await db.query("insert into public.app_login_handoffs values($1,$2,$3,$4,now()-interval '1 second')",[code,challenge,owner,origin]);expect(await consume()).toBeNull()
 await db.query("update public.app_login_handoffs set expires_at=now()+interval '1 minute'");await db.query('delete from public.reader_organizer_links where user_id=$1',[owner]);expect(await consume()).toBeNull();await asUser()
})
