// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values('${alice}'),('${bob}');set role authenticated;set request.jwt.claim.sub='${alice}'`) }, 30000)
afterAll(async () => { await db?.close() })
function row(workId: number, overrides: object = {}) { return { workId, url: `https://archiveofourown.org/works/${workId}`, source: 'bookmarks', metadata: { title: `Work ${workId}`, summary: 'Public summary', authors: ['Author'], published_chapters: 3, total_chapters: 3, is_complete: true, ao3_updated_at: '2026-10-01T00:00:00Z' }, bookmarkDate: '2026-10-20', updatedDate: '2026-10-01', notes: 'My saved summary\nSecond paragraph', tags: ['Personal tag'], choice: 'keep', expectedVersion: null, ...overrides } }
async function submit(rows: object[]) { return (await db.query<{ result: { batch: string | null; imported: number; kept: number } }>('select public.submit_ao3_csv_import($1) result', [JSON.stringify(rows)])).rows[0].result }
async function entry(id: number) { return (await db.query<{ id: string; updated_at: string; reading_status: string; last_read_chapter: number; finished_at: string | null; notes: string; extension_metadata: object }>('select e.* from public.library_entries e join public.works w on w.id=e.work_id where w.ao3_work_id=$1 and e.user_id=auth.uid()', [id])).rows[0] }
it('imports bookmark notes/tags privately and records the historical finished date', async () => {
 const result = await submit([row(101)])
 expect(result).toMatchObject({ imported: 1, kept: 0 })
 const saved = await entry(101)
 expect(saved).toMatchObject({ reading_status: 'finished', last_read_chapter: 3, notes: 'My saved summary\nSecond paragraph', extension_metadata: { title: 'Work 101' } })
 expect(new Date(saved.finished_at!).toISOString()).toBe('2026-10-20T00:00:00.000Z')
 expect((await db.query('select * from public.personal_tags')).rows).toEqual([expect.objectContaining({ name: 'Personal tag' })])
 expect((await db.query('select title from public.works where ao3_work_id=101')).rows[0]).toEqual({ title: null })
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect((await db.query("select public.preview_ao3_csv_import(array[101]::bigint[]) result")).rows[0]).toEqual({ result: [] })
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
})
it('keeps existing Later entries even when overwrite is requested, and saves new Later entries unread', async () => {
 const before = await entry(101)
 expect(await submit([row(101, { source: 'marked_for_later', choice: 'overwrite' }), row(102, { source: 'marked_for_later' })])).toMatchObject({ imported: 1, kept: 1 })
 expect(await entry(101)).toEqual(before)
 expect(await entry(102)).toMatchObject({ reading_status: 'to_read', last_read_chapter: 0, finished_at: null })
})
it('supports mixed conflict choices and rejects stale overwrite reviews atomically', async () => {
 const current = await entry(101)
 expect(await submit([row(101), row(103)])).toMatchObject({ imported: 1, kept: 1 })
 const preview = (await db.query<{ result: { workId: number; version: string; notes: string }[] }>('select public.preview_ao3_csv_import(array[101]::bigint[]) result')).rows[0].result[0]
 expect(preview).toMatchObject({ workId: 101, notes: current.notes })
 await db.query("update public.library_entries set notes='Changed after review' where id=$1", [current.id])
 await expect(submit([row(104), row(101, { choice: 'overwrite', expectedVersion: preview.version })])).rejects.toThrow('CSV conflicts changed')
 expect(await entry(104)).toBeUndefined()
 const fresh = await entry(101)
 expect(await submit([row(101, { choice: 'overwrite', expectedVersion: fresh.updated_at, notes: 'Replacement', tags: ['Replacement tag'], bookmarkDate: '2026-09-01' })])).toMatchObject({ imported: 1 })
 expect(await entry(101)).toMatchObject({ notes: 'Replacement', reading_status: 'reading', last_read_chapter: 0, finished_at: null })
})
async function finish(batch: string, dates: Record<string, string>) {
 await db.exec('reset role;reset request.jwt.claim.sub;set role service_role')
 const job = (await db.query<{ id: string }>('select id from public.metadata_jobs where batch_id=$1', [batch])).rows[0]
 const token = '20000000-0000-0000-0000-000000000001'
 await db.query("update public.metadata_jobs set status='processing',lease_token=$2,lease_until=now()+interval '2 minutes',attempts=1 where id=$1", [job.id, token])
 await db.query('select public.finish_metadata_job($1,$2,$3,$4,null,null,false,0)', [job.id, token, JSON.stringify({ title: 'Verified metadata', published_chapters: 3, total_chapters: 3, chapter_dates: dates }), '{}'])
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
}
it('marks only the verified prefix posted strictly before the bookmark day as read', async () => {
 const result = await submit([row(105, { bookmarkDate: '2026-09-01' })])
 await finish(result.batch!, { '1': '2026-08-01', '2': '2026-08-20', '3': '2026-09-01' })
 expect(await entry(105)).toMatchObject({ reading_status: 'reading', last_read_chapter: 2, finished_at: null })
})
it('preserves personal edits while delayed chapter verification completes', async () => {
 const result = await submit([row(106, { bookmarkDate: '2026-09-01' })])
 const saved = await entry(106)
 await db.query("update public.library_entries set last_read_chapter=1,notes='User edit' where id=$1", [saved.id])
 await finish(result.batch!, { '1': '2026-08-01', '2': '2026-08-20', '3': '2026-10-01' })
 expect(await entry(106)).toMatchObject({ notes: 'User edit', last_read_chapter: 1 })
})
it('does not fabricate progress for missing bookmark or chapter dates', async () => {
 const result = await submit([row(107, { bookmarkDate: null })])
 await finish(result.batch!, { '1': '2026-08-01', '2': '2026-08-20', '3': '2026-10-01' })
 expect(await entry(107)).toMatchObject({ reading_status: 'reading', last_read_chapter: 0, finished_at: null })
})

it('fills unknown finished chapter counts from metadata without changing the bookmark finish date', async () => {
 const result = await submit([row(108, { metadata: { title: 'Unknown chapter count' } })])
 await finish(result.batch!, {})
 const saved = await entry(108)
 expect(saved).toMatchObject({ reading_status: 'finished', last_read_chapter: 3 })
 expect(new Date(saved.finished_at!).toISOString()).toBe('2026-10-20T00:00:00.000Z')
})
it('denies anonymous CSV reads and writes', async () => {
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 await expect(db.query('select public.preview_ao3_csv_import(array[101]::bigint[])')).rejects.toThrow('permission denied')
 await expect(db.query('select public.submit_ao3_csv_import($1)', [JSON.stringify([row(109)])])).rejects.toThrow('permission denied')
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
})

it('imports library listing snapshots without work requests and forces keep even on a malicious overwrite', async () => {
 const before = await entry(101)
 const result = (await db.query<{ result: { batch: string; imported: number; kept: number } }>('select public.submit_ao3_library_sync($1) result', [JSON.stringify([row(101, { choice: 'overwrite', notes: 'Must not replace' }), row(901)])])).rows[0].result
 expect(result).toMatchObject({ imported: 1, kept: 1 })
 expect(await entry(101)).toEqual(before)
 expect(await entry(901)).toMatchObject({ extension_metadata: { title: 'Work 901' } })
 expect((await db.query('select status,attempts from public.metadata_jobs where batch_id=$1', [result.batch])).rows).toEqual([{ status: 'completed', attempts: 0 }])
 expect((await db.query('select status,metadata_status from public.import_items where batch_id=$1', [result.batch])).rows).toEqual([{ status: 'completed', metadata_status: 'completed' }])
})
