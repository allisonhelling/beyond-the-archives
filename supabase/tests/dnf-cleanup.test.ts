// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { defaultCleanupSettings, type CleanupResult } from '../../src/features/settings/dnf-cleanup'
import { blankMetadata } from '../../src/features/library/model'

vi.mock('../../src/lib/supabase', () => ({ supabase: null }))

let db: PGlite, sequence = 80000
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values('${alice}'),('${bob}')`) }, 30000)
afterAll(async () => { await db?.close() })
async function asUser(user = alice) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${user}'`) }
async function admin() { await db.exec('reset role; reset request.jwt.claim.sub') }
beforeEach(async () => {
 await admin()
 await db.exec('delete from public.import_batches; delete from public.library_entries; delete from public.reading_records; delete from public.metadata_preferences')
 await asUser()
})
async function call(action = 'get', input: object = {}) {
 return (await db.query<{ result: CleanupResult }>('select public.dnf_cleanup($1,$2) result', [action, JSON.stringify(input)])).rows[0].result
}
async function saveSettings(patch = {}) {
 const base = (await call()).settings
 return call('save', { settings: { ...base, ...patch }, base })
}
async function add(status = 'did_not_finish', metadata = {}) {
 const workId = ++sequence
 const id = (await db.query<{ id: string }>(`select public.save_library_story($1,$2,$3,2,'',null,false,'{}','{}') id`, [
  `https://archiveofourown.org/works/${workId}`, JSON.stringify({ ...blankMetadata, title: 'Keep my reading history', authors: ['Writer'], fandoms: ['Fandom'], word_count: 12345, published_chapters: 5, total_chapters: 5, ...metadata }), status,
 ])).rows[0].id
 return { id, workId }
}
async function expire(id: string, hours = 200) {
 await admin()
 await db.exec('alter table public.library_entries disable trigger zz_dnf_since')
 await db.query("update public.library_entries set dnf_since=now()-make_interval(hours=>$2) where id=$1", [id, hours])
 await db.exec('alter table public.library_entries enable trigger zz_dnf_since')
 await asUser()
}
async function clean() {
 const preview = await call('preview')
 return call('cleanup', { settings: preview.settings, entries: preview.entries })
}

it('defaults to disabled and seven days, supports presets and custom whole hours, and rejects malformed settings', async () => {
 expect((await call()).settings).toEqual(defaultCleanupSettings)
 for (const hours of [24, 168, 720, 1440, 49, 87600]) expect((await saveSettings({ hours })).settings.hours).toBe(hours)
 for (const hours of [0, 23, 24.5, 87601, '168', null]) await expect(saveSettings({ hours })).rejects.toThrow()
 await expect(call('save', { settings: { ...defaultCleanupSettings, enabled: 'yes' }, base: (await call()).settings })).rejects.toThrow()
 await expect(call('save', { settings: { ...defaultCleanupSettings, enabled: true }, base: defaultCleanupSettings })).rejects.toThrow('changed')
})

it('starts the retention clock on DNF transitions, preserves it on edits, and resets after leaving DNF', async () => {
 const { id } = await add('reading')
 expect((await db.query<{ dnf_since: string | null }>('select dnf_since from public.library_entries where id=$1', [id])).rows[0].dnf_since).toBeNull()
 await db.query("update public.library_entries set reading_status='did_not_finish' where id=$1", [id])
 await expire(id)
 const old = (await db.query<{ dnf_since: string | null }>('select dnf_since from public.library_entries where id=$1', [id])).rows[0].dnf_since
 await db.query("update public.library_entries set notes='An edit' where id=$1", [id])
 expect((await db.query<{ dnf_since: string | null }>('select dnf_since from public.library_entries where id=$1', [id])).rows[0].dnf_since).toEqual(old)
 await db.query("update public.library_entries set reading_status='reading' where id=$1", [id])
 expect((await db.query<{ dnf_since: string | null }>('select dnf_since from public.library_entries where id=$1', [id])).rows[0].dnf_since).toBeNull()
 await db.query("update public.library_entries set reading_status='did_not_finish',notes='' where id=$1", [id])
 expect((await call()).waiting).toBe(1)
})

