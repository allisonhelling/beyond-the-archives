// Real hosted sessions only. No service key, account creation, owner bootstrap,
// SQL teardown, token fabrication, session refresh or audit deletion.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { requireEnvironmentConfig, stagingProjectRef } from '../src/lib/environment.ts'
import { validateBrowserEnv } from './build-env.ts'
import { stagingManagementToken, stagingReadClient, verifiedStagingProject } from './staging-target.mjs'

export const stagingIdentities = Object.freeze(['User A', 'User B', 'Admin', 'Owner'])
const roles = ['user', 'user', 'admin', 'owner']
export const fixtureResult = result => {
 if (result.error) throw new Error('Staging fixture request failed; response details withheld. Inspect committed state before retrying.')
 return result.data
}

export async function stagingSessions({ env = process.env, profile, read, clientFactory = createClient } = {}) {
 const publicEnv = profile ?? parseEnv(await readFile(new URL('../.env.staging.local', import.meta.url), 'utf8'))
 validateBrowserEnv(publicEnv, true, {}, false)
 const config = requireEnvironmentConfig(publicEnv)
 assert.equal(config.environment, 'staging')
 assert.equal(config.projectRef, stagingProjectRef)
 const tokens = ['STAGING_USER_A_TOKEN', 'STAGING_USER_B_TOKEN', 'STAGING_ADMIN_TOKEN', 'STAGING_OWNER_TOKEN'].map(name => env[name])
 assert.ok(tokens.every(token => typeof token === 'string' && token.length > 0), 'Provide all four real staging access tokens through the process environment.')
 assert.equal(new Set(tokens).size, 4, 'Sessions must be distinct.')
 const inventory = read ?? stagingReadClient({ token: stagingManagementToken(env) })
 await verifiedStagingProject(inventory)
 const state = async () => {
  const [row] = await inventory('query', "select (select count(*)::int from public.user_roles where role_id='owner') owners, (select count(*)::int from public.admin_audit_logs) audit_count, (select count(*)::int from public.admin_audit_logs where action='bootstrap_owner' and outcome='succeeded') bootstraps")
  assert.equal(row.owners, 1, 'An independently established persistent Owner is required.')
  assert.equal(row.bootstraps, 1, 'Retain the original bootstrap audit history.')
  return row
 }
 const before = await state()
 const client = token => clientFactory(config.url, config.key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { ...(token && { headers: { Authorization: `Bearer ${token}` } }), fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(65000) }) },
 })
 const accounts = []
 for (const [index, token] of tokens.entries()) {
  const c = client(token)
  // getUser verifies the token with GoTrue; decoding a JWT is not authentication.
  const user = fixtureResult(await c.auth.getUser(token)).user
  assert.ok(user?.id && user.email_confirmed_at && !user.is_anonymous)
  const access = fixtureResult(await c.rpc('app_access'))
  assert.equal(access.role, roles[index], 'Live application role must match the fixture identity.')
  accounts.push({ identity: stagingIdentities[index], id: user.id, client: c, token, entries: [] })
 }
 assert.equal(new Set(accounts.map(account => account.id)).size, 4, 'Four distinct Auth users are required.')
 const anonymous = client()
 assert.ok((await anonymous.rpc('app_access')).error, 'Anonymous access must be denied.')
 return { config, accounts, anonymous, async verifyRetainedState() {
  const after = await state()
  assert.ok(after.audit_count >= before.audit_count, 'Administrative history must be retained.')
  for (const [index, account] of accounts.entries()) assert.equal(fixtureResult(await account.client.rpc('app_access')).role, roles[index])
 } }
}

export async function stagingAudit(account) {
 const result = fixtureResult(await account.client.rpc('admin_access', { p_request_id: crypto.randomUUID(), p_action: 'read_audit' }))
 if (['Admin', 'Owner'].includes(account.identity)) {
  assert.equal(result.ok, true, 'Admin/Owner require recent real TOTP and audit permission.')
  for (const event of result.events) assert.deepEqual(Object.keys(event).sort(), ['action', 'id', 'occurred_at', 'outcome', 'request_id'])
 } else assert.equal(result.code, 'forbidden')
 return result
}
