import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { environmentOrigin, productionProjectRef, stagingProjectRef } from '../src/lib/environment.ts'

export { stagingProjectRef }
const projectName = 'beyond-the-archives-staging'
const region = 'us-east-1'
const routes = { project: '', auth: '/config/auth', storage: '/config/storage', functions: '/functions', secrets: '/secrets', migrations: '/database/migrations', keys: '/api-keys', query: '/database/query/read-only' }
export const stagingAuthFields = Object.freeze(['site_url', 'uri_allow_list', 'disable_signup', 'external_email_enabled', 'external_anonymous_users_enabled', 'mailer_autoconfirm', 'mailer_secure_email_change_enabled', 'mailer_notifications_email_changed_enabled', 'mailer_notifications_password_changed_enabled', 'security_update_password_require_reauthentication', 'password_min_length', 'password_required_characters', 'mfa_totp_enroll_enabled', 'mfa_totp_verify_enabled', 'hook_before_user_created_enabled', 'hook_before_user_created_uri'])
const smtpFields = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_admin_email', 'smtp_sender_name']
const functionConfig = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
const functionJwt = new Map([...functionConfig.matchAll(/^\[functions\.([a-z0-9-]+)\]\s*\n([\s\S]*?)(?=^\[|(?![\s\S]))/gm)].flatMap(match => {
 const jwt = /^verify_jwt\s*=\s*(true|false)\b/m.exec(match[2])
 return jwt ? [[match[1], jwt[1] === 'true']] : []
}))

export function stagingManagementToken(env = process.env, run = spawnSync) {
 if (env.SUPABASE_STAGING_ACCESS_TOKEN) return env.SUPABASE_STAGING_ACCESS_TOKEN
 // Reuse the CLI's authenticated macOS credential without putting it in argv,
 // logs, a profile, or a child process environment. Ambient production vars are ignored.
 const result = run('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8', timeout: 15000 })
 if (result.status !== 0 || !result.stdout?.trim()) throw new Error('Staging management authentication is unavailable.')
 return result.stdout.trim()
}