it('archives the effective compact snapshot, preserves prior completion history, and deletes only private details', async () => {
 const { id, workId } = await add('finished')
 await db.query("update public.library_entries set reading_status='did_not_finish' where id=$1", [id])
 await expire(id)
 const history = (await db.query<{ reading_history: unknown }>('select reading_history from public.library_entries where id=$1', [id])).rows[0].reading_history
 expect((await clean()).removed).toBe(1)
 const record = (await db.query<{ metadata: object; reading_history: unknown; ao3_work_id: number; last_read_chapter: number }>('select * from public.reading_records where id=$1', [id])).rows[0]
 expect(record).toMatchObject({ ao3_work_id: workId, last_read_chapter: 2, metadata: { title: 'Keep my reading history', authors: ['Writer'], fandoms: ['Fandom'], word_count: 12345 } })
 expect(record.reading_history).toEqual(history)
 expect(record.metadata).not.toHaveProperty('summary')
 expect(record).not.toHaveProperty('notes')
 expect((await db.query('select * from public.library_entries where id=$1', [id])).rows).toHaveLength(0)
 await admin()
 expect((await db.query('select * from public.works where ao3_work_id=$1', [workId])).rows).toHaveLength(1)
 await asUser()
 expect((await db.query('select * from public.reading_activity where id=$1', [id])).rows).toHaveLength(1)
 expect((await call('archive') as unknown as { total: number }).total).toBe(1)
 await expect(db.query('select public.run_scheduled_dnf_cleanup()')).rejects.toThrow('permission denied')
})

it('protects favorites, recs, personal details, manual collections, and pending jobs', async () => {
 const entries = []
 for (let i = 0; i < 7; i++) { const entry = await add(); await expire(entry.id); entries.push(entry) }
 await db.query('update public.library_entries set is_favorite=true where id=$1', [entries[0].id])
 await db.query("select public.update_library_entry_checked($1,'{\"rec\":true}','{\"rec\":false}')", [entries[1].id])
 await db.query("update public.library_entries set notes='Personal' where id=$1", [entries[2].id])
 await db.query('update public.library_entries set personal_rating=4 where id=$1', [entries[3].id])
 await db.query("insert into public.personal_tags(user_id,name) values($1,'Mine')", [alice])
 await db.query('insert into public.library_entry_tags(user_id,library_entry_id,personal_tag_id) select $1,$2,id from public.personal_tags where user_id=$1', [alice, entries[4].id])
 const collection = (await db.query<{ id: string }>("insert into public.collections(user_id,name) values($1,'Manual') returning id", [alice])).rows[0].id
 await db.query('insert into public.collection_works(user_id,collection_id,library_entry_id) values($1,$2,$3)', [alice, collection, entries[5].id])
 await db.query('select public.submit_import_urls($1)', [[`https://archiveofourown.org/works/${entries[6].workId}`]])
 expect(await call()).toMatchObject({ eligible: 0, protected: 7 })
 await saveSettings({ protect_favorites: false, protect_personal: false, protect_collections: false })
 expect((await clean()).removed).toBe(6)
 expect((await call()).protected).toBe(1)
})

it('requires a matching preview and rechecks edits, settings, status, and elapsed time', async () => {
 const first = await add(); await expire(first.id)
 await add()
 const preview = await call('preview')
 expect(preview.entries).toHaveLength(1)
 await db.query("update public.library_entries set notes='Edited after preview' where id=$1", [first.id])
 await expect(call('cleanup', { settings: preview.settings, entries: preview.entries })).rejects.toThrow('changed')
 await expect(call('cleanup', { settings: preview.settings, entries: [] })).rejects.toThrow('Preview')
 await saveSettings({ hours: 720 })
 await expect(call('cleanup', { settings: preview.settings, entries: preview.entries })).rejects.toThrow('changed')
 expect((await db.query('select * from public.reading_records')).rows).toHaveLength(0)
})

