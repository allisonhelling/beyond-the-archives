// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JavaScript database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001'
const bob = '10000000-0000-0000-0000-000000000002'
type Backup = { format: string; version: number; user_id: string; tables: Record<string, Record<string, unknown>[]> }
async function snapshot(user = alice) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`)
  try { return (await db.query<{ backup: Backup }>('select public.export_library_backup() backup')).rows[0].backup }
  finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
async function restore(backup: Backup, user = alice, replace = true) {
  await db.exec('set role service_role')
  try { await db.query('select public.restore_library_backup($1::jsonb,$2::uuid,$3)', [JSON.stringify(backup), user, replace]) }
  finally { await db.exec('reset role') }
}
beforeAll(async () => {
  db = await createTestDatabase()
  await db.exec(`insert into auth.users values('${alice}'),('${bob}');`)
}, 30000)
afterAll(async () => { await db?.close() })

it('exports only the signed-in account and restores all table rows exactly, including relationships and history', async () => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}'`)
  await db.query(`select public.save_library_story($1,$2::jsonb,'reading',3,'Private notes',5::smallint,true,'{}'::uuid[],array['My tag'])`,
    ['https://archiveofourown.org/works/123', JSON.stringify({ title: 'A work', authors: ['Author'], fandoms: ['Fandom'], additional_tags: ['Tag'] })])
  await db.exec('reset role; reset request.jwt.claim.sub')
  await db.exec(`insert into public.library_series(user_id,ao3_series_id,metadata,notes) values('${alice}',10,'{"title":"Series"}','Series notes');
   insert into public.collections(user_id,name,color,symbol) values('${alice}','Custom','#123456','moon');
   insert into public.collection_works(user_id,collection_id,library_entry_id) select '${alice}',c.id,e.id from public.collections c, public.library_entries e where c.name='Custom' and c.user_id='${alice}' and e.user_id='${alice}';
   insert into public.collection_series(user_id,collection_id,library_series_id) select '${alice}',c.id,s.id from public.collections c, public.library_series s where c.name='Custom' and c.user_id='${alice}' and s.user_id='${alice}';
   insert into public.metadata_preferences(user_id,retrieval_mode) values('${alice}','extension');`)
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}'`)
  await db.query('select public.submit_import_urls($1::text[])', [['https://archiveofourown.org/works/123', 'https://archiveofourown.org/works/123']])
  await db.exec('reset role; reset request.jwt.claim.sub')
  await db.exec(`insert into public.processing_logs(job_id,user_id,category,message) select id,user_id,'test','Historical message' from public.metadata_jobs where user_id='${alice}'`)
  const backup = await snapshot()
  const foreign = await snapshot(bob)
  expect(backup.tables.library_entries).toHaveLength(1)
  expect(backup.tables.library_series[0].notes).toBe('Series notes')
  expect(backup.tables.library_entry_tags).toHaveLength(1)
  expect(backup.tables.import_items).toHaveLength(2)
  expect(backup.tables.processing_logs).toHaveLength(1)
  expect(backup.tables).not.toHaveProperty('userscript_devices')
  expect(foreign.tables.library_entries).toEqual([])
  await db.exec(`update public.library_entries set notes='Changed'; insert into public.collections(user_id,name) values('${alice}','Extra');`)
  await restore(backup)
  expect((await snapshot()).tables).toEqual(backup.tables)
  expect((await snapshot(bob)).tables).toEqual(foreign.tables)
  const documents = await db.query<{ notes: string }>("select story->>'notes' notes from public.library_search_documents")
  expect(documents.rows).toEqual([{ notes: 'Private notes' }])
})

it('requires explicit replacement and rolls back malformed restores without leaving triggers disabled', async () => {
  const backup = await snapshot()
  await expect(restore(backup, alice, false)).rejects.toThrow('use replace explicitly')
  const invalid = structuredClone(backup)
  invalid.tables.library_entries[0].work_id = '99999999-0000-0000-0000-000000000000'
  await expect(restore(invalid)).rejects.toThrow(/foreign key/)
  expect((await snapshot()).tables).toEqual(backup.tables)
  expect((await db.query("select tgname from pg_trigger where not tgisinternal and tgenabled='D'")).rows).toEqual([])
  const missing = structuredClone(backup)
  delete missing.tables.works
  await expect(restore(missing)).rejects.toThrow('Missing backup table')
})

