// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Existing embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite
const owner = '40000000-0000-4000-8000-000000000001', other = '40000000-0000-4000-8000-000000000002'
const batch = '40000000-0000-4000-8000-000000000003', repeat = '40000000-0000-4000-8000-000000000004'
const origin = 'https://fiction.example'
const url = (name: string) => `${origin}/story/${name}`
async function as<T>(user: string, action: () => Promise<T>) {
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`)
 try { return await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
async function sql<T>(command: string, args: unknown[]) {
 return (await db.query<{ result: T }>(`select ${command} as result`, args)).rows[0].result
}
function submit(id: string, urls: string[]) {
 return sql<string>('public.submit_site_import($1,$2)', [id, urls.map(url => ({ url, recognized: true }))])
}
type Job = { id: string; token: string; url: string }
const claim = (id = batch) => sql<Job>('public.claim_site_import($1,$2)', [id, origin])
const finish = (job: Job, metadata: object | null, problem?: string) => sql<boolean>('public.finish_site_import($1,$2,$3,$4,$5,$6)', [batch, job.id, job.token, metadata, { ao3_tags: { text: 'raw text', via: 'Page Metadata' } }, problem ?? null])
type Review = { total: number; reviewNeeded: number; page: number; pages: number; saved: number; issues: Record<string,string>; rows: { id: string; revision: string; progress: number }[] }
const review = (size: number, page = 1, progress = false, edits: object[] | null = null) =>
 sql<Review>('public.review_import_counts($1,$2,$3,$4,$5)', [batch, page, size, progress, edits])

beforeAll(async () => {
 db = await createTestDatabase()
 await db.query('insert into auth.users(id) values($1),($2)', [owner, other])
}, 30000)
afterAll(async () => { await db?.close() })

it('fences cancelled leases, isolates bad links, and saves unknown counts without changing existing data', async () => {
 await as(owner, async () => {
  const urls = ['javascript:alert(1)', url('bad'), url('bad'), ...Array.from({ length: 28 }, (_, index) => url(String(index)))]
  expect(await submit(batch, urls)).toBe(batch)
  expect(await submit(batch, [url('idempotent')])).toBe(batch)
  const job = await claim()
  expect(job.url).toBe(url('bad'))
  await db.query('select public.cancel_import_batch($1)', [batch])
  expect(await finish(job, { title: 'Cancelled' })).toBe(false)
  expect(await claim()).toBeNull()
  await db.query('select public.retry_site_import($1)', [batch])
  const retried = await claim()
  expect(retried.id).toBe(job.id)
  expect(retried.token).not.toBe(job.token)
  expect(await finish(retried, null, 'needs_story_evidence')).toBe(true)
  const claimed = await claim()
  expect(await finish(claimed, { title: 'Bad count', published_chapters: 100001 })).toBe(true)
  for (let n = 1; n <= 27; n++) expect(await finish(await claim(), { title: `Story ${n}` })).toBe(true)
  expect(await claim()).toBeNull()
  const history = await sql<{ summary: object }>('public.paged_import_history($1)', [batch])
  expect(history.summary).toMatchObject({ total: 31, active: false, reviewNeeded: 27, imported: 27, siteBatch: true, counts: { failed: 3, skipped: 1 } })
  expect((await db.query('select distinct metadata_overrides->\'published_chapters\' count,last_read_chapter from public.library_entries')).rows).toEqual([{ count: null, last_read_chapter: 0 }])
  const row = (await review(25)).rows[0]
  await db.query("update public.library_entries set notes='private' where id=$1", [row.id])
  expect(await submit(repeat, [url('1')])).toBe(repeat)
  expect(await claim(repeat)).toBeNull()
  expect((await db.query('select notes from public.library_entries where id=$1', [row.id])).rows).toEqual([{ notes: 'private' }])
  expect((await sql<{ summary: object }>('public.paged_import_history($1)', [repeat])).summary).toMatchObject({ alreadySaved: 1 })
  await expect(db.query("select public.save_library_story_checked(null,$1,$2,null)", [url('manual-unknown'), { metadata: { title: 'Manual', published_chapters: null, chapter_count_manual: false }, status: 'to_read', progress: 0, notes: '', favorite: false, collections: [], tags: [] }])).rejects.toThrow('1–100,000')
 })
})

it('paginates reviews, retains progress, and reports stale and invalid edits per row', async () => {
 await as(owner, async () => {
  expect((await sql<Review>('public.review_import_counts($1)', [batch])).rows).toHaveLength(25)
  expect((await review(25, 2)).rows).toHaveLength(2)
  expect((await review(10)).rows).toHaveLength(10)
  expect((await review(50)).rows).toHaveLength(27)
  const [stale, good, invalid] = (await review(25)).rows
  await db.query("update public.library_entries set last_read_chapter=2,reading_status='reading' where id=$1", [stale.id])
  expect((await review(25, 1, true)).rows).toEqual([expect.objectContaining({ id: stale.id, progress: 2 })])
  const result = await review(25, 1, false, [
   { ...stale, count: '15', manual: true }, { ...invalid, count: '100001', manual: true }, { ...good, count: '100000', manual: true },
  ])
  expect(result).toMatchObject({ saved: 1, reviewNeeded: 26, issues: { [stale.id]: expect.stringMatching(/changed/), [invalid.id]: expect.stringMatching(/100,000/) } })
  expect((await db.query('select metadata_overrides,last_read_chapter from public.library_entries where id=$1', [good.id])).rows[0]).toMatchObject({ metadata_overrides: { published_chapters: 100000, chapter_count_manual: true }, last_read_chapter: 0 })
 })
 await as(other, async () => {
  expect(await claim()).toBeNull()
  await expect(review(25)).rejects.toThrow('Batch unavailable')
 })
})

it('keeps a large checkpoint resumable and fences an expired worker lease', async () => {
 const large = '40000000-0000-4000-8000-000000000005'
 const first = await as(owner, async () => {
  await submit(large, Array.from({ length: 2000 }, (_, index) => url(`large-${index}`)))
  return claim(large)
 })
 await db.query("update public.import_items set site_lease_until=now()-interval '1 second' where id=$1", [first.id])
 await as(owner, async () => {
  const next = await claim(large)
  expect(next).toMatchObject({ id: first.id, url: first.url })
  expect(next.token).not.toBe(first.token)
  const attempt = (job: Job) => sql<boolean>('public.finish_site_import($1,$2,$3,$4)', [large, job.id, job.token, { title: 'Large Import Story' }])
  expect(await attempt(first)).toBe(false)
  expect(await attempt(next)).toBe(true)
  const history = await sql<{ summary: object }>('public.paged_import_history($1)', [large])
  expect(history.summary).toMatchObject({ total: 2000, active: true, imported: 1, reviewNeeded: 1, counts: { pending: 1999 } })
 })
}, 15000)
