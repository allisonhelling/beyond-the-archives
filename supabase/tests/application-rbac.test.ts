// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared embedded PostgreSQL migration harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite
const migration = '20261116000100_application_rbac.sql'
const ids = ['user','other','admin','owner','successor','pending','banned'] as const
type Identity = typeof ids[number]
const id = (name: Identity) => `82000000-0000-0000-0000-${String(ids.indexOf(name)+1).padStart(12,'0')}`
const factor = (name: Identity) => id(name).replace('82000000','83000000')
const session = (name: Identity) => id(name).replace('82000000','84000000')
type Result = { ok: boolean; code: string; request_id: string; events?: Record<string, unknown>[] }

async function actor(name: Identity, claims: Record<string, unknown> = {}) {
 await db.exec('reset role;set role authenticated')
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id(name),JSON.stringify({sub:id(name),role:'authenticated',aal:'aal2',session_id:session(name),...claims})])
}
async function access() { return (await db.query<{ result: { role: string; permissions: string[] } }>('select public.app_access() result')).rows[0].result }
async function action(name: string, target: string | null = null, permission: string | null = null, enabled: boolean | null = null, request = randomUUID()) {
 return (await db.query<{ result: Result }>('select public.admin_access($1,$2,$3,$4,$5) result',[request,name,target,permission,enabled])).rows[0].result
}
async function maintenance(name = 'bootstrap_owner', target = id('owner'), request = randomUUID()) {
 await db.exec('reset role')
 return db.query('select public.app_owner_maintenance($1,$2,$3,$4)',[request,name,target,'S2_LOCAL_TEST'])
}
async function denied(sql: string, parameters: unknown[] = [], message: string | RegExp = /permission denied/) {
 await db.exec('savepoint denied')
 try { await expect(parameters.length ? db.query(sql,parameters) : db.exec(sql)).rejects.toThrow(message) }
 finally { await db.exec('rollback to savepoint denied;release savepoint denied') }
}
async function role(name: Identity) {
 await db.exec('reset role')
 return (await db.query<{ role_id: string }>('select role_id from public.user_roles where user_id=$1',[id(name)])).rows[0]?.role_id
}
async function bootstrap() {
 await maintenance()
 await actor('owner')
 expect(await action('assign_admin',id('admin'))).toMatchObject({ok:true})
}

beforeAll(async () => {
 db = await createTestDatabase({ beforeMigration: migration })
 await db.query("insert into auth.users(id,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,now(),'{\"role\":\"owner\"}','{\"role\":\"admin\"}')",[id('user')])
 await db.exec(await readFile(new URL(`../migrations/${migration}`,import.meta.url),'utf8'))
},30000)
beforeEach(async () => {
 await db.exec('begin')
 for (const name of ids) {
  if (name!=='user') await db.query('insert into auth.users(id,email_confirmed_at,banned_until) values($1,$2,$3)',[id(name),name==='pending'?null:new Date().toISOString(),name==='banned'?new Date(Date.now()+86400000).toISOString():null])
  await db.query("insert into auth.mfa_factors values($1,$2,'totp','verified')",[factor(name),id(name)])
  await db.query("insert into auth.sessions values($1,$2,$3,'aal2',null)",[session(name),id(name),factor(name)])
  await db.query("insert into auth.mfa_amr_claims values($1,'totp',clock_timestamp())",[session(name)])
 }
})
afterEach(async () => { await db.exec('rollback;reset role;reset request.jwt.claim.sub;reset request.jwt.claims') })
afterAll(async () => { await db?.close() })

it('backfills existing accounts and defaults new accounts to user despite forged metadata',async () => {
 for (const name of ['user','other'] as const) {
  await actor(name,{app_metadata:{role:'owner'},user_metadata:{role:'owner'}})
  expect(await access()).toEqual({role:'user',permissions:[]})
 }
 expect((await db.query<{ current_user: string }>('select current_user')).rows[0].current_user).toBe('authenticated')
})

