// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
const scan = '20000000-0000-0000-0000-000000000001'
const report = { id: scan, status: 'complete', url: 'https://archiveofourown.org/users/alice/bookmarks', autoImport: true, listPages: 117, pages: 117, count: 2037, skipped: 4, checkChapterDates: true, chapterDatesChecked: 201, chapterDatesUnavailable: 2,
 skippedEntries: [{ title: 'Hidden', url: 'https://archiveofourown.org/bookmarks/12', sourceUrl: 'https://archiveofourown.org/users/alice/bookmarks?page=4', reason: 'No work link' }],
 chapterDateIssues: [{ title: 'Work', workId: 34, url: 'https://archiveofourown.org/works/34', sourceUrl: 'https://archiveofourown.org/works/34/navigate', reason: 'Incomplete dates', expectedChapters: 5, foundChapters: 3 }] }
type History = { total: number; reports: { id: string; completed_at: string; report: typeof report }[] }
async function asUser(id = alice) { await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`) }
async function history(value: unknown = null, page = 1) { return (await db.query<{ result: History }>('select public.library_sync_report_history($1,$2) result', [value === null ? null : JSON.stringify(value), page])).rows[0].result }
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values('${alice}'),('${bob}')`) }, 30000)
afterAll(async () => { await db?.close() })

it('persists complete scan totals and detailed issues with an idempotent scan identity', async () => {
 await asUser()
 const first = await history(report)
 expect(first.total).toBe(1)
 expect(first.reports[0].report).toEqual(report)
 const retried = await history(report)
 expect(retried).toEqual(first)
 expect((await history()).reports[0].report.chapterDateIssues[0]).toEqual(report.chapterDateIssues[0])
})
it('isolates report history by account and denies anonymous access', async () => {
 await asUser(bob)
 expect(await history()).toEqual({ reports: [], total: 0 })
 await history({ ...report, count: 10 })
 expect((await history()).reports[0].report.count).toBe(10)
 await expect(db.query('insert into public.library_sync_reports(user_id,id,report) values($1,$2,$3)', [alice, '20000000-0000-0000-0000-000000000002', '{}'])).rejects.toThrow('row-level security')
 await asUser()
 expect((await history()).reports[0].report.count).toBe(2037)
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 await expect(history()).rejects.toThrow('permission denied')
})
it('paginates reports and rejects incomplete or malformed reports', async () => {
 await asUser()
 for (let i = 2; i <= 12; i++) await history({ ...report, id: `20000000-0000-0000-0000-${String(i).padStart(12, '0')}` })
 expect((await history()).reports).toHaveLength(10)
 const second = await history(null, 2)
 expect(second.total).toBe(12)
 expect(second.reports).toHaveLength(2)
 expect(new Set([...(await history()).reports, ...second.reports].map(report => report.id)).size).toBe(12)
 for (const value of [{ ...report, status: 'running' }, { ...report, url: null }, { ...report, pages: '117' }]) await expect(history(value)).rejects.toThrow('Invalid sync report')
 await expect(history(null, 0)).rejects.toThrow('Invalid report page')
})
