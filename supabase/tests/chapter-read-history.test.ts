// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { chapterReadEvents, type ReadingEvent } from '../../src/features/library/reading-history'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite, secret: string
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
type Entry = { id: string; version: string; status: string; progress: number; readingHistory: ReadingEvent[] }
async function request(work: number, action: string, input: object = {}) {
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 return (await db.query<{ result: { entry: Entry; secret: string } }>('select public.userscript_library($1,$2,$3,$4) result', [secret, action, work, JSON.stringify(input)])).rows[0].result
}
async function save(work: number, input: object = {}) {
 return (await request(work, 'save', { version: null, metadata: { title: `Work ${work}`, published_chapters: 10, total_chapters: 10, publication_status: 'complete' }, status: 'reading', progress: 0, notes: '', rating: null, tags: [], collections: [], ...input })).entry
}
function progress(entry: Entry, chapter: number, word_count: number | null, status = 'reading') {
 return { version: entry.version, base: { status: entry.status, progress: entry.progress }, progress: chapter, status, chapter_read: { chapter, chapter_id: String(100 + chapter), word_count } }
}
beforeAll(async () => {
 db = await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}');set role authenticated;set request.jwt.claim.sub='${alice}'`)
 const code = (await db.query<{ result: { code: string } }>("select public.manage_userscript_device('create','Chapter Reads') result")).rows[0].result.code
 secret = code
 secret = (await request(123, 'claim')).secret
}, 30000)
afterAll(async () => { await db?.close() })

