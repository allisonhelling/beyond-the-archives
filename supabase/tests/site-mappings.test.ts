// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Existing embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite
const owner = 'a0000000-0000-4000-8000-000000000001', other = 'b0000000-0000-4000-8000-000000000002'
const ruleId = 'a0000000-0000-4000-8000-000000000003'
const source = 'https://fiction.example/story/test'
async function as<T>(user: string, action: () => Promise<T>) {
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`)
 try { return await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
beforeAll(async () => {
 db = await createTestDatabase()
 await db.query('insert into auth.users(id) values($1),($2)', [owner, other])
}, 30000)
afterAll(async () => { await db?.close() })
it('isolates saved mappings and rejects stale or direct writes', async () => {
 const rule = { id: ruleId, version: 1, example: source }
 const write = (version: number, next: object | null) => db.query('select public.write_site_mapping($1,$2,$3) as result', [next, rule.id, version])
 await as(owner, async () => {
  expect((await write(0, rule)).rows).toEqual([{ result: true }])
  expect((await write(0, rule)).rows).toEqual([{ result: false }])
  expect((await write(1, { ...rule, version: 2 })).rows).toEqual([{ result: true }])
  await expect(db.query('delete from public.site_mappings')).rejects.toThrow('permission denied')
 })
 await as(other, async () => {
  expect((await db.query('select * from public.site_mappings')).rows).toEqual([])
  expect((await write(2, null)).rows).toEqual([{ result: false }])
 })
 await as(owner, async () => { expect((await write(2, null)).rows).toEqual([{ result: true }]) })
})
it('saves reviewed values and source observations in separate owner-private layers', async () => {
 const input = { metadata: { title: 'Corrected', published_chapters: 12, chapter_count_manual: false }, status: 'to_read', progress: 0, notes: 'Private', rating: null, favorite: false, collections: [], tags: [] }
 const observations = { title: { text: 'Observed', via: 'Page Element' } }
 const id = await as(owner, async () => {
  const save = await db.query<{id: string}>('select public.save_companion_story(null,$1,$2,null,$3) as id', [source, input, observations])
  const id = save.rows[0].id
  expect((await db.query('select metadata_overrides,extension_metadata from public.library_entries where id=$1', [id])).rows[0]).toMatchObject({
   metadata_overrides: { title: 'Corrected' }, extension_metadata: { generic_observations: observations },
  })
  await expect(db.query('select public.save_companion_story($1,$2,$3,$3,$4)', [id, source, input, { html: '<p>story</p>' }])).rejects.toThrow('Invalid source observation')
  return id
 })
 await as(other, async () => {
  expect((await db.query('select id from public.library_entries where id=$1', [id])).rows).toEqual([])
  await expect(db.query('select public.save_companion_story($1,$2,$3,$3,$4)', [id, source, input, observations])).rejects.toThrow('source story is unavailable')
 })
})