it('restores to another account with fresh private IDs, preserving memberships and resolving shared natural keys', async () => {
  const backup = await snapshot()
  const oldWork = String(backup.tables.works[0].id)
  // Simulate an export from a different project with different shared UUIDs.
  const alternate = JSON.parse(JSON.stringify(backup).replaceAll(oldWork, '99999999-0000-0000-0000-000000000000')) as Backup
  await restore(alternate, bob)
  const restored = await snapshot(bob)
  expect(restored.tables.library_entries[0].id).not.toBe(backup.tables.library_entries[0].id)
  expect(restored.tables.library_entries[0].work_id).toBe(oldWork)
  expect(restored.tables.library_entries[0].notes).toBe('Private notes')
  expect(restored.tables.collection_works[0].library_entry_id).toBe(restored.tables.library_entries[0].id)
  expect(restored.tables.collection_series[0].library_series_id).toBe(restored.tables.library_series[0].id)
  expect(restored.tables.library_entry_tags[0].personal_tag_id).toBe(restored.tables.personal_tags[0].id)
  expect((await snapshot()).tables).toEqual(backup.tables)
})

it('scrubs leases, resumes interrupted jobs, and only remaps UUID columns', async () => {
  const backup = await snapshot()
  const source = String(backup.tables.library_entries[0].id)
  backup.tables.library_entries[0].notes = source
  backup.tables.metadata_jobs[0].status = 'processing'
  backup.tables.metadata_jobs[0].attempts = 4
  backup.tables.metadata_jobs[0].lease_token = '99999999-0000-0000-0000-000000000001'
  backup.tables.import_items[0].status = 'processing'
  backup.tables.import_items[0].metadata_status = 'processing'
  await restore(backup, bob)
  const restored = await snapshot(bob)
  expect(restored.tables.library_entries[0].notes).toBe(source)
  expect(restored.tables.metadata_jobs[0]).toMatchObject({ status: 'pending', attempts: 3, lease_token: null, lease_until: null })
  expect(restored.tables.import_items.find(row => row.id !== null && row.ordinal === backup.tables.import_items[0].ordinal)).toMatchObject({ status: 'pending', metadata_status: 'pending' })
  await db.exec(`update public.metadata_jobs set lease_token='99999999-0000-0000-0000-000000000001' where user_id='${bob}'`)
  expect((await snapshot(bob)).tables.metadata_jobs[0].lease_token).toBeNull()
})

it('round-trips personal Recs and restores legacy backups from their imported Rec baseline', async () => {
 const backup = await snapshot()
 expect(backup.tables.library_entries.length).toBeGreaterThan(0)
 for (const entry of backup.tables.library_entries) { entry.is_rec = false; entry.source_bookmark = { rec: true } }
 await restore(backup)
 expect((await snapshot()).tables.library_entries.every(entry => entry.is_rec === false)).toBe(true)
 const legacy = structuredClone(backup)
 for (const entry of legacy.tables.library_entries) delete entry.is_rec
 await restore(legacy)
 expect((await snapshot()).tables.library_entries.every(entry => entry.is_rec === true)).toBe(true)
 for (const entry of legacy.tables.library_entries) entry.source_bookmark = { status: 'private rec' }
 await restore(legacy)
 expect((await snapshot()).tables.library_entries.every(entry => entry.is_rec === true)).toBe(true)
})

it('restores into empty application tables and exports more than the PostgREST row limit', async () => {
  const backup = await snapshot()
  const names = Object.keys(backup.tables)
  await db.exec(`truncate ${names.map(t => `public.${t}`).join(',')} cascade`)
  await db.exec('truncate public.metadata_worker_state')
  await restore(backup, alice, false)
  expect((await snapshot()).tables).toEqual(backup.tables)
  expect((await db.query('select id from public.metadata_worker_state')).rows).toEqual([{ id: 1 }])
  // Bulk seed without per-row search work; the backup reads base tables directly.
  await db.exec(`alter table public.library_entries disable trigger user;
   insert into public.works(ao3_work_id,title) select n,'Scale work '||n from generate_series(10000,14001) n;
   insert into public.library_entries(user_id,work_id,original_url,notes) select '${alice}',id,'https://archiveofourown.org/works/'||ao3_work_id,'Scale notes' from public.works where ao3_work_id>=10000;
   alter table public.library_entries enable trigger user;`)
  const large = await snapshot()
  expect(large.tables.library_entries).toHaveLength(4003)
  expect(large.tables.works).toHaveLength(4003)
  await restore(large)
  expect((await snapshot()).tables).toEqual(large.tables)
}, 30000)

it('rejects anonymous snapshots and prevents browser users from invoking restore', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      await expect(db.query('select public.restore_library_backup($1,$2,true)', ['{}', alice])).rejects.toThrow('permission denied')
      await expect(db.query('select public.export_library_backup()')).rejects.toThrow(role === 'anon' ? 'permission denied' : 'Authentication required')
    } finally { await db.exec('reset role') }
  }
})