it('atomically stores the current chapter only with a server timestamp and returns it through the web app and backup', async () => {
 const entry = await save(123)
 const before = Date.now()
 const input = progress(entry, 4, 2048)
 const saved = (await request(123, 'progress', input)).entry
 const reads = chapterReadEvents(saved.readingHistory)
 expect(reads).toHaveLength(1)
 expect(reads[0]).toMatchObject({ chapter: 4, chapter_id: '104', word_count: 2048, is_reread: false, status: 'reading' })
 expect(Date.parse(reads[0].at)).toBeGreaterThanOrEqual(before - 1000)
 expect(Date.parse(reads[0].at)).toBeLessThanOrEqual(Date.now() + 1000)
 expect(chapterReadEvents((await request(123, 'progress', input)).entry.readingHistory)).toEqual(reads)
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`)
 const details = (await db.query<{ result: { reading_history: ReadingEvent[] }[] }>('select public.library_story_details($1::uuid[]) result', [[entry.id]])).rows[0].result
 expect(chapterReadEvents(details[0].reading_history)).toEqual(reads)
 const backup = (await db.query<{ result: { tables: { library_entries: { reading_history: ReadingEvent[] }[] } } }>('select public.export_library_backup() result')).rows[0].result
 expect(chapterReadEvents(backup.tables.library_entries[0].reading_history)).toEqual(reads)
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`)
 expect((await db.query('select reading_history from public.library_entries where id=$1', [entry.id])).rows).toHaveLength(0)
 await db.exec('reset role;reset request.jwt.claim.sub;set role service_role')
 await db.query('select public.restore_library_backup($1,$2,true)', [JSON.stringify(backup), bob])
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`)
 const restored = (await db.query<{ reading_history: ReadingEvent[] }>('select reading_history from public.library_entries')).rows[0]
 expect(chapterReadEvents(restored.reading_history)).toEqual(reads)
})

it('records finish and reread events separately, including the final chapter of a reread', async () => {
 let entry = await save(124)
 entry = (await request(124, 'progress', progress(entry, 10, 900, 'finished'))).entry
 entry = (await request(124, 'progress', { version: entry.version, base: { status: entry.status, progress: entry.progress }, status: 're_reading', progress: 3 })).entry
 expect(chapterReadEvents(entry.readingHistory)).toHaveLength(1)
 entry = (await request(124, 'progress', progress(entry, 4, 1200, 're_reading'))).entry
 entry = (await request(124, 'progress', progress(entry, 10, 950, 'finished'))).entry
 expect(chapterReadEvents(entry.readingHistory).map(read => [read.chapter, read.word_count, read.is_reread])).toEqual([[10, 900, false], [4, 1200, true], [10, 950, true]])
})

it('recognizes later reread chapters after a completed work starts a fresh session in Reading', async () => {
 let entry = await save(128, { status: 'finished', progress: 10 })
 entry = (await request(128, 'progress', { version: entry.version, base: { status: entry.status, progress: entry.progress }, status: 'reading', progress: 0 })).entry
 entry = (await request(128, 'progress', progress(entry, 1, 300))).entry
 entry = (await request(128, 'progress', progress(entry, 2, 400))).entry
 expect(chapterReadEvents(entry.readingHistory).map(read => [read.chapter, read.is_reread])).toEqual([[1, true], [2, true]])
})

it('supports explicit finished-chapter saves on new and existing entries and distinguishes zero from unknown', async () => {
 let entry = await save(125, { progress: 4, chapter_read: { chapter: 4, chapter_id: '104', word_count: 0 } })
 expect(chapterReadEvents(entry.readingHistory)).toMatchObject([{ chapter: 4, word_count: 0 }])
 entry = (await request(125, 'save', { version: entry.version, base: { status: entry.status, progress: entry.progress, notes: '', rating: null, tags: [], collections: [] }, status: 'reading', progress: 5, notes: 'Keep notes', rating: null, tags: [], collections: [], chapter_read: { chapter: 5, chapter_id: null, word_count: null } })).entry
 expect(chapterReadEvents(entry.readingHistory)).toMatchObject([{ chapter: 4, word_count: 0 }, { chapter: 5, word_count: null }])
 // Ordinary edits and metadata/progress imports never fabricate chapter reads.
 entry = (await request(125, 'progress', { version: entry.version, status: 'reading', progress: 6 })).entry
 expect(chapterReadEvents(entry.readingHistory)).toHaveLength(2)
})

it('rejects malformed captures and stale conflicting writes without recording or changing progress', async () => {
 const entry = await save(126)
 for (const capture of [null, { chapter: 1, chapter_id: null, word_count: -1 }, { chapter: 1.5, chapter_id: null, word_count: 1 }, { chapter: 2, chapter_id: null, word_count: 1 }, { chapter: 1, chapter_id: 'bad', word_count: 1 }, { chapter: 1, chapter_id: null, word_count: 1, text: 'Private' }]) {
  await expect(request(126, 'progress', { version: entry.version, status: 'reading', progress: 1, chapter_read: capture })).rejects.toThrow()
 }
 let saved = (await request(126, 'get')).entry
 expect(saved.progress).toBe(0)
 expect(chapterReadEvents(saved.readingHistory)).toHaveLength(0)
 saved = (await request(126, 'progress', progress(saved, 2, 100))).entry
 await expect(request(126, 'progress', progress(entry, 1, 200))).rejects.toThrow(/changed/)
 expect(chapterReadEvents((await request(126, 'get')).entry.readingHistory)).toHaveLength(1)
})

it('keeps a paused reread classification when an explicit editor save completes the loaded chapter', async () => {
 let entry = await save(127, { status: 're_reading', progress: 3 })
 entry = (await request(127, 'progress', { version: entry.version, status: 'paused_reading', progress: 3 })).entry
 expect(chapterReadEvents(entry.readingHistory)).toHaveLength(0)
 entry = (await request(127, 'save', { version: entry.version, status: 'paused_reading', progress: 4, notes: '', rating: null, tags: [], collections: [], chapter_read: { chapter: 4, chapter_id: '104', word_count: 500 } })).entry
 expect(entry.status).toBe('paused_reading')
 expect(chapterReadEvents(entry.readingHistory)).toMatchObject([{ chapter: 4, word_count: 500, is_reread: true }])
})
