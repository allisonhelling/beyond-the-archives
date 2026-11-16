import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stagingDeploymentClient, stagingManagementToken, stagingOperation, stagingReadClient, stagingProjectRef, verifiedStagingProject } from '../staging-target.mjs'
import { stagingInventory, migrationInventory } from '../staging-inventory.mjs'

const project = { ref: stagingProjectRef, name: 'beyond-the-archives-staging', region: 'us-east-1', status: 'ACTIVE_HEALTHY' }
test('inventory fixes every request to staging and uses the server-enforced read-only SQL endpoint', async () => {
 const calls = []
 const read = stagingReadClient({ token: 'synthetic-management-token', fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [] } } })
 await read('functions')
 await read('query', 'select count(*) from auth.users')
 assert.equal(calls[0].url, `https://api.supabase.com/v1/projects/${stagingProjectRef}/functions`)
 assert.equal(calls[0].options.method, 'GET')
 assert.equal(calls[1].url, `https://api.supabase.com/v1/projects/${stagingProjectRef}/database/query/read-only`)
 assert.equal(calls[1].options.method, 'POST')
 assert.equal(calls[1].options.redirect, 'error')
 for (const action of ['applyMigration', '../production', 'delete', 'https://production.example']) await assert.rejects(read(action))
 await assert.rejects(read('auth', 'unexpected mutation'))
 await assert.rejects(read('query'))
 assert.equal(calls.length, 2)
})
test('identity checks stop before any database inventory on mismatched or unhealthy projects', async () => {
 for (const mismatch of [{ ref: 'production' }, { name: 'production' }, { region: 'other' }, { status: 'PAUSED' }]) {
  const calls = []
  await assert.rejects(stagingInventory(async action => { calls.push(action); return { ...project, ...mismatch } }))
  assert.deepEqual(calls, ['project'])
 }
 assert.deepEqual(await verifiedStagingProject(async () => project), project)
})
test('authentication ignores ambient production tokens and does not log credential failures', () => {
 let read = false
 assert.equal(stagingManagementToken({ SUPABASE_ACCESS_TOKEN: 'production-token' }, () => { read = true; return { status: 0, stdout: 'synthetic-keychain-token\n' } }), 'synthetic-keychain-token')
 assert.ok(read)
 assert.throws(() => stagingManagementToken({}, () => ({ status: 1, stderr: 'sensitive-response' })), error => !error.message.includes('sensitive-response'))
})
test('inventory reports counts and configuration while excluding remote secrets and identities', async () => {
 const responses = { project, auth: { site_url: 'https://staging.example', smtp_host: 'private-provider', smtp_admin_email: 'private@example.test', smtp_pass: 'sensitive-password', jwt_secret: 'sensitive-jwt' }, migrations: [], functions: [{ slug: 'account-status', status: 'ACTIVE', body: 'sensitive-code' }], secrets: [{ name: 'APP_ORIGIN', value: 'sensitive-secret', digest: 'sensitive-digest' }], keys: [{ api_key: 'sensitive-key' }] }
 const queries = []
 const report = await stagingInventory(async (action, query) => {
  if (action !== 'query') return responses[action]
  queries.push(query)
  if (query.includes('from pg_class')) return [{ schema: 'auth', name: 'users', rls: true }]
  if (query.includes('count(*)')) return [{ relation: 'auth.users', count: '0' }]
  return []
 })
 assert.equal(report.mode, 'read-only')
 assert.equal(report.auth.smtpConfigured, true)
 assert.deepEqual(report.counts, [{ relation: 'auth.users', count: '0' }])
 assert.deepEqual(report.secretNames, ['APP_ORIGIN'])
 assert.doesNotMatch(JSON.stringify(report), /sensitive-|private-provider|private@example/)
 assert.ok(queries.some(query => query.includes('count(*)')))
 assert.ok(queries.every(query => !/select \*/i.test(query)))
})
test('migration inventory detects unknown history and gaps without modifying files', async () => {
 const initial = await migrationInventory([])
 assert.equal(initial.pending.length, initial.count)
 assert.match(initial.sha256, /^[a-f0-9]{64}$/)
 const [first, second] = initial.pending
 assert.equal((await migrationInventory([{ version: first.split('_')[0] }])).outOfOrder, false)
 assert.equal((await migrationInventory([{ version: second.split('_')[0] }])).outOfOrder, true)
 assert.deepEqual((await migrationInventory([{ version: 'unknown' }])).unknownVersions, ['unknown'])
})

