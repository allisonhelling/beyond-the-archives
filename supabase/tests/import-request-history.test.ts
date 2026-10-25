// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
const scan = '20000000-0000-0000-0000-000000000001'
const source = 'https://archiveofourown.org/users/alice/bookmarks'
const row = (id: number) => ({ workId: id, url: `https://archiveofourown.org/works/${id}`, source: 'marked_for_later', metadata: { title: `Imported Work ${id}`, authors: ['Test Author'], published_chapters: 1, total_chapters: 1 }, notes: '', tags: [] })
type History = { batches: { id: string; sync_id: string; source_url: string }[]; items: { work_info: { title: string; authors: string[] } }[]; summary: { total: number; active: boolean } }
const history = async (id?: string) => (await db.query<{ result: History }>("select public.paged_import_history($1,1,1,'all') result", [id ?? null])).rows[0].result
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values('${alice}'),('${bob}');set role authenticated;set request.jwt.claim.sub='${alice}'`) }, 30000)
afterAll(async () => { await db?.close() })
it('combines every page of one scan and supplies completed work names and authors', async () => {
 const ids: string[] = []
 for (const id of [123, 456]) ids.push((await db.query<{ result: { batch: string } }>('select public.submit_ao3_library_sync($1,$2,$3) result', [JSON.stringify([row(id)]), scan, source])).rows[0].result.batch)
 for (const id of ids) {
  const result = await history(id)
  expect(result.batches).toHaveLength(1)
  expect(result.batches[0]).toMatchObject({ sync_id: scan, source_url: source })
  expect(result.summary).toMatchObject({ total: 2, active: false })
  expect(result.items.map(item => item.work_info)).toEqual(expect.arrayContaining([123, 456].map(id => ({ title: `Imported Work ${id}`, authors: ['Test Author'], author_links: {} }))))
 }
})
it('keeps separate requests separate and cancels every batch in only the selected scan', async () => {
 await db.query('select public.submit_ao3_library_sync($1,$2,$3)', [JSON.stringify([row(789)]), '20000000-0000-0000-0000-000000000002', source])
 expect((await history()).batches).toHaveLength(2)
 const selected = (await history()).batches.find(batch => batch.sync_id === scan)!
 await db.query('select public.cancel_import_batch($1)', [selected.id])
 const counts = await db.query<{ cancelled: number; other_cancelled: number }>('select count(*) filter(where sync_id=$1 and cancelled_at is not null)::integer cancelled,count(*) filter(where sync_id<>$1 and cancelled_at is not null)::integer other_cancelled from public.import_batches', [scan])
 expect(counts.rows[0]).toEqual({ cancelled: 2, other_cancelled: 0 })
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`)
 expect((await history()).items).toEqual([])
 await expect(db.query('select public.cancel_import_batch($1)', [selected.id])).rejects.toThrow('Batch unavailable')
})
