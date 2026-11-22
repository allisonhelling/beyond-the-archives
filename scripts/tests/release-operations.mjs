import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { stagingSessions } from '../staging-fixtures.mjs'
import { productionConfiguration } from '../production-configuration.mjs'
import { recoveryCategories, recoveryExpiry, packRecovery, unpackRecovery, validateRecoveryPlan } from '../recovery-bundle.mjs'

const profile = { VITE_APP_ENV: 'staging', VITE_SUPABASE_PROJECT_REF: 'vzqrpjzfwcuuiqxanyoy', VITE_SUPABASE_URL: 'https://vzqrpjzfwcuuiqxanyoy.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', VITE_ORGANIZER_URL: 'https://organizer-staging.example', VITE_READER_URL: 'https://reader-staging.example' }
const project = { ref: 'vzqrpjzfwcuuiqxanyoy', name: 'beyond-the-archives-staging', region: 'us-east-1', status: 'ACTIVE_HEALTHY' }
const env = { STAGING_USER_A_TOKEN: 'a', STAGING_USER_B_TOKEN: 'b', STAGING_ADMIN_TOKEN: 'admin', STAGING_OWNER_TOKEN: 'owner' }
test('staging sessions refuse production and incomplete tokens before creating clients', async () => {
 let clients = 0
 for (const bad of [{ ...profile, VITE_APP_ENV: 'production' }, { ...profile, VITE_SUPABASE_PROJECT_REF: 'other' }]) await assert.rejects(stagingSessions({ profile: bad, env, clientFactory: () => { clients++ } }))
 await assert.rejects(stagingSessions({ profile, env: {}, clientFactory: () => { clients++ } }))
 assert.equal(clients, 0)
})
test('real-session setup verifies GoTrue, live roles, distinct identities and retained owner/audit state', async () => {
 let state = { owners: 1, bootstraps: 1, audit_count: 10 }, verified = 0
 const read = async action => action === 'project' ? project : [state]
 const clientFactory = (url, key, options) => {
  const token = options.global.headers?.Authorization?.slice(7), index = Object.values(env).indexOf(token)
  return { auth: { getUser: async actual => { assert.equal(actual, token); verified++; return { data: { user: { id: `synthetic-${index}`, email_confirmed_at: 'confirmed' } } } } }, rpc: async () => index < 0 ? { error: {} } : { data: { role: ['user', 'user', 'admin', 'owner'][index] } } }
 }
 const fixture = await stagingSessions({ profile, env, read, clientFactory })
 assert.equal(verified, 4)
 state = { ...state, audit_count: 11 }
 await fixture.verifyRetainedState()
 state = { ...state, audit_count: 9 }
 await assert.rejects(fixture.verifyRetainedState())
 state = { ...state, owners: 0 }
 await assert.rejects(stagingSessions({ profile, env, read, clientFactory }))
})
test('production candidates use a provider-bound public key and exact callbacks without disclosing private responses', async () => {
 const read = async path => path === '' ? { ref: 'pnrdztfydurupcqwumvr', name: 'Beyond the Archives', region: 'us-east-1', organization_id: 'vosrfpinkplcjgnjmnob', status: 'ACTIVE_HEALTHY' } : path === '/api-keys' ? [{ api_key: 'sb_secret_do_not_export' }, { api_key: 'sb_publishable_verified' }] : path === '/secrets' ? [{ name: 'APP_ORIGIN', value: 'private-origin-value' }] : { smtp_pass: 'private-password' }
 const result = await productionConfiguration(read)
 assert.equal(result.backendPublicKeyVerified, true)
 assert.equal(result.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_verified')
 assert.ok(result.vercelBindings.every(binding => binding.environment === 'production' && binding.gitBranch === null))
 assert.equal(result.desiredAuth.uri_allow_list, 'https://beyondthearchives.vercel.app/auth/callback,https://bta-reader.vercel.app/auth/callback,https://archivesunfolded.vercel.app/auth/callback')
 assert.doesNotMatch(JSON.stringify(result), /sb_secret_|private-password|private-origin-value/)
 await assert.rejects(productionConfiguration(async () => ({ ref: 'vzqrpjzfwcuuiqxanyoy' })))
})
test('encrypted full-coverage synthetic bundle round trip rejects tampering, wrong keys, overwrite, missing classes and stale points', async t => {
 const directory = await mkdtemp(join(tmpdir(), 'bta-recovery-'))
 t.after(() => rm(directory, { recursive: true, force: true }))
 const assets = []
 for (const category of recoveryCategories) {
  const path = join(directory, `${category}.bin`)
  await writeFile(path, category === 'storage-bytes' ? randomBytes(1024 * 1024) : `Synthetic ${category}`)
  assets.push({ category, path, capturedAt: new Date().toISOString() })
 }
 const plan = { version: 1, environment: 'synthetic', retentionClass: 'daily', consistencyReference: 'synthetic-quiesced-fixture', keyCustodyReference: 'in-memory-test-only', operator: 'test', approvalReference: 'synthetic-test', assets }
 assert.throws(() => validateRecoveryPlan({ ...plan, assets: assets.slice(1) }))
 assert.throws(() => validateRecoveryPlan({ ...plan, assets: assets.map(asset => ({ ...asset, capturedAt: '2020-01-01' })) }))
 const key = randomBytes(32), bundle = join(directory, 'bundle')
 assert.equal((await packRecovery(plan, bundle, key)).categories, 7)
 await assert.rejects(packRecovery(plan, bundle, key))
 await assert.rejects(unpackRecovery(bundle, join(directory, 'wrong-key'), randomBytes(32)))
 const output = join(directory, 'recovered')
 const receipt = await unpackRecovery(bundle, output, key)
 assert.equal(receipt.providerRecoveryExercised, false)
 assert.ok(receipt.maximumRecoverableDataAgeHours < 24)
 for (const [index, asset] of assets.entries()) assert.deepEqual(await readFile(join(output, `${index}-${asset.category}.bin`)), await readFile(asset.path))
 await assert.rejects(unpackRecovery(bundle, output, key))
 const encrypted = await readFile(join(bundle, '0.enc'))
 encrypted[0] ^= 1
 await writeFile(join(bundle, '0.enc'), encrypted)
 await assert.rejects(unpackRecovery(bundle, join(directory, 'corrupt'), key))
 await assert.rejects(readFile(join(directory, 'corrupt', 'verified-files.json')))
})
test('retention uses approved calendar periods including leap years', () => {
 assert.equal(recoveryExpiry('2026-11-17T00:00:00Z', 'daily'), '2026-12-17T00:00:00.000Z')
 assert.equal(recoveryExpiry('2026-11-17T00:00:00Z', 'weekly'), '2027-02-09T00:00:00.000Z')
 assert.equal(recoveryExpiry('2024-02-29T12:00:00Z', 'monthly'), '2025-02-28T12:00:00.000Z')
 assert.throws(() => recoveryExpiry('2026-11-17', 'forever'))
})
