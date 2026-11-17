// Real GoTrue/PostgREST/MFA and concurrent authorization checks. Local only;
// refuse an existing owner so operator-managed role state is never replaced.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { localClients, createSyntheticAccounts, checked } from './local-fixtures.mjs'
import { localSql as sql, sqlUuid as uuid, enrollSyntheticMfa, assertNoApplicationOwner, removeSyntheticRoleAccounts } from './local-role-fixtures.mjs'

const mfa=account=>enrollSyntheticMfa(account,value=>{stage=value})
let stage='verifying the isolated local stack',clients,accounts=[]
const requests=[]
try {
 if(process.argv.length!==2)throw new Error('Local RBAC tests accept no arguments or hosted overrides.')
 clients=await localClients()
 const catalog=JSON.parse(sql(`select json_build_object(
  'definers',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
   where n.nspname='public' and p.proname in ('initialize_app_role','check_app_owner','protect_app_owner_identity','app_actor','app_access','admin_access','app_owner_maintenance')
    and p.prosecdef and 'search_path=""'=any(p.proconfig) and (r.rolsuper or r.rolbypassrls)),
  'private_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('app_roles','app_permissions','role_permissions','user_roles','admin_audit_logs') and c.relrowsecurity and c.relforcerowsecurity),
  'internal_execute_grants',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role')) a(role_name)
   where n.nspname='public' and p.proname in ('initialize_app_role','protect_admin_audit','check_app_owner','protect_app_owner_identity','app_actor','app_owner_maintenance')
    and has_function_privilege(a.role_name,p.oid,'EXECUTE'))) `))
 assert.deepEqual(catalog,{definers:7,private_tables:5,internal_execute_grants:0})
 assertNoApplicationOwner()
 accounts=await createSyntheticAccounts(clients,5)
 const [user,other,admin,owner,successor]=accounts
 stage='enrolling and verifying real synthetic TOTP factors'
 const adminToken=await mfa(admin),ownerToken=await mfa(owner)
 await mfa(successor)
 const rpc=async(account,action,{target=null,permission=null,enabled=null,request=randomUUID(),token}={})=>{
  requests.push(request)
  const session=account&&checked(await account.client.auth.getSession()).session
  const response=await fetch(`${clients.target.url}/rest/v1/rpc/admin_access`,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
   headers:{apikey:clients.target.publicKey,'Content-Type':'application/json',...(token||session?{Authorization:`Bearer ${token||session.access_token}`}:{})},
   body:JSON.stringify({p_request_id:request,p_action:action,p_target:target,p_permission:permission,p_enabled:enabled}),
  })
  return {status:response.status,body:await response.json()}
 }
 const success=async(...args)=>{const result=await rpc(...args);assert.equal(result.status,200);assert.equal(result.body.ok,true);return result.body}
 const refused=async(account,action,options,code='forbidden')=>{const result=await rpc(account,action,options);assert.equal(result.body.ok,false);assert.equal(result.body.code,code);return result.body}
 stage='bootstrapping the synthetic owner through the operator-only procedure'
 const bootstrapRequest=randomUUID();requests.push(bootstrapRequest)
 sql(`select public.app_owner_maintenance(${uuid(bootstrapRequest)},'bootstrap_owner',${uuid(owner.id)},'S2_LOCAL_TEST')`)
 await success(owner,'assign_admin',{target:admin.id})
 assert.equal(checked(await user.client.rpc('app_access')).role,'user')
 assert.equal(checked(await admin.client.rpc('app_access')).role,'admin')
 assert.equal(checked(await owner.client.rpc('app_access')).role,'owner')
 console.log('PASS real MFA, controlled bootstrap and user/admin/owner authorization')

 stage='denying anonymous, user/admin escalation, forged claims and direct writes'
 assert.equal((await rpc(null,'assign_admin',{target:user.id})).status,401)
 checked(await user.client.auth.updateUser({data:{role:'owner',permissions:['roles.assign_admin']}}))
 for(const account of [user,admin])for(const target of [account.id,other.id,owner.id]) {
  await refused(account,'assign_admin',{target})
  assert.ok((await account.client.from('user_roles').update({role_id:'owner'}).eq('user_id',account.id)).error)
 }
 for(const account of [user,admin,owner])assert.ok((await account.client.rpc('app_owner_maintenance',{p_request_id:randomUUID(),p_action:'recover_owner',p_target:other.id,p_operator_reference:'S2_FORGED_REQUEST'})).error)
 assert.ok((await clients.admin.rpc('app_owner_maintenance',{p_request_id:randomUUID(),p_action:'recover_owner',p_target:other.id,p_operator_reference:'S2_FORGED_REQUEST'})).error)
 assert.ok((await clients.admin.from('user_roles').select('*')).error)
 await refused(owner,'assign_admin',{target:randomUUID()},'ineligible_target')
 await refused(owner,'revoke_admin',{target:owner.id},'invalid_request')
 const parts=ownerToken.split('.')
 parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url').toString()),sub:user.id})).toString('base64url')
 assert.equal((await rpc(user,'assign_admin',{target:other.id,token:parts.join('.')})).status,401)
 console.log('PASS anonymous/forged JWT denial, no self-promotion and no direct role writes')

 stage='checking live MFA freshness and stale role/permission claims'
 sql(`update auth.mfa_amr_claims set updated_at=clock_timestamp()-interval '6 minutes' where session_id in (select id from auth.sessions where user_id=${uuid(owner.id)}) and authentication_method='totp'`)
 await refused(owner,'assign_admin',{target:other.id,token:ownerToken},'fresh_mfa_required')
 sql(`update auth.mfa_amr_claims set updated_at=clock_timestamp() where session_id in (select id from auth.sessions where user_id=${uuid(owner.id)}) and authentication_method='totp'`)
 await success(admin,'read_audit',{token:adminToken})
 await success(owner,'set_admin_permission',{permission:'audit.read_limited',enabled:false})
 await refused(admin,'read_audit',{token:adminToken})
 await success(owner,'set_admin_permission',{permission:'audit.read_limited',enabled:true})
 await success(owner,'revoke_admin',{target:admin.id})
 await refused(admin,'read_audit',{token:adminToken})
 await success(owner,'assign_admin',{target:admin.id})
 console.log('PASS live MFA recency and immediate revocation with unchanged tokens')

 stage='verifying role-independent private-library RLS and redacted audit'
 for(const account of [user,other,admin,owner]) {
  const entries=checked(await account.client.from('library_entries').select('id,user_id'))
  assert.equal(entries.length,account.entries.length)
  assert.ok(entries.every(entry=>entry.user_id===account.id))
  const foreign=account===other?user:other
  assert.deepEqual(checked(await account.client.from('library_entries').update({notes:'Forged'}).eq('user_id',foreign.id).select('id')),[])
 }
 const audit=await success(owner,'read_audit')
 assert.ok(audit.events.length>0&&audit.events.length<=50)
 for(const event of audit.events)assert.deepEqual(Object.keys(event).sort(),['action','id','occurred_at','outcome','request_id'])
 assert.ok((await owner.client.from('admin_audit_logs').delete().eq('request_id',requests[0])).error)
 const replay=randomUUID()
 await success(owner,'assign_admin',{target:other.id,request:replay})
 await refused(owner,'revoke_admin',{target:other.id,request:replay},'request_already_used')
 console.log('PASS User A/User B/Admin/Owner library isolation, redacted audit and replay denial')

 stage='racing two owner transfers and checking the last-owner invariant'
 const transferred=await Promise.all([rpc(owner,'transfer_owner',{target:admin.id,token:ownerToken}),rpc(owner,'transfer_owner',{target:successor.id,token:ownerToken})])
 assert.equal(transferred.filter(result=>result.body.ok===true).length,1)
 assert.equal(transferred.filter(result=>result.body.code==='forbidden').length,1)
 assert.equal(Number(sql("select count(*) from public.user_roles where role_id='owner'")),1)
 await refused(owner,'assign_admin',{target:user.id,token:ownerToken})
 // Expected database errors remain inside subtransactions; neither may succeed.
 sql(`do $$ declare v_owner uuid; begin
  select user_id into v_owner from public.user_roles where role_id='owner';
  begin delete from auth.users where id=v_owner; raise exception 'Owner deletion unexpectedly succeeded';
  exception when check_violation then null; end;
  begin update public.user_roles set role_id='user' where user_id=v_owner; set constraints all immediate;
   raise exception 'Owner demotion unexpectedly succeeded'; exception when check_violation then null; end;
 end $$`)
 const deniedCount=Number(sql(`select count(*) from public.admin_audit_logs where actor_id=${uuid(user.id)} and outcome='denied'`))
 assert.ok(deniedCount>0)
 console.log('PASS concurrent owner transfer serialization, stale-owner denial and last-owner safety')
} catch {
 console.error(`Local S2 verification failed while ${stage}; credentials, account data and responses withheld.`)
 process.exitCode=1
} finally {
 if(accounts.length) {
  try {
   await removeSyntheticRoleAccounts(clients,accounts,requests)
   console.log('PASS synthetic S2 fixtures removed; no lasting owner was bootstrapped')
  } catch {
   console.error('Local S2 fixture cleanup failed; inspect the synthetic stack before rerunning.')
   process.exitCode=1
  }
 }
}
