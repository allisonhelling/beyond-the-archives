// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Existing embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite
const alice = '41000000-0000-4000-8000-000000000001', bob = '41000000-0000-4000-8000-000000000002'
const id = '41000000-0000-4000-8000-000000000003'
const url = 'https://ao3-fork.example/works/42'
async function as<T>(user: string, action: () => Promise<T>) {
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`)
 try { return await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
async function sql<T>(command: string, args: unknown[] = []) {
 return (await db.query<{ result: T }>(`select ${command} as result`, args)).rows[0].result
}
beforeAll(async () => {
 db = await createTestDatabase()
 await db.query('insert into auth.users(id) values($1),($2)', [alice, bob])
}, 30000)
afterAll(async () => { await db?.close() })

it('enforces private rule ownership, optimistic edits, and revision changes', async () => {
 const rule = { label: 'Some Tag', category: 'character', scope: 'site', site: 'https://ao3-fork.example', enabled: true }
 const revision = () => sql<string>('public.tag_classification_revision()')
 const write = (version: number, rule: object | null) => sql<boolean>('public.write_tag_classification_rule($1,$2,$3)', [id, version, rule])
 await as(alice, async () => {
  const empty = await revision()
  expect(await write(0, rule)).toBe(true)
  const original = await revision()
  expect(original).not.toBe(empty)
  expect(await write(0, rule)).toBe(false)
  expect(await write(1, { ...rule, enabled: false })).toBe(true)
  expect(await revision()).not.toBe(original)
  expect(await write(1, null)).toBe(false)
  await expect(db.query('delete from public.tag_classification_rules')).rejects.toThrow('permission denied')
 })
 await as(bob, async () => {
  expect(await revision()).toBe('0:')
  expect((await db.query('select * from public.tag_classification_rules')).rows).toEqual([])
  expect(await write(2, null)).toBe(false)
  await expect(write(0, { ...rule, site: 'https://ao3-fork.example/subpath' })).rejects.toThrow()
 })
 await as(alice, async () => {
  expect(await write(2, null)).toBe(true)
  expect(await revision()).toBe('0:')
  expect(await write(0, rule)).toBe(true)
  expect(await sql('public.reset_tag_classification_rules($1)', ['0:'])).toBe(false)
  expect(await sql('public.reset_tag_classification_rules($1)', [await revision()])).toBe(true)
  expect(await revision()).toBe('0:')
 })
})
it('keeps source tags and order independent of personal corrections on an AO3-compatible fork', async () => {
 const observations = {
  character_tags: { text: 'Original Character\nAnother Character', rawText: ' Original Character\nAnother Character ', via: 'Page Element' },
  ao3_tags: { text: 'An Unclassified Label', via: 'Page Metadata' },
 }
 const input = { metadata: { title: 'Fork', published_chapters: 1, chapter_count_manual: false, character_tags: ['Edited'] }, status: 'to_read', progress: 0, notes: '', favorite: false, collections: [], tags: [] }
 const story = await as(alice, async () => {
  const story = await sql<string>('public.save_companion_story(null,$1,$2,null,$3)', [url, input, observations])
  const prior = await sql('public.story_tag_evidence($1)', [story])
  expect(prior).toMatchObject({ site: 'https://ao3-fork.example', tags: expect.arrayContaining([
   { label: ' Original Character', position: 1, sourceCategory: 'character' },
   { label: 'Another Character ', position: 2, sourceCategory: 'character' },
   { label: 'An Unclassified Label', position: 1, sourceCategory: null },
  ]) })
  expect(await sql('public.write_tag_classification_rule($1,0,$2)', [id, { scope: 'story', story_id: story, label: 'Original Character', enabled: true, category: 'relationship' }])).toBe(true)
  expect(await sql('public.story_tag_evidence($1)', [story])).toEqual(prior)
  return story
 })
 await as(bob, async () => {
  expect(await sql('public.story_tag_evidence($1)', [story])).toBeNull()
  await expect(sql('public.write_tag_classification_rule($1,0,$2)', [id, { scope: 'story', story_id: story, label: 'Original Character', enabled: true, category: 'relationship' }])).rejects.toThrow('Story is unavailable')
 })
})
