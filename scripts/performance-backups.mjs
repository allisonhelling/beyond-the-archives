import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createTestDatabase } from './test-database.mjs'
import { seedLargeLibraries } from './performance-library.mjs'

// Reuse the existing realistic fixture: summaries, private overrides/notes,
// authors, fandoms, twelve tags per work, collections, and loaded series.
const count = Number(process.env.PERF_WORKS ?? 10000)
assert(Number.isSafeInteger(count) && count > 0, 'PERF_WORKS must be a positive integer')
const user = '10000000-0000-0000-0000-000000000001'
const db = await createTestDatabase()
const metrics = { environment: 'PGlite; synthetic data; not hosted API/Storage performance', works: count }
async function exportSnapshot() {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`)
  try { return (await db.query('select public.export_library_backup() backup')).rows[0].backup }
  finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
function canonicalTables(backup) {
  return Object.fromEntries(Object.entries(backup.tables).map(([table, rows]) => [table, rows.map(row => JSON.stringify(row)).sort()]))
}
async function restore(backup, replace) {
  await db.exec('set role service_role')
  try { await db.query('select public.restore_library_backup($1::jsonb,$2::uuid,$3)', [JSON.stringify(backup), user, replace]) }
  finally { await db.exec('reset role') }
}
try {
  console.log(`Seeding ${count.toLocaleString()} works with the existing large-library fixture…`)
  await seedLargeLibraries(db, count, 1)
  let start = performance.now()
  const backup = await exportSnapshot()
  metrics.exportMs = Math.round(performance.now() - start)
  assert.equal(backup.tables.library_entries.length, count)
  assert.equal(backup.tables.work_tags.length, count * 12)
  const serialized = JSON.stringify(backup)
  const compressed = gzipSync(serialized)
  assert.equal(gunzipSync(compressed).toString(), serialized)
  metrics.jsonBytes = Buffer.byteLength(serialized)
  metrics.gzipBytes = compressed.byteLength
  metrics.rows = Object.fromEntries(Object.entries(backup.tables).map(([table, rows]) => [table, rows.length]))
  const expected = canonicalTables(backup)
  await mkdir('artifacts/performance', { recursive: true })
  await writeFile('artifacts/performance/backup-fixture.json.gz', compressed)
  console.log(`Export passed: ${metrics.jsonBytes} bytes JSON; ${metrics.gzipBytes} bytes gzip; ${metrics.exportMs} ms.`)
  await db.exec(`truncate ${Object.keys(backup.tables).map(table => `public.${table}`).join(',')},public.metadata_worker_state cascade`)
  start = performance.now()
  await restore(backup, false)
  metrics.emptyRestoreMs = Math.round(performance.now() - start)
  assert.deepEqual(canonicalTables(await exportSnapshot()), expected)
  console.log(`Empty-table restore passed in ${metrics.emptyRestoreMs} ms.`)
  await db.exec(`update public.library_entries set notes='Changed after backup' where id=(select id from public.library_entries limit 1);
    insert into public.collections(user_id,name) values('${user}','Created after backup')`)
  start = performance.now()
  await restore(backup, true)
  metrics.replaceRestoreMs = Math.round(performance.now() - start)
  assert.deepEqual(canonicalTables(await exportSnapshot()), expected)
  assert.equal(Number((await db.query('select count(*) count from public.library_search_documents')).rows[0].count), count)
  console.log(`Replacement restore passed in ${metrics.replaceRestoreMs} ms; all table rows and search document counts verified.`)
  await writeFile('artifacts/performance/backups.json', JSON.stringify(metrics, null, 2))
} finally { await db.close() }
