// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import type { Story } from '../../src/features/library/model'
import { defaultReadingFilters } from '../../src/features/library/reading-search'

let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
const row = (workId: number, bookmarkRec: boolean | null) => ({ workId, url: `https://archiveofourown.org/works/${workId}`, source: 'bookmarks', bookmarkId: workId + 1000, bookmarkRec, metadata: { title: `Rec work ${workId}` }, notes: '', tags: [] })
async function sync(rows: object[]) { return db.query('select public.submit_ao3_library_sync($1)', [JSON.stringify(rows)]) }
async function story(workId: number) { return (await db.query<{ story: Story }>("select story from public.library_search_documents where story->'work'->>'ao3_work_id'=$1", [String(workId)])).rows[0].story }
async function setRec(workId: number, rec: boolean) {
 const saved = await story(workId)
 await db.query('select public.update_library_entry_checked($1,$2,$3)', [saved.id, JSON.stringify({ rec }), JSON.stringify({ rec: saved.is_rec })])
}
beforeAll(async () => {
 db = await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}'); set role authenticated; set request.jwt.claim.sub='${alice}'`)
}, 30000)
afterAll(async () => { await db?.close() })

it('initializes Rec only on first import and keeps local edits when AO3 changes or hides the value', async () => {
 await sync([row(1, true), row(2, false), row(3, null)])
 expect((await story(1)).is_rec).toBe(true)
 expect((await story(2)).is_rec).toBe(false)
 expect((await story(3)).is_rec).toBe(false)
 await setRec(1, false); await setRec(3, true)
 await sync([row(1, true), row(2, true), row(3, null)])
 expect((await story(1)).is_rec).toBe(false)
 expect((await story(2)).is_rec).toBe(false)
 expect(await story(3)).toMatchObject({ is_rec: true, source_bookmark: { rec: null } })
 await db.query('select public.submit_ao3_csv_import($1)', [JSON.stringify([{ ...row(3, false), choice: 'overwrite', expectedVersion: (await story(3)).updated_at }])])
 expect((await story(3)).is_rec).toBe(true)
})

it('initializes bookmark-only deleted works and works without bookmark IDs', async () => {
 await sync([{ ...row(4, true), workId: null, url: 'https://archiveofourown.org/bookmarks/1004', workStatus: 'deleted' }, { ...row(5, true), bookmarkId: undefined }])
 const deleted = (await db.query<{ is_rec: boolean }>("select is_rec from public.library_entries where source_bookmark->>'id'='1004'")).rows[0]
 expect(deleted.is_rec).toBe(true)
 expect((await story(5)).is_rec).toBe(true)
})

it('uses personal Rec for shelves, automatic collections, filtering and compact catalog counts', async () => {
 const saved = await story(3)
 const collection = (await db.query<{ id: string }>('insert into public.collections(name,automatic_rules) values($1,$2) returning id', ['Personal Recs', JSON.stringify({ filters: { ...defaultReadingFilters, recs: true }, terms: [] })])).rows[0]
 const catalog = (await db.query<{ result: { stories: Story[] } }>('select public.library_catalog() result')).rows[0].result
 expect(catalog.stories.find(story => story.id === saved.id)?.is_rec).toBe(true)
 for (const [shelf, filters] of [['recs', {}], ['all', { recs: true }], [collection.id, {}]] as const) {
  const result = (await db.query<{ result: { stories: Story[] } }>('select public.query_library($1,1,100) result', [JSON.stringify({ mode: 'library', shelf, filters })])).rows[0].result
  expect(result.stories.map(story => story.id)).toContain(saved.id)
  expect(result.stories.map(story => story.id)).not.toContain((await story(1)).id)
 }
})

it('rejects invalid Rec edits and prevents another account from changing them', async () => {
 const saved = await story(3)
 for (const rec of [null, 'true', 1]) await expect(db.query('select public.update_library_entry_checked($1,$2,$3)', [saved.id, JSON.stringify({ rec }), JSON.stringify({ rec: true })])).rejects.toThrow('Invalid Rec status')
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 await expect(db.query('select public.update_library_entry_checked($1,$2,$3)', [saved.id, '{"rec":false}', '{"rec":true}'])).rejects.toThrow('Story no longer available')
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
 expect((await story(3)).is_rec).toBe(true)
})

it('saves independent series recommendations, filters them, and rejects invalid or foreign edits', async () => {
 await db.query('select public.ensure_library_series($1,$2)', [700, 'Recommended series'])
 await db.query('select public.update_library_series($1,$2,$3)', [700, '{"rec":true}', '{"rec":false}'])
 const saved = (await db.query<{ is_rec: boolean; is_favorite: boolean }>('select is_rec,is_favorite from public.library_series where ao3_series_id=700')).rows[0]
 expect(saved).toEqual({ is_rec: true, is_favorite: false })
 const result = (await db.query<{ result: { series: { seriesId: number }[] } }>('select public.query_library($1,1,100) result', [JSON.stringify({ mode: 'library', shelf: 'recs', filters: { showSeries: true, recs: true } })])).rows[0].result
 expect(result.series.map(series => series.seriesId)).toContain(700)
 await expect(db.query('select public.update_library_series($1,$2,$3)', [700, '{"rec":"true"}', '{"rec":true}'])).rejects.toThrow('Invalid series changes')
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 await expect(db.query('select public.update_library_series($1,$2,$3)', [700, '{"rec":false}', '{"rec":true}'])).rejects.toThrow('Load the series details first')
 await db.exec(`set request.jwt.claim.sub='${alice}'`)
})

it('uses list reading status only for new works and keeps existing progress on repeat scans', async () => {
 await sync([{ ...row(800, false), importReadingStatus: 'paused_reading', bookmarkDate: '2026-10-01', updatedDate: '2026-09-01', metadata: { title: 'Paused from list', published_chapters: 4 } }])
 expect(await story(800)).toMatchObject({ reading_status: 'paused_reading', last_read_chapter: 0, finished_at: null })
 expect((await story(800)).reading_history?.some(event => event.action === 'finished')).toBe(false)
 await sync([{ ...row(801, false), importReadingStatus: 'finished', metadata: { title: 'Finished from list', published_chapters: 4 } }])
 expect(await story(801)).toMatchObject({ reading_status: 'finished', last_read_chapter: 4 })
 await sync([{ ...row(802, false), workId: null, url: 'https://archiveofourown.org/bookmarks/1802', workStatus: 'deleted', importReadingStatus: 'paused_reading' }])
 expect((await db.query<{ reading_status: string }>("select reading_status from public.library_entries where source_bookmark->>'id'='1802'")).rows[0].reading_status).toBe('paused_reading')
 await sync([{ ...row(800, false), importReadingStatus: 'finished' }])
 expect(await story(800)).toMatchObject({ reading_status: 'paused_reading', last_read_chapter: 0 })
})
