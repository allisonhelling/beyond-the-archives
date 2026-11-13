import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { parseLocalSupabaseStatus } from './supabase-status.mjs'

export const localProjectRoot = fileURLToPath(new URL('../',import.meta.url))
export function localCliEnvironment(env = process.env) {
 return Object.fromEntries(Object.entries(env).filter(([key])=>!key.startsWith('SUPABASE_')))
}
export const localProjectId = 'beyond-the-archives-local-synthetic'
export async function assertLocalProject() {
 const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
 if (!config.includes(`project_id = "${localProjectId}"`)) throw new Error('Refusing an unidentified local Supabase project.')
}
export function assertLocalEndpoint(url) {
 // Reuse the established URL/credential-shape boundary without exposing inputs.
 parseLocalSupabaseStatus(JSON.stringify({ API_URL: url, PUBLISHABLE_KEY: 'shape-only', SECRET_KEY: 'shape-only' }))
 const parsed = new URL(url)
 if (parsed.port !== '54321' || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Only the configured local Supabase API is permitted.')
}
export async function readLocalTarget() {
 await assertLocalProject()
 const result = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', cwd:localProjectRoot, env:localCliEnvironment(), timeout: 60000 })
 if (result.status !== 0) throw new Error('Local Supabase is unavailable. No hosted fallback is permitted.')
 const target = parseLocalSupabaseStatus(result.stdout)
 assertLocalEndpoint(target.url)
 return target
}

// Hosted mutations intentionally have no S1 runner. A matching environment label
// cannot authorize them. Production release tooling is a separate reviewed gate.
export async function verifiedLocalTarget({ url, secret } = {}, readTarget = readLocalTarget) {
 if (url) assertLocalEndpoint(url)
 const target = await readTarget()
 assertLocalEndpoint(target.url)
 if ((url && new URL(url).origin !== new URL(target.url).origin) || (secret && secret !== target.secretKey)) throw new Error('Supplied credentials do not match the running local stack. No request was sent.')
 return target
}

export function validateLocalEdgeSettings(text) {
 const settings=parseEnv(text)
 if (Object.keys(settings).some(key=>!['APP_ORIGIN','READER_ORIGIN'].includes(key))) throw new Error('Local Edge settings may contain only the two app origins; backend overrides and secrets are forbidden.')
 for (const key of ['APP_ORIGIN','READER_ORIGIN']) {
  let url
  try { url=new URL(settings[key]) } catch { throw new Error('Explicit local Edge app origins are required.') }
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname!=='/' || url.search || url.hash) throw new Error('Local Edge app origins must be loopback origins.')
 }
}