it('runs automatically only for opted-in accounts and is safe to retry', async () => {
 const { id } = await add(); await expire(id)
 await admin()
 expect((await db.query<{ n: number }>('select public.run_scheduled_dnf_cleanup() n')).rows[0].n).toBe(0)
 await asUser(); await saveSettings({ enabled: true, hours: 24 })
 await admin()
 expect((await db.query<{ n: number }>('select public.run_scheduled_dnf_cleanup() n')).rows[0].n).toBe(1)
 expect((await db.query<{ n: number }>('select public.run_scheduled_dnf_cleanup() n')).rows[0].n).toBe(0)
 expect((await db.query('select * from public.reading_records')).rows).toHaveLength(1)
})

it('rolls back deletion when archive preservation fails', async () => {
 const { id } = await add(); await expire(id)
 await admin()
 await db.query(`insert into public.reading_records select * from jsonb_populate_record(null::public.reading_records,
  (select public.compact_reading_record(story)||jsonb_build_object('archived_at',now()) from public.library_search_documents where id=$1))`, [id])
 await asUser()
 await expect(clean()).rejects.toThrow('duplicate key')
 expect((await db.query('select * from public.library_entries where id=$1', [id])).rows).toHaveLength(1)
})

it('keeps routine imports archived and allows an explicit add as a new lifecycle', async () => {
 const { id, workId } = await add(); await expire(id); await clean()
 const rows = JSON.stringify([{ workId, url: `https://archiveofourown.org/works/${workId}`, source: 'marked_for_later', metadata: blankMetadata }])
 for (const fn of ['submit_ao3_csv_import', 'submit_ao3_library_sync']) {
  const result = (await db.query<{ result: { archived: number } }>(`select public.${fn}($1) result`, [rows])).rows[0].result
  expect(result.archived).toBe(1)
 }
 expect((await db.query('select * from public.library_entries')).rows).toHaveLength(0)
 await db.query('select public.submit_import_urls($1)', [[`https://archiveofourown.org/works/${workId}`]])
 expect((await db.query<{ id: string }>('select id from public.library_entries')).rows[0].id).not.toBe(id)
 expect((await db.query('select * from public.reading_activity')).rows).toHaveLength(2)
})

it('enforces account isolation and denies client archive writes and scheduler access', async () => {
 const { id } = await add(); await expire(id); await clean()
 await asUser(bob)
 expect((await call('archive') as unknown as { total: number }).total).toBe(0)
 expect((await db.query('select * from public.reading_records')).rows).toHaveLength(0)
 await expect(db.exec('delete from public.reading_records')).rejects.toThrow('permission denied')
 await expect(db.query('select public.run_scheduled_dnf_cleanup()')).rejects.toThrow('permission denied')
 await db.exec('reset role; reset request.jwt.claim.sub; set role anon')
 await expect(call()).rejects.toThrow('permission denied')
})

it('exports and restores records and preferences, remaps ownership, and accepts older files', async () => {
 const { id } = await add(); await expire(id); await clean(); await saveSettings({ hours: 49 })
 const backup = (await db.query<{ result: { tables: Record<string, unknown[]> } }>('select public.export_library_backup() result')).rows[0].result
 expect(backup.tables.reading_records).toHaveLength(1)
 await db.query('select public.preview_library_restore($1)', [JSON.stringify(backup)])
 await admin(); await db.exec('set role service_role')
 await db.query('select public.restore_library_backup($1,$2,true)', [JSON.stringify(backup), bob])
 await asUser(bob)
 expect((await call()).settings.hours).toBe(49)
 expect((await db.query<{ user_id: string; id: string }>('select * from public.reading_records')).rows[0]).toMatchObject({ user_id: bob })
 expect((await db.query<{ id: string }>('select id from public.reading_records')).rows[0].id).not.toBe(id)
 await asUser()
 delete backup.tables.reading_records
 for (const row of backup.tables.metadata_preferences) delete (row as Record<string, unknown>).dnf_cleanup
 await db.query('select public.preview_library_restore($1)', [JSON.stringify(backup)])
})
