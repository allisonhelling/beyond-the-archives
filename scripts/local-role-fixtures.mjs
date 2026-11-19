// Shared synthetic local role/MFA fixtures. Never accepts a hosted target.
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { localProjectId } from './local-target.mjs'
import { checked, createSyntheticAccounts, removeSyntheticAccounts } from './local-fixtures.mjs'

export function localSql(query) {
 const result=spawnSync('docker',['exec','-i',`supabase_db_${localProjectId}`,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8',timeout:30000})
 if(result.status!==0) throw new Error('Local RBAC SQL fixture operation failed; database output withheld.')
 return result.stdout.trim()
}
function totp(secret) {
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
 const bits=[...secret.toUpperCase().replace(/=+$/,'')].map(char=>{
  const index=alphabet.indexOf(char)
  if(index<0)throw new Error('Invalid synthetic MFA secret.')
  return index.toString(2).padStart(5,'0')
 }).join('')
 const key=Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)))
 const counter=Buffer.alloc(8)
 counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
 const digest=createHmac('sha1',key).update(counter).digest()
 return String((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).padStart(6,'0')
}
const syntheticFactors=new WeakMap()
function mfaResult(response,step,onFailure) {
 if(response.error) {
  const code=/^[a-z_]+$/.test(response.error.code)?response.error.code:'unknown'
  onFailure(`${step} (Auth code ${code}, status ${Number(response.error.status)||0})`)
 }
 return checked(response)
}
export async function verifySyntheticMfa(account, onFailure = () => {}) {
 const factor=syntheticFactors.get(account)
 if(!factor)throw new Error('Synthetic TOTP factor unavailable.')
 const challenge=mfaResult(await account.client.auth.mfa.challenge({factorId:factor.id}),'challenging synthetic TOTP',onFailure)
 mfaResult(await account.client.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.secret)}),'verifying synthetic TOTP',onFailure)
 return checked(await account.client.auth.getSession()).session.access_token
}
export async function enrollSyntheticMfa(account, onFailure = () => {}) {
 const enrolled=mfaResult(await account.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic S2 Test'}),'enrolling synthetic TOTP',onFailure)
 syntheticFactors.set(account,{id:enrolled.id,secret:enrolled.totp.secret})
 return verifySyntheticMfa(account,onFailure)
}
export const sqlUuid=value=>{if(!/^[0-9a-f-]{36}$/.test(value))throw new Error('Invalid synthetic fixture ID.');return `'${value}'`}

export function assertNoApplicationOwner() {
 const state=JSON.parse(localSql("select json_build_object('owners',(select count(*) from public.user_roles where role_id='owner'),'bootstrap',(select count(*) from public.admin_audit_logs where action='bootstrap_owner' and outcome='succeeded'))"))
 assert.deepEqual(state,{owners:0,bootstrap:0},'Run before operator bootstrap; existing owner state must be preserved.')
}
export async function removeSyntheticRoleAccounts(clients,accounts,requests) {
 if(!accounts.length)return
 if(accounts.some(account=>!/^s1-[a-f0-9-]+@example\.test$/.test(account.email)))throw new Error('Refusing non-synthetic role cleanup.')
 const accountIds=accounts.map(account=>sqlUuid(account.id)).join(',')
 const requestIds=[...new Set(requests)].map(sqlUuid).join(',')
 // Infrastructure-only teardown of generated local fixtures; no hosted equivalent.
 localSql(`begin;set local session_replication_role=replica;
  ${requestIds?`delete from public.admin_audit_logs where request_id in (${requestIds}) and (actor_id in (${accountIds}) or actor_id is null and target_id in (${accountIds}));`:''}
  delete from public.user_roles where user_id in (${accountIds});commit;`)
 await removeSyntheticAccounts(clients,accounts)
}
export async function createSyntheticRoleAccounts(clients) {
 assertNoApplicationOwner()
 const accounts=await createSyntheticAccounts(clients,4),requests=[]
 try {
  const [, ,admin,owner]=accounts
  await enrollSyntheticMfa(admin)
  await enrollSyntheticMfa(owner)
  const bootstrap=randomUUID();requests.push(bootstrap)
  localSql(`select public.app_owner_maintenance(${sqlUuid(bootstrap)},'bootstrap_owner',${sqlUuid(owner.id)},'S3_LOCAL_TEST')`)
  const request=randomUUID();requests.push(request)
  const result=checked(await owner.client.rpc('admin_access',{p_request_id:request,p_action:'assign_admin',p_target:admin.id}))
  assert.equal(result.ok,true)
  for(const [index,account] of accounts.entries())account.identity=['User A','User B','Admin','Owner'][index]
  return {accounts,requests}
 }catch(error){await removeSyntheticRoleAccounts(clients,accounts,requests);throw error}
}