function managementRequest({ token, fetchImpl = fetch } = {}) {
 if (!token) throw new Error('Staging management authentication is required.')
 return async (path, method, body) => {
  let response
  try {
   response = await fetchImpl(`https://api.supabase.com/v1/projects/${stagingProjectRef}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    ...(body !== undefined && { body }),
   })
  } catch { throw new Error('Staging management request failed; credentials and network details withheld.') }
  if (!response.ok) throw new Error(`Staging management request failed (HTTP ${response.status}); response withheld.`)
  return response
 }
}

export function stagingReadClient(options = {}) {
 const request = managementRequest(options)
 return async (action, query) => {
  if (!Object.hasOwn(routes, action) || (action === 'query' ? typeof query !== 'string' || !query.trim() : query !== undefined)) throw new Error('Unsupported staging inventory action.')
  const response = await request(routes[action], action === 'query' ? 'POST' : 'GET', action === 'query' ? JSON.stringify({ query }) : undefined)
  return response.json()
 }
}

export async function verifiedStagingProject(read) {
 const project = await read('project')
 if ((project.ref ?? project.id) !== stagingProjectRef || (project.id !== undefined && project.id !== stagingProjectRef) || project.name !== projectName || project.region !== region || project.status !== 'ACTIVE_HEALTHY') throw new Error('Staging project identity or health does not match the verified target.')
 return { ref: stagingProjectRef, name: project.name, region: project.region, status: project.status }
}

const payloadHash = body => createHash('sha256').update(body).digest('hex')
const operationHash = (id, action, body) => payloadHash(JSON.stringify({ id, action, body }))
const fieldsOnly = (value, fields) => value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length > 0 && Object.keys(value).every(key => fields.includes(key))
const text = value => typeof value === 'string' && value.trim().length > 0
const invalidPlan = () => { throw new Error('Staging deployment plan is invalid or outside the supported scope.') }

/** Fingerprint the exact payload reviewed by the caller; never persist SMTP secrets. */
export function stagingOperation(id, action, payload) {
 try {
  const body = JSON.stringify(payload)
  return { id, action, payload: JSON.parse(body), sha256: operationHash(id, action, body) }
 } catch { invalidPlan() }
}

function deploymentOperations(plan) {
 if (!fieldsOnly(plan, ['version', 'projectRef', 'organizerUrl', 'readerUrl', 'operations']) || plan.version !== 1 || plan.projectRef !== stagingProjectRef || !Array.isArray(plan.operations) || !plan.operations.length) invalidPlan()
 let organizer, reader
 try { organizer = environmentOrigin(plan.organizerUrl, 'staging'); reader = environmentOrigin(plan.readerUrl, 'staging') } catch { invalidPlan() }
 if (organizer === reader) invalidPlan()
 const operations = new Map()
 for (const operation of plan.operations) {
  if (!fieldsOnly(operation, ['id', 'action', 'payload', 'sha256']) || typeof operation.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(operation.id) || operations.has(operation.id)) invalidPlan()
  const body = JSON.stringify(operation.payload)
  if (!text(body) || operationHash(operation.id, operation.action, body) !== operation.sha256 || [productionProjectRef, 'beyondthearchives.vercel.app', 'archivesunfolded.vercel.app'].some(value => body.toLowerCase().includes(value))) invalidPlan()
  // Snapshot reviewed bytes before any network work; later caller edits cannot retarget a write.
  const payload = JSON.parse(body)
  let path, method, requestBody = body
  switch (operation.action) {
   case 'configureAuth': {
    if (!fieldsOnly(payload, [...stagingAuthFields, ...smtpFields])) invalidPlan()
    for (const [key, value] of Object.entries(payload)) {
     if (key === 'password_min_length') { if (!Number.isInteger(value) || value < 6 || value > 72) invalidPlan() }
     else if (['site_url', 'uri_allow_list', 'password_required_characters', 'hook_before_user_created_uri', ...smtpFields].includes(key)) { if (typeof value !== 'string') invalidPlan() }
     else if (typeof value !== 'boolean') invalidPlan()
    }
    const callbacks = payload.uri_allow_list?.split(',')
    if (payload.site_url !== undefined && payload.site_url !== organizer
     || callbacks && (callbacks.length !== 2 || ![`${organizer}/auth/callback`, `${reader}/auth/callback`].every(url => callbacks.includes(url)))
     || payload.mfa_totp_enroll_enabled === false || payload.mfa_totp_verify_enabled === false
     || payload.mailer_autoconfirm === true || payload.external_anonymous_users_enabled === true || payload.hook_before_user_created_enabled === false
     || payload.hook_before_user_created_uri !== undefined && payload.hook_before_user_created_uri !== 'pg-functions://postgres/public/before_user_created') invalidPlan()
    path = routes.auth; method = 'PATCH'; break
   }
   case 'setOrigins':
    if (!Array.isArray(payload) || payload.length !== 2 || payload.some(item => !fieldsOnly(item, ['name', 'value'])) || ![{ name: 'APP_ORIGIN', value: organizer }, { name: 'READER_ORIGIN', value: reader }].every(expected => payload.some(item => item.name === expected.name && item.value === expected.value))) invalidPlan()
    path = routes.secrets; method = 'POST'; break
   case 'applyMigration':
    if (!fieldsOnly(payload, ['name', 'query']) || !text(payload.name) || !text(payload.query)) invalidPlan()
    path = routes.migrations; method = 'POST'; break
   case 'createFunction':
   case 'updateFunction':
    if (!fieldsOnly(payload, ['slug', 'name', 'body', 'verify_jwt']) || !functionJwt.has(payload.slug) || !text(payload.name) || !text(payload.body) || typeof payload.verify_jwt !== 'boolean' || payload.verify_jwt !== functionJwt.get(payload.slug)) invalidPlan()
    path = operation.action === 'createFunction' ? routes.functions : `${routes.functions}/${payload.slug}`
    method = operation.action === 'createFunction' ? 'POST' : 'PATCH'
    if (operation.action === 'updateFunction') { const update = { ...payload }; delete update.slug; requestBody = JSON.stringify(update) }
    break
   default: invalidPlan()
  }
  operations.set(operation.id, { path, method, body: requestBody, action: operation.action })
 }
 return operations
}

/** Execute only reviewed, fixed-target operations. This is not a general CLI/SQL runner. */
export function stagingDeploymentClient({ plan, token, fetchImpl = fetch, ...overrides } = {}) {
 if (Object.keys(overrides).length) invalidPlan()
 let operations
 try { operations = deploymentOperations(plan) } catch { invalidPlan() }
 const read = stagingReadClient({ token, fetchImpl }), request = managementRequest({ token, fetchImpl })
 const completed = new Set()
 let pending = Promise.resolve(), halted = false
 return (...args) => {
  const operation = args.length === 1 && operations.get(args[0])
  if (!operation) return Promise.reject(new Error('Unsupported staging deployment operation.'))
  const result = pending.then(async () => {
   if (halted) throw new Error('Staging deployment stopped after an earlier failure; re-inventory before preparing another plan.')
   if (completed.has(args[0])) throw new Error('Staging deployment operation has already completed.')
   try {
    await verifiedStagingProject(read)
    const response = await request(operation.path, operation.method, operation.body)
    // Auth/function responses may contain secrets or executable content. Return only a receipt.
    await response.arrayBuffer()
    completed.add(args[0])
    return { projectRef: stagingProjectRef, id: args[0], action: operation.action, status: response.status }
   } catch { halted = true; throw new Error('Staging deployment refused or failed; credentials and response details withheld. Re-inventory before retrying.') }
  })
  pending = result.catch(() => {})
  return result
 }
}
