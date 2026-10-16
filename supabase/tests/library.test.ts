// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
let entry: string
async function user(id: string, action: () => Promise<void>) { await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`); try { await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub;') } }
async function save(options: { url?: string; metadata?: object; status?: string; progress?: number; id?: string; collections?: string[]; tags?: string[] } = {}) {
  return db.query<{ id: string }>('select public.save_library_story($1,$2,$3,$4,$5,$6::smallint,$7,$8::uuid[],$9::text[],$10::uuid) as id', [options.url ?? 'https://archiveofourown.org/works/123/chapters/999?view_adult=true', JSON.stringify(options.metadata ?? { title: 'Private title', authors: ['A', 'B'], series: ['Manual series'], fandoms: ['F'], ao3_tags: ['AO3 tag'], total_chapters: null, published_chapters: null }), options.status ?? 'reading', options.progress ?? 0, 'Private notes', 4, true, options.collections ?? [], options.tags ?? ['Comfort', 'Revisit'], options.id ?? null])
}
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values ('${alice}'),('${bob}')`) }, 30000)
afterAll(async () => { await db?.close() })
it('saves manually without retrieval, preserving unknown counts, original URL and private metadata', async () => {
  await user(alice, async () => {
    entry = (await save()).rows[0].id
    const row = (await db.query<{ original_url: string; metadata_overrides: object }>('select * from public.library_entries where id=$1', [entry])).rows[0]
    expect(row.original_url).toContain('/chapters/999?view_adult=true')
    expect(row.metadata_overrides).toMatchObject({ title: 'Private title', authors: ['A', 'B'], series: ['Manual series'], total_chapters: null })
    expect((await db.query('select canonical_url,last_metadata_check,title from public.works')).rows[0]).toEqual({ canonical_url: null, last_metadata_check: null, title: null })
    expect((await db.query('select * from public.library_entry_tags')).rows).toHaveLength(2)
  })
})
it('prevents duplicates using work identity across chapter and query URL variants', async () => {
  await user(alice, async () => { await expect(save({ url: 'https://archiveofourown.org/works/123' })).rejects.toThrow(/unique/) })
})
it('rejects invalid URLs, malformed metadata and invalid progress atomically', async () => {
  await user(alice, async () => {
    for (const url of ['https://evil.test/works/22', 'https://archiveofourown.org/works/0', 'https://archiveofourown.org/works/123/chapters/0']) await expect(save({ url })).rejects.toThrow()
    for (const metadata of [{ title: '' }, { title: 'X', total_chapters: 0 }, { title: 'X', total_chapters: -1 }, { title: 'X', published_chapters: 3, total_chapters: 2 }, { title: 'X', authors: 'wrong' }, { title: 'X', rating: 'wrong' }]) await expect(save({ url: 'https://archiveofourown.org/works/124', metadata })).rejects.toThrow()
    await expect(save({ id: entry, progress: -1 })).rejects.toThrow()
    await expect(save({ id: entry, progress: 4, metadata: { title: 'X', published_chapters: 3 } })).rejects.toThrow()
    expect((await db.query('select * from public.works where ao3_work_id=124')).rows).toHaveLength(0)
  })
})
it('supports edits, favorites, all statuses, DNF recovery and re-reading without data loss', async () => {
  await user(alice, async () => {
    for (const status of ['to_read', 'reading', 'waiting_for_updates', 're_reading', 'finished', 'did_not_finish', 'reading']) {
      await save({ id: entry, status, progress: 3, metadata: { title: 'Corrected title', summary: 'Correction', publication_status: 'complete', published_chapters: 6, total_chapters: 6 } })
      const row = (await db.query<{ reading_status: string; notes: string; metadata_overrides: object }>('select * from public.library_entries where id=$1', [entry])).rows[0]
      expect(row.reading_status).toBe(status); expect(row.notes).toBe('Private notes'); expect(row.metadata_overrides).toMatchObject({ authors: ['A', 'B'] })
    }
    await db.query('update public.library_entries set last_read_chapter=6,is_favorite=false where id=$1', [entry])
    expect((await db.query('select reading_status,is_favorite from public.library_entries where id=$1', [entry])).rows[0]).toEqual({ reading_status: 'reading', is_favorite: false })
  })
})
it('persists across independent authenticated sessions, supports multiple collections, rename and deletion', async () => {
  await user(alice, async () => {
    const ids = (await db.query<{ id: string }>("insert into public.collections(name) values ('One'),('Two') returning id")).rows.map(r => r.id)
    await save({ id: entry, collections: ids, tags: ['Personal only'], progress: 3 })
    expect((await db.query('select * from public.collection_works')).rows).toHaveLength(2)
    await db.query("update public.collections set name='Renamed' where id=$1", [ids[0]])
    await db.query('delete from public.collections where id=$1', [ids[1]])
    expect((await db.query('select * from public.collection_works')).rows).toHaveLength(1)
  })
  await user(alice, async () => { expect((await db.query('select notes,last_read_chapter from public.library_entries where id=$1', [entry])).rows[0]).toEqual({ notes: 'Private notes', last_read_chapter: 3 }); expect((await db.query('select * from public.library_entry_tags')).rows).toHaveLength(1) })
})
it('rejects anonymous saves and cross-account edits or collection assignments', async () => {
  await db.exec('set role anon'); try { await expect(save()).rejects.toThrow(/permission denied/) } finally { await db.exec('reset role') }
  await user('', async () => { await expect(save()).rejects.toThrow(/Authentication required/) })
  await user(bob, async () => {
    expect((await db.query('select * from public.library_entries')).rows).toHaveLength(0)
    await expect(save({ id: entry })).rejects.toThrow(/unavailable/)
    const foreign = (await db.query<{ id: string }>('select id from public.collections')).rows
    expect(foreign).toHaveLength(0)
    await save({ metadata: { title: 'Bob private' } })
    expect((await db.query<{ metadata_overrides: object }>('select metadata_overrides from public.library_entries')).rows[0].metadata_overrides).toEqual({ title: 'Bob private' })
  })
  const other = (await db.query<{ id: string }>("insert into public.collections(user_id,name) values ($1,'Bobs shelf') returning id", [bob])).rows[0].id
  await user(alice, async () => { await expect(save({ id: entry, collections: [other] })).rejects.toThrow(/Collection unavailable/) })
})
it('preserves manual overrides when trusted shared metadata changes', async () => {
  await db.exec("update public.works set title='Automatic title',is_complete=true where ao3_work_id=123")
  await user(alice, async () => { expect((await db.query<{ metadata_overrides: { title: string }; reading_status: string }>('select metadata_overrides,reading_status from public.library_entries where id=$1', [entry])).rows[0]).toMatchObject({ metadata_overrides: { title: 'Private title' }, reading_status: 'reading' }) })
})
it('deletes only the owned entry and cascades memberships, preserving the other account', async () => {
  await user(alice, async () => { await db.query('delete from public.library_entries where id=$1', [entry]); expect((await db.query('select * from public.library_entry_tags')).rows).toHaveLength(0); expect((await db.query('select * from public.collection_works')).rows).toHaveLength(0) })
  await user(bob, async () => { expect((await db.query('select * from public.library_entries')).rows).toHaveLength(1) })
})


