// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { readAo3Rows } from '../../src/features/imports/ao3-csv'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values('${alice}'),('${bob}');set role authenticated;set request.jwt.claim.sub='${alice}'`) }, 30000)
afterAll(async () => { await db?.close() })
const available = (id: number) => ({ workId: id, url: `https://archiveofourown.org/works/${id}`, source: 'bookmarks', bookmarkId: id + 1000, bookmarkStatus: 'private', workStatus: 'available', metadata: { title: 'The Stars Between Us', summary: 'Original summary', authors: ['ExampleAuthor'], fandoms: ['Star Wars'], published_chapters: 8, total_chapters: 8, is_complete: true }, bookmarkDate: '2026-10-20', updatedDate: '2026-10-01', notes: 'Loved chapter 8!', tags: ['Favorites', 'To Reread'], choice: 'keep' })
const deleted = (bid: number) => ({ workId: null, url: `https://archiveofourown.org/bookmarks/${bid}`, source: 'bookmarks', bookmarkId: bid, workStatus: 'deleted', metadata: {}, bookmarkDate: '2026-10-20', updatedDate: null, notes: 'Remaining bookmark notes', tags: ['Favorite'], choice: 'keep' })
async function sync(rows: object[]) { return (await db.query<{ result: { imported: number; kept: number; batch: string | null } }>('select public.submit_ao3_library_sync($1) result', [JSON.stringify(rows)])).rows[0].result }
async function story(bid: number) { return (await db.query<{ story: Record<string, unknown> }>("select story from public.library_story_documents where story->'source_bookmark'->>'id'=$1", [String(bid)])).rows[0]?.story }
it('retains a deleted bookmark by identity and preserves all previously imported data', async () => {
 await sync([available(101)])
 const before = await story(1101)
 expect(before).toMatchObject({ work_status: 'available', source_bookmark: { id: '1101', status: 'private' }, metadata: { title: 'The Stars Between Us' } })
 const rows = readAo3Rows([{ source_list: 'bookmarks', work_status: 'deleted', title: '', summary: '', author: '', fandoms: '', words: '', chapters: '',
  link: 'https://archiveofourown.org/bookmarks/1101', 'bookmark id': '1101', 'bookmark status': 'private rec', 'bookmark date': '21 Oct 2026',
  'bookmark user': 'alice', 'bookmark count': '0', 'bookmark notes': 'Remaining bookmark notes\nStill visible', 'bookmark tags': 'Favorite, To Reread' }])
 expect(rows[0].metadata).toEqual({})
 expect(await sync(rows)).toMatchObject({ imported: 0, kept: 1 })
 const after = await story(1101)
 expect(after).toMatchObject({ id: before!.id, work_status: 'deleted', metadata: { ...(before!.metadata as object), publication_status: 'deleted' }, notes: before!.notes, personalTags: before!.personalTags, reading_status: before!.reading_status, last_read_chapter: before!.last_read_chapter, finished_at: before!.finished_at })
 expect(after).toMatchObject({ work: before!.work, extension_metadata: before!.extension_metadata, metadata_overrides: before!.metadata_overrides,
  source_bookmark: { id: '1101', url: 'https://archiveofourown.org/bookmarks/1101', status: 'private rec', date: '2026-10-20', user: 'alice', count: 0, notes: 'Remaining bookmark notes\nStill visible', tags: ['Favorite', 'To Reread'] } })
 expect((after!.work as { ao3_work_id: number }).ao3_work_id).toBe(101)
 expect((await db.query('select count(*)::integer n from public.metadata_jobs where entry_id=$1', [before!.id])).rows[0]).toEqual({ n: 1 })
})
it('creates independent bookmark-only placeholders without fabricating source metadata or work IDs', async () => {
 expect(await sync([deleted(2201), deleted(2202)])).toMatchObject({ imported: 2, kept: 0, batch: null })
 const first = await story(2201), second = await story(2202)
 expect(first).toMatchObject({ work_status: 'deleted', original_url: 'https://archiveofourown.org/bookmarks/2201', notes: 'Remaining bookmark notes', personalTags: ['Favorite'], metadata: { title: 'Deleted Work — Bookmark #2201', authors: [], fandoms: [] }, work: { ao3_work_id: null, title: null }, extension_metadata: {}, metadata_overrides: {} })
 expect(first!.work_id).not.toBe(second!.work_id)
 expect(await sync([deleted(2201)])).toMatchObject({ imported: 0, kept: 1 })
 const preview = (await db.query<{ result: unknown[] }>('select public.preview_ao3_csv_import($1,$2) result', [[], [2201]])).rows[0].result
 expect(preview).toEqual([expect.objectContaining({ id: first!.id, workId: null, bookmarkId: 2201 })])
})
it('applies explicit deletions in Quick Sync and ignores the former opt-out for saved scans', async () => {
 await sync([available(102), available(103)])
 await sync([{ ...deleted(1102), scanMode: 'quick' }, { ...deleted(2203), scanMode: 'quick' }])
 expect(await story(1102)).toMatchObject({ work_status: 'deleted', metadata: { publication_status: 'deleted' } })
 expect(await story(2203)).toMatchObject({ work_status: 'deleted' })
 expect(await story(1103)).toMatchObject({ work_status: 'available' })
 await sync([{ ...deleted(1102), updateDeleted: false }])
 expect(await story(1102)).toMatchObject({ work_status: 'deleted', metadata: { publication_status: 'deleted' } })
 await sync([deleted(1102)])
 expect(await story(1102)).toMatchObject({ work_status: 'deleted' })
})
it('never guesses a deleted bookmark’s work from its notes, title, or missing listings', async () => {
 await sync([{ ...available(104), bookmarkId: undefined }])
 await sync([{ ...deleted(1104), metadata: { title: 'The Stars Between Us' } }])
 const original = (await db.query<{ work_status: string }>('select e.work_status from public.library_entries e join public.works w on w.id=e.work_id where w.ao3_work_id=104')).rows[0]
 expect(original.work_status).toBe('available')
 expect(await story(1104)).toMatchObject({ work: { ao3_work_id: null } })
})
it('keeps deleted status private and rejects anonymous and invalid observations atomically', async () => {
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect(await story(1101)).toBeUndefined()
 await sync([available(101)])
 expect(await story(1101)).toMatchObject({ work_status: 'available' })
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
 expect(await story(1101)).toMatchObject({ work_status: 'deleted' })
 await expect(sync([deleted(3001), { ...deleted(3002), url: 'https://evil.test/bookmarks/3002' }])).rejects.toThrow('Invalid bookmark observation')
 expect(await story(3001)).toBeUndefined()
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 await expect(sync([deleted(3003)])).rejects.toThrow()
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
})
it('allows editing, removing, and undoing a bookmark-only entry through shared boundaries', async () => {
 const saved = await story(2201)
 await db.query('select public.save_library_story($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [saved!.original_url, '{}', 'reading', 0, 'Edited note', null, false, [], ['Edited tag'], saved!.id])
 expect(await story(2201)).toMatchObject({ notes: 'Edited note', personalTags: ['Edited tag'], work_status: 'deleted' })
 const entry = (await db.query<{ e: object }>('select to_jsonb(e) e from public.library_entries e where id=$1', [saved!.id])).rows[0].e
 await db.query('delete from public.library_entries where id=$1', [saved!.id])
 await db.query('select public.restore_library_story($1,$2,$3)', [JSON.stringify(entry), [], ['Edited tag']])
 expect(await story(2201)).toMatchObject({ id: saved!.id, work_status: 'deleted', notes: 'Edited note' })
})
it('can resolve an anonymous bookmark-only entry to an explicitly observed work ID without duplicating it', async () => {
 const before = await story(2202)
 await sync([{ ...available(1202), bookmarkId: 2202 }])
 expect(await story(2202)).toMatchObject({ id: before!.id, work_status: 'available', work: { ao3_work_id: 1202 }, metadata: { title: 'The Stars Between Us' }, notes: before!.notes })
})

it('reviews deleted-bookmark personal conflicts without replacing saved metadata or reading history', async () => {
 const original = await story(1101)
 const savedEntry = (await db.query<{ version: string }>('select updated_at::text version from public.library_entries where id=$1', [original!.id])).rows[0]
 await db.query('select public.submit_ao3_csv_import($1)', [JSON.stringify([{ ...deleted(1101), choice: 'overwrite', expectedVersion: savedEntry.version, notes: 'Approved bookmark note', tags: ['Approved tag'] }])])
 expect(await story(1101)).toMatchObject({ notes: 'Approved bookmark note', personalTags: ['Approved tag'], metadata: original!.metadata, reading_status: original!.reading_status, last_read_chapter: original!.last_read_chapter, finished_at: original!.finished_at })
 await expect(db.query('select public.submit_ao3_csv_import($1)', [JSON.stringify([{ ...deleted(1101), choice: 'overwrite', expectedVersion: savedEntry.version, notes: 'Stale replacement' }])])).rejects.toThrow('CSV conflicts changed')
 expect(await story(1101)).toMatchObject({ notes: 'Approved bookmark note' })
})
it('includes deleted status and bookmark identity in library queries and backup restore preview', async () => {
 const listing = (await db.query<{ result: { stories: object[] } }>("select public.query_library('{\"mode\":\"library\",\"shelf\":\"all\"}',1,100) result")).rows[0].result
 expect(listing.stories).toContainEqual(expect.objectContaining({ work_status: 'deleted', source_bookmark: expect.objectContaining({ id: '2201' }), metadata: expect.objectContaining({ title: 'Deleted Work — Bookmark #2201' }) }))
 const backup = (await db.query<{ b: object }>('select public.export_library_backup() b')).rows[0].b
 await expect(db.query('select public.preview_library_restore($1)', [JSON.stringify(backup)])).resolves.toBeTruthy()
 expect(await story(2201)).toMatchObject({ work_status: 'deleted', notes: 'Edited note' })
})

it('filters Deleted as publication status while preserving stored source metadata and private corrections', async () => {
 const listing = (await db.query<{ result: { stories: { metadata: { publication_status: string } }[] } }>(`select public.query_library('{"mode":"library","shelf":"all","filters":{"publication":["deleted"]}}',1,100) result`)).rows[0].result
 expect(listing.stories.length).toBeGreaterThan(0)
 expect(listing.stories.every(story => story.metadata.publication_status === 'deleted')).toBe(true)
 const saved = await story(1101)
 expect(saved).toMatchObject({ metadata: { title: 'The Stars Between Us', publication_status: 'deleted', published_chapters: 8 }, extension_metadata: { is_complete: true, publication_status: 'complete' } })
 expect((await db.query<{ text: string }>("select public.library_search_text($1,'any') text", [JSON.stringify(saved)])).rows[0].text).not.toContain('AO3 Status Unknown')
})

it('records a manual Deleted declaration after an owner-confirmed 404 while preserving reading history', async () => {
 await sync([available(105)])
 const before = await story(1105)
 const job = (await db.query<{ id: string }>('select id from public.metadata_jobs where entry_id=$1', [before!.id])).rows[0]
 await expect(db.query('select public.mark_work_deleted($1,$2)', [before!.id, job.id])).rejects.toThrow('404 refresh')
 await db.exec('reset role')
 await db.query("update public.metadata_jobs set status='failed',error_category='not_found' where id=$1", [job.id])
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${bob}'`)
 await expect(db.query('select public.mark_work_deleted($1,$2)', [before!.id, job.id])).rejects.toThrow('404 refresh')
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
 await db.query('select public.mark_work_deleted($1,$2)', [before!.id, job.id])
 expect(await story(1105)).toMatchObject({ ...before, work_status: 'deleted', metadata: { ...(before!.metadata as object), publication_status: 'deleted' }, metadata_overrides: { ...(before!.metadata_overrides as object), publication_status: 'deleted' }, metadata_confirmation_times: expect.objectContaining({ publication_status: expect.any(String) }), updated_at: expect.any(String) })
})
it('saves true, false and unknown Rec observations without changing Favorites or work metadata', async () => {
 await sync([{ ...available(107), bookmarkRec: true }])
 const before = await story(1107)
 expect(before).toMatchObject({ source_bookmark: { rec: true }, is_favorite: false })
 for (const rec of [false, true, null]) {
  await sync([{ ...available(107), bookmarkRec: rec }])
  expect(await story(1107)).toMatchObject({ source_bookmark: { rec }, is_favorite: false, metadata: before!.metadata })
 }
 await sync([{ ...deleted(1107), bookmarkRec: null }])
 expect(await story(1107)).toMatchObject({ work_status: 'deleted', source_bookmark: { rec: null } })
 await expect(sync([{ ...available(107), bookmarkRec: 'false' }])).rejects.toThrow('Invalid bookmark Rec')
})
