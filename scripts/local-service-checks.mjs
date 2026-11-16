import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { localClients, createSyntheticAccounts, removeSyntheticAccounts, checked } from './local-fixtures.mjs'
import { validateLocalEdgeSettings } from './local-target.mjs'

// Exercise the deployed local handlers, Auth and database together, without
// loading an external fixture, credential file, account ID or hosted URL.
let stage = 'creating synthetic local accounts'
async function verifyLocalServices() {
 if (process.argv.length !== 2) throw new Error('Local service checks accept no arguments.')
 const { APP_ORIGIN: organizer, READER_ORIGIN: reader } = validateLocalEdgeSettings(await readFile(new URL('../supabase/.env.local', import.meta.url), 'utf8'))
 const clients = await localClients()
 const accounts = await createSyntheticAccounts(clients)
 let exchanged
 try {
  const source = checked(await accounts[0].client.auth.getSession()).session
  const request = (name, { origin = organizer, token, body, method = body ? 'POST' : 'GET' } = {}) => fetch(`${clients.target.url}/functions/v1/${name}`, {
   method, redirect: 'error', signal: AbortSignal.timeout(30000),
   headers: { origin, apikey: clients.target.publicKey, ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
   ...(body && { body: JSON.stringify(body) }),
  })
  stage = 'checking Edge account authentication and origins'
  assert.equal((await request('account-status')).status, 401, 'Account handler must deny missing authentication.')
  assert.equal((await request('account-status', { origin: 'https://untrusted.example', token: source.access_token })).status, 403, 'Account handler must deny an untrusted origin.')
  const status = await request('account-status', { token: source.access_token })
  assert.equal(status.status, 200, 'Account handler must verify a real local Auth session.')
  stage = 'checking the verified Edge account identity'
  assert.ok((await status.json()).user_id === accounts[0].id, 'Verified account must match the synthetic source.')
  stage = 'checking the Edge account CORS response'
  const corsOrigin = status.headers.get('access-control-allow-origin')
  assert.ok([organizer, '*'].includes(corsOrigin), 'The local gateway must permit the configured browser origin.')
  if (corsOrigin === '*') console.log('NOTE local gateway overrides CORS with a wildcard; handler origin denials are verified separately. Hosted CORS is not established.')
  console.log('PASS local Edge account authentication and origin checks')
  stage = 'checking real connected-login exchange'
  const preflight = await request('app-login', { origin: reader, method: 'OPTIONS' })
  assert.ok([200, 204].includes(preflight.status), 'Local gateway or handler must accept the configured preflight.')
  assert.ok([reader, '*'].includes(preflight.headers.get('access-control-allow-origin')))
  const verifier = randomBytes(32).toString('hex')
  assert.equal((await request('app-login', { origin: 'https://untrusted.example', token: source.access_token, body: { action: 'issue', target: reader, userRequested: true, challenge: createHash('sha256').update(verifier).digest('hex') } })).status, 403, 'Login handler must reject an untrusted origin even behind the local gateway.')
  const issued = await request('app-login', { token: source.access_token, body: { action: 'issue', target: reader, userRequested: true, challenge: createHash('sha256').update(verifier).digest('hex') } })
  assert.equal(issued.status, 200, 'Real Edge handoff issuance must succeed.')
  const code = (await issued.json()).code
  assert.ok(typeof code === 'string' && /^[a-f0-9]{64}$/.test(code), 'Handoff code shape must be valid.')
  const input = { action: 'redeem', code, verifier }
  const redeemed = await request('app-login', { origin: reader, body: input })
  assert.equal(redeemed.status, 200, 'Real Edge handoff redemption must succeed.')
  const session = await redeemed.json()
  assert.ok(session.access_token && session.refresh_token && session.refresh_token !== source.refresh_token, 'Handoff must create an independent target session.')
  exchanged = clients.user()
  const adopted = checked(await exchanged.auth.setSession(session))
  assert.ok(adopted.user.id === accounts[0].id, 'Target session must belong to the source account.')
  assert.equal((await request('app-login', { origin: reader, body: input })).status, 401, 'A consumed handoff must not be replayable.')
  console.log('PASS local Edge connected-login issuance, independent session, and replay denial')
  stage = 'checking retired worker response'
  assert.equal((await request('import-worker')).status, 410, 'Retired hosted AO3 retrieval must stay disabled.')
  console.log('PASS local Edge retired worker tombstone')
 } finally {
  await exchanged?.auth.signOut()
  await removeSyntheticAccounts(clients, accounts)
 }
}
try { await verifyLocalServices() }
catch (error) { console.error(`Synthetic local service verification failed while ${stage} (${error instanceof Error ? error.name : 'Error'}${Number.isInteger(error?.actual) ? `, status ${error.actual}, expected ${error.expected}` : ''}); handler responses and credentials withheld.`); process.exitCode = 1 }
