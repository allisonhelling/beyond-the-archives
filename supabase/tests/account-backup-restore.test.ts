// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JavaScript database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
type Backup = { user_id: string; tables: Record<string, Record<string, unknown>[]> }
type Preview = { fingerprint: string; counts: Record<string, { current: number; backup: number }> }
async function asUser<T>(user: string, run: () => Promise<T>) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`)
  try { return await run() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
async function snapshot(user = alice) {
  return asUser(user, async () => (await db.query<{ backup: Backup }>('select public.export_library_backup() backup')).rows[0].backup)
}
async function preview(backup: Backup) {
  return asUser(alice, async () => (await db.query<{ preview: Preview }>('select public.preview_library_restore($1) preview', [JSON.stringify(backup)])).rows[0].preview)
}
async function restore(backup: Backup, fingerprint: string, path = `${alice}/safety.json`) {
  return asUser(alice, () => db.query('select public.restore_own_library_backup($1,$2,$3)', [JSON.stringify(backup), fingerprint, path]))
}
beforeAll(async () => {
  db = await createTestDatabase()
  await db.exec(`insert into auth.users values('${alice}'),('${bob}')`)
  for (const user of [alice, bob]) await asUser(user, () => db.query(`select public.save_library_story($1,$2::jsonb,'reading',1,$3,4::smallint,true,'{}'::uuid[],array['Private tag'])`,
    ['https://archiveofourown.org/works/123', JSON.stringify({ title: 'Original title', authors: ['Author'], published_chapters: 4 }), `Notes for ${user}`]))
  await db.exec(`insert into public.collections(user_id,name) values('${alice}','Manual shelf');
    insert into public.collections(user_id,name,automatic_rules) values('${alice}','Automatic favorites','{"filters":{"favorites":true},"terms":[]}');
    insert into public.library_series(user_id,ao3_series_id,metadata,notes) values('${alice}',77,'{"title":"Saved series","works":[]}','Series note');
    insert into public.collection_series(user_id,collection_id,library_series_id) select '${alice}',c.id,s.id from public.collections c,public.library_series s where c.user_id='${alice}' and c.name='Manual shelf' and s.user_id='${alice}';`)
}, 30000)
afterAll(async () => { await db?.close() })

it('validates with the real restore engine while leaving both accounts and triggers unchanged', async () => {
  const backup = await snapshot(), foreign = await snapshot(bob)
  const result = await preview(backup)
  expect(result.counts.library_entries).toEqual({ current: 1, backup: 1 })
  expect(result.fingerprint).toMatch(/^[a-f0-9]{32}$/)
  expect((await snapshot()).tables).toEqual(backup.tables)
  expect((await snapshot(bob)).tables).toEqual(foreign.tables)
  expect((await db.query("select tgname from pg_trigger where not tgisinternal and tgenabled='D'")).rows).toEqual([])
})

it('requires a recent, owned safety copy and rejects changes made since preview', async () => {
  const backup = await snapshot(), prepared = await preview(backup)
  await expect(restore(backup, prepared.fingerprint)).rejects.toThrow('safety backup')
  await db.query("insert into storage.objects(bucket_id,name) values('library-backups',$1),('library-backups',$2)", [`${alice}/safety.json`, `${bob}/safety.json`])
  await expect(restore(backup, prepared.fingerprint, `${bob}/safety.json`)).rejects.toThrow('safety backup')
  await db.query("update storage.objects set created_at=clock_timestamp()-interval '16 minutes' where name=$1", [`${alice}/safety.json`])
  await expect(restore(backup, prepared.fingerprint)).rejects.toThrow('safety backup')
  await db.query('update storage.objects set created_at=clock_timestamp() where name=$1', [`${alice}/safety.json`])
  await db.exec(`update public.library_entries set notes='Newer note' where user_id='${alice}'`)
  await expect(restore(backup, prepared.fingerprint)).rejects.toThrow('Your library changed')
  expect((await snapshot()).tables.library_entries[0].notes).toBe('Newer note')
})

it('restores private data atomically, remaps identities, and never changes shared metadata or another account', async () => {
  const backup = await snapshot(), foreign = await snapshot(bob)
  backup.tables.works[0].title = 'Uploaded public title must be ignored'
  backup.tables.library_entries[0].extension_metadata = { title: 'Private restored source' }
  backup.tables.library_entries[0].notes = 'Restored private note'
  const sharedBefore = (await db.query('select * from public.works')).rows
  const prepared = await preview(backup)
  await restore(backup, prepared.fingerprint)
  const restored = await snapshot()
  expect(restored.tables.library_entries[0]).toMatchObject({ notes: 'Restored private note', extension_metadata: { title: 'Private restored source' } })
  expect(restored.tables.library_entries[0].id).not.toBe(backup.tables.library_entries[0].id)
  expect(restored.tables.collection_series).toHaveLength(1)
  expect(restored.tables.collections.find(collection => collection.name === 'Automatic favorites')?.automatic_rules).toEqual(backup.tables.collections.find(collection => collection.name === 'Automatic favorites')?.automatic_rules)
  expect((await db.query('select * from public.works')).rows).toEqual(sharedBefore)
  expect((await snapshot(bob)).tables).toEqual(foreign.tables)
  expect((await db.query("select story->'metadata'->>'title' title from public.library_search_documents where user_id=$1", [alice])).rows).toEqual([{ title: 'Original title' }]) // manual correction still takes precedence
})

it('rejects foreign owners, forged relationships, unsupported versions, and late constraint errors without partial writes', async () => {
  const backup = await snapshot(), before = structuredClone(backup)
  await expect(preview({ ...backup, user_id: bob })).rejects.toThrow('own account')
  const invalid = structuredClone(backup)
  invalid.tables.library_entry_tags[0].personal_tag_id = (await snapshot(bob)).tables.personal_tags[0].id
  await expect(preview(invalid)).rejects.toThrow('Invalid backup relationship')
  const malformed = { ...backup, version: 99 }
  await expect(preview(malformed)).rejects.toThrow('Unsupported')
  const invalidRules = structuredClone(backup)
  invalidRules.tables.collections.find(collection => collection.name === 'Automatic favorites')!.automatic_rules = { filters: {}, terms: {} }
  await expect(preview(invalidRules)).rejects.toThrow('Invalid automatic collection rules')
  const invalidSeries = structuredClone(backup)
  invalidSeries.tables.library_series[0].metadata = { title: 'Broken series', works: 'invalid' }
  await expect(preview(invalidSeries)).rejects.toThrow('Invalid saved series metadata')
  const prepared = await preview(backup)
  backup.tables.library_entries[0].last_read_chapter = -1
  await expect(restore(backup, prepared.fingerprint)).rejects.toThrow(/check constraint/)
  expect((await snapshot()).tables).toEqual(before.tables)
  expect((await db.query("select tgname from pg_trigger where not tgisinternal and tgenabled='D'")).rows).toEqual([])
})

it('recreates missing work identities as placeholders without accepting uploaded shared metadata', async () => {
  const backup = await snapshot(), foreign = await snapshot(bob)
  const sharedBefore = (await db.query('select * from public.works order by ao3_work_id')).rows
  backup.tables.works[0].ao3_work_id = 999
  backup.tables.works[0].title = 'Do not publish this uploaded title'
  backup.tables.library_entries[0].extension_metadata = { title: 'Private source title' }
  const prepared = await preview(backup)
  await restore(backup, prepared.fingerprint)
  const shared = (await db.query<{ ao3_work_id: number; title: string | null }>('select * from public.works order by ao3_work_id')).rows
  expect(shared.slice(0, -1)).toEqual(sharedBefore)
  expect(shared.at(-1)).toMatchObject({ ao3_work_id: 999, title: null })
  expect((await snapshot()).tables.library_entries[0].extension_metadata).toEqual({ title: 'Private source title' })
  expect((await snapshot(bob)).tables).toEqual(foreign.tables)
})

it('keeps the internal/admin engines inaccessible to browser roles and rejects anonymous restore', async () => {
  await asUser(alice, async () => {
    await expect(db.query('select public.restore_library_backup_internal($1,$2,true,true)', ['{}', bob])).rejects.toThrow('permission denied')
    await expect(db.query('select public.restore_library_backup($1,$2,true)', ['{}', bob])).rejects.toThrow('permission denied')
  })
  await db.exec('set role anon')
  try { await expect(db.query("select public.preview_library_restore('{}')")).rejects.toThrow('permission denied') }
  finally { await db.exec('reset role') }
})
