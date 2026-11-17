// Independent encrypted file transport. Provider export/restore ceremonies are
// separate: unpacking a bundle does not restore GoTrue, PostgreSQL or Storage.
import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { pathToFileURL } from 'node:url'

export const recoveryCategories = Object.freeze(['database', 'auth-mfa', 'roles-audit', 'storage-bytes', 'storage-metadata', 'configuration', 'keys-credentials'])
export const recoveryPolicy = Object.freeze({ owner: 'Application Owner', executor: 'Designated infrastructure maintainer', rtoHours: 24, rpoHours: 24, dailyDays: 30, weeklyWeeks: 12, monthlyMonths: 12, encryption: 'AES-256-GCM', drills: 'Quarterly and before major schema, RLS or Auth changes' })
export function recoveryExpiry(capturedAt, retentionClass) {
 const date = new Date(capturedAt)
 assert.ok(Number.isFinite(date.getTime()))
 assert.ok(['daily', 'weekly', 'monthly'].includes(retentionClass))
 if (retentionClass === 'monthly') {
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + recoveryPolicy.monthlyMonths)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
 } else date.setUTCDate(date.getUTCDate() + (retentionClass === 'daily' ? recoveryPolicy.dailyDays : recoveryPolicy.weeklyWeeks * 7))
 return date.toISOString()
}
function validKey(key) { assert.ok(Buffer.isBuffer(key) && key.length === 32, 'Use a separate 32-byte recovery key.') }
export function validateRecoveryPlan(plan, now = Date.now()) {
 assert.equal(plan.version, 1)
 assert.ok(['synthetic', 'production'].includes(plan.environment))
 recoveryExpiry(new Date(now).toISOString(), plan.retentionClass)
 for (const field of ['consistencyReference', 'keyCustodyReference', 'operator', 'approvalReference']) assert.ok(typeof plan[field] === 'string' && plan[field].trim())
 assert.ok(Array.isArray(plan.assets))
 assert.deepEqual([...new Set(plan.assets.map(asset => asset.category))].sort(), [...recoveryCategories].sort(), 'Every recovery class is required; account JSON is insufficient.')
 for (const asset of plan.assets) {
  assert.ok(typeof asset.path === 'string' && asset.path.length > 0)
  const captured = Date.parse(asset.capturedAt)
  assert.ok(Number.isFinite(captured) && captured <= now && now - captured <= recoveryPolicy.rpoHours * 3600000, 'Recovery points must be at most 24 hours old.')
 }
 return plan
}
function cipher(key, iv, tag) {
 validKey(key)
 const stream = tag ? createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex')) : createCipheriv('aes-256-gcm', key, iv)
 if (tag) stream.setAuthTag(Buffer.from(tag, 'hex'))
 return stream
}
export async function packRecovery(plan, directory, key) {
 validateRecoveryPlan(plan)
 validKey(key)
 await mkdir(directory, { mode: 0o700 }) // Never overwrite an existing recovery point.
 const assets = []
 for (const [index, asset] of plan.assets.entries()) {
  assert.ok((await lstat(asset.path)).isFile(), 'Recovery inputs must be regular files, not links.')
  const iv = randomBytes(12), encrypt = cipher(key, iv), digest = createHash('sha256')
  let bytes = 0
  const tap = new Transform({ transform(chunk, encoding, callback) { digest.update(chunk); bytes += chunk.length; callback(null, chunk) } })
  const file = `${index}.enc`
  await pipeline(createReadStream(asset.path), tap, encrypt, createWriteStream(join(directory, file), { flags: 'wx', mode: 0o600 }))
  assert.ok(bytes > 0, 'Empty files do not establish recovery coverage.')
  assets.push({ category: asset.category, capturedAt: asset.capturedAt, name: basename(asset.path), file, iv: iv.toString('hex'), tag: encrypt.getAuthTag().toString('hex'), sha256: digest.digest('hex'), bytes })
 }
 const { assets: ignored, ...context } = plan
 void ignored
 const recoveryPointAt = new Date(Math.min(...assets.map(asset => Date.parse(asset.capturedAt)))).toISOString()
 const manifest = { ...context, policy: recoveryPolicy, assets, recoveryPointAt, expiresAt: recoveryExpiry(recoveryPointAt, plan.retentionClass), packedAt: new Date().toISOString() }
 const iv = randomBytes(12), encrypt = cipher(key, iv)
 const bytes = Buffer.concat([encrypt.update(JSON.stringify(manifest)), encrypt.final()])
 await writeFile(join(directory, 'manifest.enc'), bytes, { flag: 'wx', mode: 0o600 })
 // Written last: a partial bundle has no completion header.
 await writeFile(join(directory, 'bundle.json'), JSON.stringify({ version: 1, iv: iv.toString('hex'), tag: encrypt.getAuthTag().toString('hex') }) + '\n', { flag: 'wx', mode: 0o600 })
 return { files: assets.length, categories: recoveryCategories.length, environment: plan.environment }
}