it('atomically restores a removed entry, private links and exact saved timestamps with account isolation', async () => {
  let snapshot: Record<string, unknown>, collections: string[], tags: string[]
  await user(alice, async () => {
    const collection = (await db.query<{ id: string }>("insert into public.collections(name) values ('Undo shelf') returning id")).rows[0].id
    const id = (await save({ url: 'https://archiveofourown.org/works/990', collections: [collection], tags: ['Undo tag'], progress: 2 })).rows[0].id
    snapshot = (await db.query<Record<string, unknown>>('select * from public.library_entries where id=$1', [id])).rows[0]
    collections = [collection]; tags = ['Undo tag']
    await db.query('delete from public.library_entries where id=$1', [id])
    expect((await db.query('select * from public.library_entry_tags where library_entry_id=$1', [id])).rows).toHaveLength(0)
    for (const original_url of ['https://evil.example/works/990', 'https://archiveofourown.org/works/991']) {
      await expect(db.query('select public.restore_library_story($1,$2::uuid[],$3::text[])', [JSON.stringify({ ...snapshot, original_url }), collections, tags])).rejects.toThrow(/identity/)
      expect((await db.query('select * from public.library_entries where id=$1', [id])).rows).toHaveLength(0)
    }
    await db.query('select public.restore_library_story($1,$2::uuid[],$3::text[])', [JSON.stringify(snapshot), collections, tags])
    expect((await db.query('select * from public.library_entries where id=$1', [id])).rows[0]).toEqual(snapshot)
    expect((await db.query('select * from public.library_entry_tags where library_entry_id=$1', [id])).rows).toHaveLength(1)
    expect((await db.query('select * from public.collection_works where library_entry_id=$1', [id])).rows).toHaveLength(1)
    await expect(db.query('select public.restore_library_story($1,$2::uuid[],$3::text[])', [JSON.stringify(snapshot), collections, tags])).rejects.toThrow(/unique/)
    await db.query('delete from public.library_entries where id=$1', [id])
  })
  await user(bob, async () => {
    await expect(db.query('select public.restore_library_story($1,$2::uuid[],$3::text[])', [JSON.stringify(snapshot), collections, tags])).rejects.toThrow(/unavailable/)
  })
  await db.exec('set role anon')
  try { await expect(db.query('select public.restore_library_story($1,$2::uuid[],$3::text[])', [JSON.stringify(snapshot!), collections!, tags!])).rejects.toThrow(/permission denied/) } finally { await db.exec('reset role') }
})
