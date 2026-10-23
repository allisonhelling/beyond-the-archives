// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { mergeEdits, type EditValues } from '../../src/features/library/edit-merge'
let db: PGlite, secret: string
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
let work = 9000
async function asUser<T>(id: string, action: () => Promise<T>) {
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`)
 try { return await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
async function device(action: string, work: number, input: object = {}) {
 await db.exec('set role anon')
 try { return (await db.query<{ result: { entry: EditValues & { id: string; version: string } } }>('select public.userscript_library($1,$2,$3,$4) result', [secret, action, work, JSON.stringify(input)])).rows[0].result.entry }
 finally { await db.exec('reset role') }
}
async function snapshot(id: string) { return (await db.query<{ value: EditValues }>('select public.library_edit_snapshot($1) value', [id])).rows[0].value }
async function save(id: string, work: number, input: EditValues, base: EditValues, owner = alice) {
 return asUser(owner, () => db.query('select public.save_library_story_checked($1,$2,$3,$4)', [id, `https://archiveofourown.org/works/${work}`, JSON.stringify(input), JSON.stringify(base)]))
}
async function seed() {
 const number = ++work
 const entry = await device('save', number, { version: null, metadata: { title: 'Test', published_chapters: 10, total_chapters: 10 }, status: 'reading', progress: 2, notes: 'Original', rating: 2, tags: ['A', 'B'], collections: [] })
 return { number, id: entry.id, base: await snapshot(entry.id), entry }
}
beforeAll(async () => {
 db = await createTestDatabase(); await db.exec(`insert into auth.users values ('${alice}'),('${bob}')`)
 const code = await asUser(alice, async () => (await db.query<{ value: { code: string } }>("select public.manage_userscript_device('create','Test') value")).rows[0].value.code)
 secret = (await db.query<{ value: { secret: string } }>("select public.userscript_library($1,'claim') value", [code])).rows[0].value.secret
}, 30000)
afterAll(async () => { await db?.close() })
it('retries the migration after its SQL committed without losing data or duplicating the Safari merge', async () => {
 const { id } = await seed(), { rec, ...before } = await snapshot(id)
 const definition = async () => (await db.query<{ sql: string }>("select pg_get_functiondef('public.userscript_library(text,text,bigint,jsonb)'::regprocedure) sql")).rows[0].sql
 const original = await definition()
 const migration = await readFile(new URL('../migrations/20261019000201_safe_library_edits.sql', import.meta.url), 'utf8')
 for (let attempt = 0; attempt < 2; attempt++) {
  await db.exec(migration)
  // This historical migration predates the Rec snapshot field; the stored choice stays intact.
  expect(await snapshot(id)).toEqual(before)
  expect((await db.query<{ is_rec: boolean }>('select is_rec from public.library_entries where id=$1', [id])).rows[0].is_rec).toBe(rec)
  expect(await definition()).toBe(original)
 }
})
it('protects unrelated changes in both directions between Safari and the website', async () => {
 const { number, id, base, entry } = await seed()
 await device('save', number, { ...entry, base, notes: 'Safari notes' })
 await save(id, number, { ...base, rating: 5 }, base)
 expect(await snapshot(id)).toMatchObject({ notes: 'Safari notes', rating: 5 })
 await device('save', number, { ...entry, base, tags: ['New tag'] })
 expect(await snapshot(id)).toMatchObject({ notes: 'Safari notes', rating: 5, tags: ['New tag'] })
})
it('rejects divergent notes atomically, including a second edit during conflict review', async () => {
 const { number, id, base, entry } = await seed()
 await save(id, number, { ...base, notes: 'Website notes' }, base)
 let details: { base: EditValues; merged: EditValues; conflicts: object[] } | undefined
 try { await device('save', number, { ...entry, base, notes: 'Safari notes', rating: 5 }) }
 catch (error) { const failure = error as { code: string; detail: string }; expect(failure.code).toBe('40001'); details = JSON.parse(failure.detail) }
 expect(details?.conflicts).toEqual([{ field: 'notes', base: 'Original', local: 'Safari notes', saved: 'Website notes' }])
 expect(await snapshot(id)).toMatchObject({ notes: 'Website notes', rating: 2 })
 const latest = await snapshot(id)
 await save(id, number, { ...latest, notes: 'Website edited again' }, latest)
 await expect(device('save', number, { ...details!.merged, notes: 'Combined notes', base: details!.base })).rejects.toThrow(/Review/)
 await device('save', number, { ...details!.merged, notes: 'Combined notes', base: await snapshot(id) })
 expect(await snapshot(id)).toMatchObject({ notes: 'Combined notes', rating: 5 })
})
it('keeps newer notes during inline rating updates and detects inline notes conflicts', async () => {
 const { number, id, base, entry } = await seed()
 await device('save', number, { ...entry, base, notes: 'Safari notes' })
 await asUser(alice, () => db.query('select public.update_library_entry_checked($1,$2,$3)', [id, JSON.stringify({ rating: 4 }), JSON.stringify(base)]))
 expect(await snapshot(id)).toMatchObject({ notes: 'Safari notes', rating: 4 })
 await expect(asUser(alice, () => db.query('select public.update_library_entry_checked($1,$2,$3)', [id, JSON.stringify({ notes: 'Website notes' }), JSON.stringify(base)]))).rejects.toThrow(/Review/)
 await expect(save(id, number, { ...base, notes: 'Foreign' }, base, bob)).rejects.toThrow(/no longer available/)
})
it('merges manual metadata fields and ignores list ordering', async () => {
 const { number, id, base } = await seed()
 await save(id, number, { ...base, metadata: { title: 'Corrected title' } }, base)
 await save(id, number, { ...base, tags: ['B', 'A'], metadata: { summary: 'My summary' } }, base)
 expect(await snapshot(id)).toMatchObject({ metadata: { title: 'Corrected title', summary: 'My summary' }, tags: ['A', 'B'] })
 await expect(save(id, number, { ...base, metadata: { title: 'Different title' } }, base)).rejects.toThrow(/Review/)
})
it('matches client reload merges for nulls, lists, deletions and nested metadata', async () => {
 const examples: [EditValues, EditValues, EditValues][] = [
  [{}, { tags: [] }, { tags: ['Saved'] }],
  [{ notes: 'Old', rating: null }, { notes: '' }, { notes: 'Saved', rating: 5 }],
  [{ tags: ['A', 'B'] }, { tags: ['B', 'A'] }, { tags: ['A', 'C'] }],
  [{ status: 'reading', progress: 3 }, { status: 'reading', progress: 5 }, { status: 'finished', progress: 10 }],
  [{ metadata: {} }, { metadata: { title: 'Local' } }, { metadata: { title: 'Saved', summary: 'Keep' } }],
 ]
 for (const [base, local, saved] of examples) {
  const sql = (await db.query<{ result: object }>('select public.merge_library_edits($1,$2,$3) result', [base, local, saved].map(value => JSON.stringify(value)))).rows[0].result
  expect(sql).toEqual(mergeEdits(base, local, saved))
 }
})