const organizerUrl = 'https://organizer-staging.example', readerUrl = 'https://reader-staging.example'
const operation = (id = 'auth') => stagingOperation(id, 'configureAuth', { disable_signup: true })
const plan = (operations = [operation()]) => ({ version: 1, projectRef: stagingProjectRef, organizerUrl, readerUrl, operations })
const successfulFetch = calls => async (url, options) => {
 calls.push({ url, options })
 return new Response(JSON.stringify(options.method === 'GET' ? project : { smtp_pass: 'sensitive-response' }), { status: 200 })
}
test('each write re-verifies live staging identity immediately before its fixed-target request', async () => {
 const calls = []
 const deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: plan([operation('first'), operation('second')]), fetchImpl: successfulFetch(calls) })
 const receipts = await Promise.all([deploy('first'), deploy('second')])
 const root = `https://api.supabase.com/v1/projects/${stagingProjectRef}`
 assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [[root, 'GET'], [root + '/config/auth', 'PATCH'], [root, 'GET'], [root + '/config/auth', 'PATCH']])
 assert.ok(calls.every(({ options }) => options.redirect === 'error'))
 assert.deepEqual(receipts.map(receipt => receipt.projectRef), [stagingProjectRef, stagingProjectRef])
 assert.doesNotMatch(JSON.stringify(receipts), /sensitive-response|synthetic-token/)
})
test('production plans, target overrides and altered reviewed bytes are rejected before networking', () => {
 let network = false
 const create = (candidate, extra = {}) => stagingDeploymentClient({ token: 'synthetic-token', plan: candidate, fetchImpl: async () => { network = true }, ...extra })
 for (const projectRef of ['pnrdztfydurupcqwumvr', 'other-staging', '', undefined]) assert.throws(() => create({ ...plan(), projectRef }))
 for (const extra of [{ projectRef: 'production' }, { baseUrl: 'https://production.example' }, { args: ['--linked'] }, { skipVerification: true }]) assert.throws(() => create(plan(), extra))
 const changed = plan(); changed.operations[0].payload.disable_signup = false
 assert.throws(() => create(changed))
 const changedKind = plan([stagingOperation('function', 'createFunction', { slug: 'account-status', name: 'account-status', body: 'synthetic', verify_jwt: false })])
 changedKind.operations[0].action = 'updateFunction'
 assert.throws(() => create(changedKind))
 const changedId = plan(); changedId.operations[0].id = 'different-operation'
 assert.throws(() => create(changedId))
 assert.throws(() => create({ ...plan(), organizerUrl: 'https://beyondthearchives.vercel.app' }))
 assert.throws(() => create({ ...plan(), operations: [operation(), operation()] }))
 assert.equal(network, false)
})
for (const mismatch of [{ ref: 'pnrdztfydurupcqwumvr' }, { ref: stagingProjectRef, id: 'pnrdztfydurupcqwumvr' }, { name: 'production' }, { region: 'other' }, { status: 'PAUSED' }]) {
 test(`deployment rejects live identity mismatch ${JSON.stringify(mismatch)} without a write`, async () => {
  const methods = []
  const deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: plan(), fetchImpl: async (_url, options) => { methods.push(options.method); return new Response(JSON.stringify({ ...project, ...mismatch })) } })
  await assert.rejects(deploy('auth'), /refused or failed/)
  assert.deepEqual(methods, ['GET'])
 })
}
test('identity is not cached after a successful write and later failures stop queued work', async () => {
 const calls = []
 let identityReads = 0
 const deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: plan([operation('first'), operation('second'), operation('third')]), fetchImpl: async (_url, options) => {
  calls.push(options.method)
  return new Response(JSON.stringify(options.method === 'GET' ? ++identityReads === 1 ? project : { ...project, status: 'PAUSED' } : {}))
 } })
 await deploy('first')
 const outcomes = await Promise.allSettled([deploy('second'), deploy('third')])
 assert.ok(outcomes.every(outcome => outcome.status === 'rejected'))
 assert.deepEqual(calls, ['GET', 'PATCH', 'GET'])
})
test('payload snapshots cannot be changed after a client is prepared and runtime overrides are refused', async () => {
 const calls = [], candidate = plan()
 const deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: candidate, fetchImpl: successfulFetch(calls) })
 candidate.operations[0].payload.disable_signup = false
 candidate.projectRef = 'production'
 await assert.rejects(deploy('auth', { projectRef: 'production' }))
 await assert.rejects(deploy('--linked'))
 await deploy('auth')
 assert.deepEqual(JSON.parse(calls[1].options.body), { disable_signup: true })
})
test('a reviewed operation cannot be accidentally applied twice, including concurrent calls', async () => {
 const calls = [], deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: plan(), fetchImpl: successfulFetch(calls) })
 const outcomes = await Promise.allSettled([deploy('auth'), deploy('auth')])
 assert.equal(outcomes[0].status, 'fulfilled')
 assert.equal(outcomes[1].status, 'rejected')
 await assert.rejects(deploy('auth'), /already completed/)
 assert.deepEqual(calls.map(call => call.options.method), ['GET', 'PATCH'])
})
test('supported writes are bound to exact routes and preserve configured function JWT handling', async () => {
 const operations = [
  stagingOperation('migration', 'applyMigration', { name: 'synthetic_test', query: 'select 1' }),
  stagingOperation('origins', 'setOrigins', [{ name: 'APP_ORIGIN', value: organizerUrl }, { name: 'READER_ORIGIN', value: readerUrl }]),
  stagingOperation('auth', 'configureAuth', { site_url: organizerUrl, uri_allow_list: `${organizerUrl}/auth/callback,${readerUrl}/auth/callback`, mailer_autoconfirm: false, external_anonymous_users_enabled: false, smtp_host: 'sandbox.smtp.example', smtp_pass: 'sensitive-smtp-password' }),
  stagingOperation('create', 'createFunction', { slug: 'account-status', name: 'account-status', body: 'synthetic fixture only', verify_jwt: false }),
  stagingOperation('update', 'updateFunction', { slug: 'account-status', name: 'account-status', body: 'synthetic fixture only', verify_jwt: false }),
 ]
 const calls = [], deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: plan(operations), fetchImpl: successfulFetch(calls) })
 const receipts = []
 for (const { id } of operations) receipts.push(await deploy(id))
 const writes = calls.filter(call => call.options.method !== 'GET')
 assert.deepEqual(writes.map(call => [new URL(call.url).pathname.split(stagingProjectRef)[1], call.options.method]), [['/database/migrations', 'POST'], ['/secrets', 'POST'], ['/config/auth', 'PATCH'], ['/functions', 'POST'], ['/functions/account-status', 'PATCH']])
 assert.equal(JSON.parse(writes.at(-1).options.body).slug, undefined)
 assert.doesNotMatch(JSON.stringify(receipts), /sensitive-/)
})
test('unsupported actions, production payloads, extra secrets and weakened Auth settings fail closed', () => {
 let network = false
 const invalid = [
  ['reset', {}], ['deleteFunction', {}], ['query', { query: 'select 1' }],
  ['applyMigration', { name: 'bad', query: "select 'pnrdztfydurupcqwumvr'" }],
  ['applyMigration', { name: 'bad', query: 'select 1', rollback: 'drop schema public cascade' }],
  ['setOrigins', [{ name: 'SUPABASE_SERVICE_ROLE_KEY', value: 'sensitive-secret' }]],
  ['setOrigins', [{ name: 'APP_ORIGIN', value: readerUrl }, { name: 'READER_ORIGIN', value: organizerUrl }]],
  ['configureAuth', { jwt_secret: 'sensitive-secret' }], ['configureAuth', { site_url: readerUrl }],
  ['configureAuth', { uri_allow_list: `${organizerUrl}/**` }], ['configureAuth', { mailer_autoconfirm: true }],
  ['configureAuth', { external_anonymous_users_enabled: true }], ['configureAuth', { disable_signup: 'false' }],
  ['configureAuth', { hook_before_user_created_enabled: false }],
  ['createFunction', { slug: '../production', name: 'bad', body: 'synthetic', verify_jwt: false }],
  ['updateFunction', { slug: 'account-status', name: 'bad', body: 'synthetic', verify_jwt: true }],
 ]
 for (const [action, payload] of invalid) assert.throws(() => stagingDeploymentClient({ token: 'synthetic-token', plan: plan([stagingOperation('bad', action, payload)]), fetchImpl: async () => { network = true } }))
 assert.equal(network, false)
})
test('authentication and malformed identity responses stop before any write without leaking response contents', async () => {
 for (const response of [new Response('sensitive-response', { status: 401 }), new Response('sensitive-response', { status: 503 }), new Response('sensitive-invalid-json')]) {
  const calls = []
  const deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: plan(), fetchImpl: async (_url, options) => { calls.push(options.method); return response } })
  await assert.rejects(deploy('auth'), error => !error.message.includes('sensitive-'))
  assert.deepEqual(calls, ['GET'])
 }
})
test('all repository function sections retain their configured authentication checks', async () => {
 const { readFile } = await import('node:fs/promises')
 const config = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
 const slugs = [...config.matchAll(/^\[functions\.([a-z0-9-]+)\]/gm)].map(match => match[1])
 const operations = slugs.map(slug => stagingOperation(slug, 'createFunction', { slug, name: slug, body: 'synthetic fixture', verify_jwt: false }))
 const calls = [], deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: plan(operations), fetchImpl: successfulFetch(calls) })
 for (const slug of slugs) await deploy(slug)
 assert.equal(calls.filter(call => call.options.method === 'POST').length, slugs.length)
})
test('malformed payload serialization does not expose secret-bearing exception text', () => {
 const bad = { toJSON() { throw new Error('sensitive-smtp-password') } }
 assert.throws(() => stagingOperation('bad', 'configureAuth', bad), error => !error.message.includes('sensitive-smtp-password'))
 const candidate = plan(); candidate.operations[0].payload = bad
 assert.throws(() => stagingDeploymentClient({ token: 'synthetic-token', plan: candidate }), error => !error.message.includes('sensitive-smtp-password'))
})
for (const failure of ['http', 'redirect', 'timeout']) {
 test(`write ${failure} failures redact details and never retry or continue a deployment`, async () => {
  const calls = []
  const deploy = stagingDeploymentClient({ token: 'synthetic-token', plan: plan([operation('first'), operation('second')]), fetchImpl: async (_url, options) => {
   calls.push(options.method)
   if (options.method === 'GET') return new Response(JSON.stringify(project))
   if (failure === 'timeout') throw new Error('sensitive-token-and-body')
   return new Response('sensitive-token-and-body', { status: failure === 'redirect' ? 307 : 403 })
  } })
  await assert.rejects(deploy('first'), error => !error.message.includes('sensitive-token-and-body'))
  await assert.rejects(deploy('second'), /stopped/)
  assert.deepEqual(calls, ['GET', 'PATCH'])
 })
}