export async function unpackRecovery(directory, destination, key) {
 const started = performance.now()
 validKey(key)
 const header = JSON.parse(await readFile(join(directory, 'bundle.json'), 'utf8'))
 assert.equal(header.version, 1)
 const decrypt = cipher(key, header.iv, header.tag)
 const manifest = JSON.parse(Buffer.concat([decrypt.update(await readFile(join(directory, 'manifest.enc'))), decrypt.final()]).toString('utf8'))
 assert.deepEqual(manifest.policy, recoveryPolicy)
 assert.deepEqual([...new Set(manifest.assets.map(asset => asset.category))].sort(), [...recoveryCategories].sort())
 await mkdir(destination, { mode: 0o700 })
 for (const [index, asset] of manifest.assets.entries()) {
  assert.equal(asset.file, `${index}.enc`)
  assert.ok(recoveryCategories.includes(asset.category) && asset.name === basename(asset.name) && !['.', '..', ''].includes(asset.name))
  const digest = createHash('sha256')
  let bytes = 0
  const tap = new Transform({ transform(chunk, encoding, callback) { digest.update(chunk); bytes += chunk.length; callback(null, chunk) } })
  await pipeline(createReadStream(join(directory, asset.file)), cipher(key, asset.iv, asset.tag), tap, createWriteStream(join(destination, `${index}-${asset.name}`), { flags: 'wx', mode: 0o600 }))
  assert.equal(bytes, asset.bytes)
  assert.equal(digest.digest('hex'), asset.sha256)
 }
 // This receipt measures file recovery only. It must never claim provider RTO.
 const result = { environment: manifest.environment, files: manifest.assets.length, fileRecoveryMs: Math.round(performance.now() - started), maximumRecoverableDataAgeHours: Math.max(...manifest.assets.map(asset => (Date.now() - Date.parse(asset.capturedAt)) / 3600000)), providerRecoveryExercised: false }
 await writeFile(join(destination, 'verified-files.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
 return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try {
  const [action, source, destination, ...extra] = process.argv.slice(2)
  assert.ok(source && destination && !extra.length && ['pack', 'unpack'].includes(action), 'Usage: recovery-bundle.mjs pack <plan.json> <new-directory> | unpack <bundle-directory> <new-directory>')
  const encoded = process.env.RECOVERY_BUNDLE_KEY
  assert.match(encoded ?? '', /^[A-Za-z0-9+/]{43}=$/)
  const key = Buffer.from(encoded, 'base64')
  const result = action === 'pack' ? await packRecovery(JSON.parse(await readFile(source, 'utf8')), destination, key) : await unpackRecovery(source, destination, key)
  console.log(JSON.stringify(result))
 } catch { console.error('Recovery bundle operation failed; partial output must not be used. Inputs are preserved; private paths, credentials and contents withheld.'); process.exitCode = 1 }
}