it('limits EXECUTE and denies all API roles direct table/sequence access',async () => {
 await db.exec('reset role')
 for (const apiRole of ['anon','authenticated','service_role']) {
  for (const table of ['app_roles','app_permissions','role_permissions','user_roles','admin_audit_logs']) {
   const row = (await db.query<{ allowed: boolean }>("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[apiRole,`public.${table}`])).rows[0]
   expect(row.allowed).toBe(false)
  }
  expect((await db.query<{ allowed: boolean }>("select has_sequence_privilege($1,'public.admin_audit_logs_id_seq','USAGE,SELECT,UPDATE') allowed",[apiRole])).rows[0].allowed).toBe(false)
  const functions=(await db.query<{ proname: string; allowed: boolean }>(`select proname,has_function_privilege($1,p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('initialize_app_role','protect_admin_audit','check_app_owner','protect_app_owner_identity','app_actor','app_access','admin_access','app_owner_maintenance')`,[apiRole])).rows
  expect(functions).toHaveLength(8)
  for (const fn of functions) expect(fn.allowed).toBe(apiRole==='authenticated'&&['app_access','admin_access'].includes(fn.proname))
 }
 const definers=(await db.query<{ proconfig: string[] }>("select proconfig from pg_proc where proname in ('initialize_app_role','check_app_owner','protect_app_owner_identity','app_actor','app_access','admin_access','app_owner_maintenance') and prosecdef")).rows
 expect(definers).toHaveLength(7)
 expect(definers.every(fn=>fn.proconfig.includes('search_path=""'))).toBe(true)
 await db.exec('set role anon')
 await denied('select public.admin_access($1,$2)',[randomUUID(),'read_audit'])
 await denied('select public.app_access()')
 await db.exec('reset role;set role service_role')
 await denied('select public.app_owner_maintenance($1,$2,$3,$4)',[randomUUID(),'bootstrap_owner',id('owner'),'S2_LOCAL_TEST'])
})

it('bootstraps one eligible owner once and logs infrastructure authority separately',async () => {
 await maintenance()
 expect(await role('owner')).toBe('owner')
 await denied('select public.app_owner_maintenance($1,$2,$3,$4)',[randomUUID(),'bootstrap_owner',id('other'),'S2_LOCAL_TEST'],/state does not match/)
 const event=(await db.query<{ actor_id: null; actor_role: string; action: string }>("select actor_id,actor_role,action from public.admin_audit_logs")).rows[0]
 expect(event).toEqual({actor_id:null,actor_role:'infrastructure',action:'bootstrap_owner'})
})

it('denies bootstrap for unconfirmed, banned, absent and MFA-unverified successors',async () => {
 for (const name of ['pending','banned'] as const) await denied('select public.app_owner_maintenance($1,$2,$3,$4)',[randomUUID(),'bootstrap_owner',id(name),'S2_LOCAL_TEST'],/confirmed, active and MFA-enrolled/)
 await db.query("update auth.mfa_factors set status='unverified' where user_id=$1",[id('owner')])
 await denied('select public.app_owner_maintenance($1,$2,$3,$4)',[randomUUID(),'bootstrap_owner',id('owner'),'S2_LOCAL_TEST'],/confirmed, active and MFA-enrolled/)
 await denied('select public.app_owner_maintenance($1,$2,$3,$4)',[randomUUID(),'bootstrap_owner',randomUUID(),'S2_LOCAL_TEST'],/confirmed, active and MFA-enrolled/)
})

it('denies user and admin self-promotion, promotion of others and owner targeting',async () => {
 await bootstrap()
 for (const name of ['user','admin'] as const) {
  await actor(name,{app_metadata:{role:'owner'},user_metadata:{role:'owner'}})
  for (const target of [id(name),id('owner'),id('other')]) for (const operation of ['assign_admin','revoke_admin','transfer_owner']) {
   expect(await action(operation,target)).toMatchObject({ok:false,code:'forbidden'})
  }
  expect(await action('set_admin_permission',null,'audit.read_limited',false)).toMatchObject({ok:false,code:'forbidden'})
  await denied('update public.user_roles set role_id=$1 where user_id=$2',['owner',id(name)])
 }
 expect(await role('owner')).toBe('owner')
 expect(await role('admin')).toBe('admin')
})

it('lets the owner grant and revoke only eligible ordinary admin assignments atomically',async () => {
 await maintenance()
 await actor('owner')
 const request=randomUUID()
 expect(await action('assign_admin',id('other'),null,null,request)).toMatchObject({ok:true,code:'ok'})
 expect(await role('other')).toBe('admin')
 const event=(await db.query<{ actor_id: string; target_id: string; previous_role: string; next_role: string; outcome: string }>('select actor_id,target_id,previous_role,next_role,outcome from public.admin_audit_logs where request_id=$1',[request])).rows[0]
 expect(event).toEqual({actor_id:id('owner'),target_id:id('other'),previous_role:'user',next_role:'admin',outcome:'succeeded'})
 await actor('owner')
 expect(await action('assign_admin',id('other'))).toMatchObject({ok:false,code:'invalid_transition'})
 expect(await action('revoke_admin',id('other'))).toMatchObject({ok:true})
 expect(await role('other')).toBe('user')
})

it('rejects forged targets, self-targets, ambiguous parameters and speculative permissions',async () => {
 await bootstrap()
 await actor('owner')
 for (const target of [id('pending'),id('banned'),randomUUID()]) expect(await action('assign_admin',target)).toMatchObject({ok:false,code:'ineligible_target'})
 expect(await action('revoke_admin',id('owner'))).toMatchObject({ok:false,code:'invalid_request'})
 expect(await action('assign_admin',id('other'),'audit.read_limited')).toMatchObject({ok:false,code:'invalid_request'})
 for (const permission of ['library.read','roles.assign_admin','service_role',null]) expect(await action('set_admin_permission',null,permission,true)).toMatchObject({ok:false,code:'invalid_request'})
 for (const operation of ['suspend','impersonate','support_access','owner','drop table user_roles']) expect(await action(operation,id('user'))).toMatchObject({ok:false,code:'invalid_request'})
})

it('requires fresh live MFA rather than a forged aal or new JWT iat',async () => {
 await bootstrap()
 await db.exec('reset role')
 await db.query("update auth.mfa_amr_claims set updated_at=clock_timestamp()-interval '6 minutes' where session_id=$1",[session('owner')])
 await actor('owner',{iat:Math.floor(Date.now()/1000),amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]})
 expect(await action('assign_admin',id('other'))).toMatchObject({ok:false,code:'fresh_mfa_required'})
 await db.exec('reset role')
 await db.query('update auth.mfa_amr_claims set updated_at=clock_timestamp() where session_id=$1',[session('owner')])
 await actor('owner',{aal:'aal1'})
 expect(await action('assign_admin',id('other'))).toMatchObject({ok:false,code:'fresh_mfa_required'})
 await actor('owner',{session_id:session('other')})
 expect(await action('assign_admin',id('other'))).toMatchObject({ok:false,code:'fresh_mfa_required'})
})

it('rejects removed sessions, expired sessions and revoked factors despite old aal2 JWTs',async () => {
 await bootstrap()
 for (const update of ["update auth.sessions set not_after=clock_timestamp()-interval '1 second' where user_id=$1","update auth.mfa_factors set status='unverified' where user_id=$1",'delete from auth.sessions where user_id=$1']) {
  await db.exec('reset role;savepoint session_state')
  await db.query(update,[id('owner')])
  await actor('owner')
  expect(await action('assign_admin',id('other'))).toMatchObject({ok:false,code:'fresh_mfa_required'})
  await db.exec('reset role;rollback to savepoint session_state;release savepoint session_state')
 }
})

it('revalidates role and permission revocation with unchanged stale claims',async () => {
 await bootstrap()
 await actor('admin',{app_metadata:{role:'admin'}})
 expect(await action('read_audit')).toMatchObject({ok:true})
 await actor('owner')
 expect(await action('set_admin_permission',null,'audit.read_limited',false)).toMatchObject({ok:true})
 await actor('admin',{app_metadata:{role:'admin',permissions:['audit.read_limited']}})
 expect(await action('read_audit')).toMatchObject({ok:false,code:'forbidden'})
 await actor('owner')
 expect(await action('set_admin_permission',null,'audit.read_limited',true)).toMatchObject({ok:true})
 expect(await action('revoke_admin',id('admin'))).toMatchObject({ok:true})
 await actor('admin',{app_metadata:{role:'admin',permissions:['audit.read_limited']}})
 expect(await action('read_audit')).toMatchObject({ok:false,code:'forbidden'})
 expect(await access()).toEqual({role:'user',permissions:[]})
})

it('returns a redacted bounded audit with admin rows restricted to the caller',async () => {
 await bootstrap()
 await actor('user');expect(await action('assign_admin',id('user'))).toMatchObject({ok:false})
 await actor('admin')
 const request=randomUUID()
 expect(await action('read_audit',null,null,null,request)).toMatchObject({ok:true})
 const replay=await action('read_audit',null,null,null,request)
 expect(replay).toMatchObject({ok:false,code:'request_already_used'})
 expect(replay.events).toBeUndefined()
 const adminEvents=(await action('read_audit')).events!
 expect(adminEvents.every(e=>e.action==='read_audit')).toBe(true)
 await actor('owner')
 const ownerEvents=(await action('read_audit')).events!
 expect(ownerEvents.length).toBeGreaterThan(adminEvents.length)
 for (const e of ownerEvents) expect(Object.keys(e).sort()).toEqual(['action','id','occurred_at','outcome','request_id'])
 await denied('select * from public.admin_audit_logs')
})

it('retains denial records, rejects replay with changed parameters and never repeats a mutation',async () => {
 await bootstrap()
 await actor('user')
 const deniedRequest=randomUUID()
 expect(await action('assign_admin',id('user'),null,null,deniedRequest)).toMatchObject({ok:false,code:'forbidden'})
 await actor('owner')
 const request=randomUUID()
 expect(await action('assign_admin',id('other'),null,null,request)).toMatchObject({ok:true})
 expect(await action('revoke_admin',id('other'),null,null,request)).toMatchObject({ok:false,code:'request_already_used'})
 expect(await role('other')).toBe('admin')
 const records=(await db.query<{ outcome: string; code: string }>('select outcome,code from public.admin_audit_logs where request_id=$1',[deniedRequest])).rows
 expect(records).toEqual([{outcome:'denied',code:'forbidden'}])
})

it('protects audit rows against user/admin/owner tampering and operator UPDATE/DELETE/TRUNCATE',async () => {
 await bootstrap()
 for (const name of ['user','admin','owner'] as const) {
  await actor(name)
  for (const sql of ['delete from public.admin_audit_logs',"update public.admin_audit_logs set code='ok'",'truncate public.admin_audit_logs',"insert into public.admin_audit_logs(request_id,actor_role,action,outcome,code) values(gen_random_uuid(),'infrastructure','assign_admin','succeeded','ok')"]) await denied(sql)
 }
 await db.exec('reset role')
 for (const sql of ['delete from public.admin_audit_logs',"update public.admin_audit_logs set code='ok'",'truncate public.admin_audit_logs']) await denied(sql,[],/append-only/)
})

it('rolls back role mutation if the trusted audit writer fails',async () => {
 await bootstrap()
 await db.exec(`reset role;create function public.fail_s2_audit() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Injected audit failure'; end $$;
  create trigger fail_s2_audit before insert on public.admin_audit_logs for each row when (new.action in ('assign_admin','transfer_owner')) execute function public.fail_s2_audit()`)
 await actor('owner')
 await denied('select public.admin_access($1,$2,$3)',[randomUUID(),'assign_admin',id('other')],/Injected audit failure/)
 expect(await role('other')).toBe('user')
 await actor('owner')
 await denied('select public.admin_access($1,$2,$3)',[randomUUID(),'transfer_owner',id('successor')],/Injected audit failure/)
 expect(await role('owner')).toBe('owner')
 expect(await role('successor')).toBe('user')
})

it('transfers ownership atomically and rejects the former owner with a stale token',async () => {
 await bootstrap()
 await actor('owner')
 expect(await action('transfer_owner',id('successor'))).toMatchObject({ok:true})
 expect(await role('owner')).toBe('user')
 expect(await role('successor')).toBe('owner')
 await actor('owner',{app_metadata:{role:'owner'}})
 expect(await action('assign_admin',id('other'))).toMatchObject({ok:false,code:'forbidden'})
 await actor('successor')
 expect(await action('assign_admin',id('other'))).toMatchObject({ok:true})
 await db.exec('reset role;set constraints all immediate')
})

it('prevents deleting, demoting, duplicating or disabling the last owner',async () => {
 await bootstrap()
 await db.exec('reset role')
 for (const sql of [`delete from auth.users where id='${id('owner')}'`,`update auth.users set banned_until=now()+interval '1 day' where id='${id('owner')}'`,`update auth.users set email_confirmed_at=null where id='${id('owner')}'`,`update auth.users set deleted_at=now() where id='${id('owner')}'`,`update auth.users set is_anonymous=true where id='${id('owner')}'`]) await denied(sql,[],/before (deleting|disabling) the owner/)
 await denied(`update public.user_roles set role_id='user' where user_id='${id('owner')}';set constraints all immediate`,[],/Exactly one active/)
 await denied(`delete from public.user_roles where user_id='${id('owner')}';set constraints all immediate`,[],/Exactly one active/)
 await denied(`update public.user_roles set role_id='owner' where user_id='${id('other')}'`,[],/duplicate key/)
 // Ordinary Auth deletion keeps its existing cascade behavior.
 await db.query('delete from auth.users where id=$1',[id('other')])
 expect(await role('other')).toBeUndefined()
})

it('supports infrastructure recovery after factor loss and keeps bootstrap permanently closed',async () => {
 await bootstrap()
 await db.exec('reset role')
 await db.query("update auth.mfa_factors set status='unverified' where user_id=$1",[id('owner')])
 await actor('owner')
 expect(await action('transfer_owner',id('successor'))).toMatchObject({ok:false,code:'fresh_mfa_required'})
 await maintenance('recover_owner',id('successor'))
 expect(await role('successor')).toBe('owner')
 expect(await role('owner')).toBe('user')
 await denied('select public.app_owner_maintenance($1,$2,$3,$4)',[randomUUID(),'bootstrap_owner',id('other'),'S2_LOCAL_TEST'],/state does not match/)
})

it('recovers a deleted owner identity caused by privileged infrastructure corruption',async () => {
 await bootstrap()
 await db.exec(`reset role;set constraints all immediate;
  alter table public.user_roles disable trigger check_app_owner;
  alter table auth.users disable trigger protect_app_owner_identity;
  delete from auth.users where id='${id('owner')}';
  alter table auth.users enable trigger protect_app_owner_identity;
  alter table public.user_roles enable trigger check_app_owner`)
 await maintenance('recover_owner',id('successor'))
 expect(await role('successor')).toBe('owner')
 await actor('owner')
 await denied('select public.app_access()',[],/Sign in with a confirmed account/)
 await db.exec('reset role')
 await db.exec('set constraints all immediate')
})

it('gives every app role only their own library RLS access with no forged ownership',async () => {
 await bootstrap()
 await db.exec('reset role')
 for (const [index,name] of (['user','other','admin','owner'] as const).entries()) {
  const work=`85000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`
  await db.query('insert into public.works(id,ao3_work_id,title) values($1,$2,$3)',[work,99000001+index,'Synthetic Private Story'])
  await db.query('insert into public.library_entries(user_id,work_id,original_url,notes) values($1,$2,$3,$4)',[id(name),work,`https://archiveofourown.org/works/${99000001+index}`,`Private ${name}`])
 }
 for (const name of ['user','admin','owner'] as const) {
  await actor(name)
  expect((await db.query<{ user_id: string }>('select user_id from public.library_entries')).rows).toEqual([{user_id:id(name)}])
  expect((await db.query("update public.library_entries set notes='forged' where user_id=$1 returning id",[id('other')])).rows).toEqual([])
  expect((await db.query('delete from public.library_entries where user_id=$1 returning id',[id('other')])).rows).toEqual([])
  await denied('update public.library_entries set user_id=$1 where user_id=$2',[id('other'),id(name)])
 }
})
