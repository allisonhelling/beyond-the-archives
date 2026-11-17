import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { createTestDatabase } from './test-database.mjs'
import { seedLargeLibraries } from './performance-library.mjs'
import { stagingSessions, fixtureResult as checked } from './staging-fixtures.mjs'

const report = { environment: 'staging HTTP/Storage; generated synthetic data only', startedAt: new Date().toISOString(), passed: false, metrics: {}, phase: 'prerequisites' }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function measure(name, run) {
 report.phase = name
 console.log(`Staging restore phase: ${name}`)
 const start = performance.now()
 try { return await run() }
 finally { report.metrics[name] = Math.round(performance.now() - start) }
}
try {
 assert.equal(process.argv.length, 2, 'External payloads and target overrides are forbidden.')
 const fixture = await stagingSessions(), account = fixture.accounts[0]
 assert.equal(process.env.STAGING_RESTORE_USER_ID, account.id, 'Explicitly designate the dedicated empty User A account for destructive synthetic restores.')
 const original = checked(await account.client.rpc('export_library_backup'))
 assert.equal(original.tables.library_entries.length, 0, 'Use a dedicated empty synthetic library; ordinary test libraries are not replaceable.')
 for (const name of ['library_series', 'personal_tags', 'metadata_jobs', 'reading_records']) if (original.tables[name]) assert.equal(original.tables[name].length, 0)
 // Retention reconciliation must never prune an existing backup on this account.
 assert.equal(checked(await account.client.storage.from('library-backups').list(account.id, { limit: 1 })).length, 0, 'Use an account with no saved backups.')
 const db = await createTestDatabase()
 let backup
 try {
  await seedLargeLibraries(db, 10000, 1)
  await db.exec("set role authenticated; set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'")
  backup = (await db.query('select public.export_library_backup() backup')).rows[0].backup
 } finally { await db.close() }
 backup = JSON.parse(JSON.stringify(backup).replaceAll('10000000-0000-0000-0000-000000000001', account.id))
 const payload = JSON.stringify(backup), compressed = gzipSync(payload)
 report.works = 10000
 report.jsonBytes = Buffer.byteLength(payload)
 report.gzipBytes = compressed.length
 let lastSave = 0
 const uploaded = []
 async function save(bytes) {
  const wait = Math.max(0, 61000 - (Date.now() - lastSave))
  if (wait) { console.log('Waiting for the existing backup cooldown.'); await new Promise(resolve => setTimeout(resolve, wait)) }
  lastSave = Date.now()
  const response = await fetch(`${fixture.config.url}/functions/v1/save-backup`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(65000), headers: { apikey: fixture.config.key, Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/gzip', Origin: fixture.config.organizerUrl }, body: bytes })
  assert.equal(response.status, 200, 'Backup upload failed; inspect committed state before retrying.')
  const files = (await response.json()).backups
  const file = files.find(file => !uploaded.includes(file.path))
  assert.ok(file?.path.startsWith(`${account.id}/`))
  uploaded.push(file.path)
  const stored = new Uint8Array(await checked(await account.client.storage.from('library-backups').download(file.path)).arrayBuffer())
  assert.equal(hash(stored), hash(bytes), 'Storage must preserve exact compressed bytes.')
  return file.path
 }
 const safety = await measure('initialSafetyUploadDownloadMs', () => save(gzipSync(JSON.stringify(original))))
 async function restore(snapshot, path, name) {
  const preview = await measure(`${name}PreviewMs`, async () => checked(await account.client.rpc('preview_library_restore', { p_backup: snapshot })))
  await measure(`${name}CommitMs`, async () => checked(await account.client.rpc('restore_own_library_backup', { p_backup: snapshot, p_fingerprint: preview.fingerprint, p_safety_path: path })))
 }
 await restore(backup, safety, 'empty')
 const current = await measure('largeExportMs', async () => checked(await account.client.rpc('export_library_backup')))
 assert.equal(current.tables.library_entries.length, 10000)
 const largeSafety = await measure('largeSafetyUploadDownloadMs', () => save(gzipSync(JSON.stringify(current))))
 await restore(backup, largeSafety, 'replacement')
 const restored = checked(await account.client.rpc('export_library_backup'))
 // Account restores regenerate IDs and move shared facts into private fields.
 // Compare user-visible identities/content rather than bytewise private IDs.
 const content = snapshot => snapshot.tables.library_entries.map(row => JSON.stringify([row.original_url, row.notes, row.reading_status, row.metadata_overrides])).sort()
 assert.deepEqual(content(restored), content(backup))
 await restore(original, largeSafety, 'cleanup')
 assert.deepEqual(checked(await account.client.rpc('export_library_backup')).tables.library_entries, [])
 checked(await account.client.storage.from('library-backups').remove(uploaded))
 await fixture.verifyRetainedState()
 assert.ok(Object.entries(report.metrics).filter(([key]) => /PreviewMs|CommitMs|ExportMs/.test(key)).every(([, ms]) => ms < 60000), 'A database phase exceeded the existing 60-second budget; release is blocked.')
 report.phase = 'complete'
 report.passed = true
} catch { report.failure = 'Prerequisite, budget or verification failure. Do not automatically retry a restore; inspect committed synthetic state. Response details withheld.'; process.exitCode = 1 }
finally {
 await mkdir(new URL('../artifacts/performance/', import.meta.url), { recursive: true })
 await writeFile(new URL(`../artifacts/performance/staging-restore-${report.startedAt.replaceAll(/[:.]/g, '-')}.json`, import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
 console.log(report.passed ? 'PASS 10,000-work staging restore, HTTP budgets and exact Storage bytes.' : `Staging restore stopped at ${report.phase}; metadata-only failure report saved.`)
}
