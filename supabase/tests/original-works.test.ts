// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Existing embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { defaultReadingFilters } from '../../src/features/library/reading-search'
import { collectionRules, originalWorksRules } from '../../src/features/library/collections/automatic-collections'
import type { Collection, Story } from '../../src/features/library/model'

const migration = '20261112000100_original_works_starter.sql'
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002', charlie = '10000000-0000-0000-0000-000000000003'
let db: PGlite, oldBackup: object, beforeEntries: unknown[], beforeWorks: unknown[]
async function asUser<T>(owner: string, run: () => Promise<T>) {
 await db.exec('savepoint original_owner')
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`)
 try { return await run() }
 catch (error) { await db.exec('rollback to savepoint original_owner'); throw error }
 finally { await db.exec('reset role; reset request.jwt.claim.sub; release savepoint original_owner') }
}
async function query(collectionId: string) {
 return asUser(bob, async () => (await db.query<{ r: { total: number; stories: Story[] } }>('select public.query_library($1,1,25) r',
  [JSON.stringify({ mode: 'library', shelf: collectionId, includeFacets: false, filters: defaultReadingFilters })])).rows[0].r)
}
beforeAll(async () => {
 db = await createTestDatabase({ beforeMigration: migration })
 await db.query('insert into auth.users(id) values($1),($2)', [alice, bob])
 await db.query("insert into public.collections(user_id,name,color,symbol) values($1,'Original Works','#123456','moon')", [alice])
 await db.query('delete from public.collections where user_id=$1', [bob]) // A previously deleted One Shots stays deleted.
 for (const [index, fandom] of ['Original Work', 'Original Works', 'Other Fandom'].entries()) {
  const work = (await db.query<{ id: string }>('insert into public.works(ao3_work_id) values($1) returning id', [991001 + index])).rows[0].id
  await db.query("insert into public.library_entries(user_id,work_id,original_url,metadata_overrides) values($1,$2,$3,$4)",
   [bob, work, `https://archiveofourown.org/works/${991001 + index}`, JSON.stringify({ title: `Fixture ${fandom}`, fandoms: [fandom] })])
 }
 beforeEntries = (await db.query('select * from public.library_entries order by id')).rows
 beforeWorks = (await db.query('select * from public.works order by id')).rows
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${bob}'`)
 oldBackup = (await db.query<{ r: object }>('select public.export_library_backup() r')).rows[0].r
 await db.exec('reset role; reset request.jwt.claim.sub')
 await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
}, 30000)
afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.exec('begin') })
afterEach(async () => { await db.exec('rollback') })

it('upgrades populated accounts without changing work UUIDs, unknown counts, source evidence or history', async () => {
 expect((await db.query('select * from public.library_entries order by id')).rows).toEqual(beforeEntries)
 expect((await db.query('select * from public.works order by id')).rows).toEqual(beforeWorks)
 expect((await db.query("select * from public.collections where user_id=$1 and name='One Shots'", [bob])).rows).toEqual([])
 const existing = (await db.query<Collection>("select * from public.collections where user_id=$1 and name='Original Works'", [alice])).rows[0]
 expect(existing).toMatchObject({ color: '#123456', symbol: 'moon', automatic_rules: null, default_key: null })
 await db.query('insert into auth.users(id) values($1)', [charlie])
 expect((await db.query<{ name: string }>('select name from public.collections where user_id=$1 order by name', [charlie])).rows.map(row => row.name)).toEqual(['One Shots', 'Original Works'])
})

it('uses the ordinary Any matcher for singular/plural labels and permits editing, conversion and deletion', async () => {
 const collection = (await db.query<Collection>("select * from public.collections where user_id=$1 and name='Original Works'", [bob])).rows[0]
 const rules = collectionRules(collection)!
 expect({ ...rules, filters: { ...defaultReadingFilters, ...rules.filters } }).toEqual(originalWorksRules())
 expect((await query(collection.id)).stories.map(story => story.metadata.title).sort()).toEqual(['Fixture Original Work', 'Fixture Original Works'])
 await asUser(bob, () => db.query('update public.collections set name=$2,color=$3,automatic_rules=null where id=$1', [collection.id, 'My originals', '#654321']))
 expect((await query(collection.id)).total).toBe(2) // Conversion preserves current memberships.
 await asUser(bob, () => db.query('delete from public.collections where id=$1', [collection.id]))
 await asUser(bob, () => db.query('select public.library_catalog()'))
 expect((await db.query('select * from public.collections where user_id=$1', [bob])).rows).toEqual([])
 expect((await db.query('select * from public.library_entries where user_id=$1', [bob])).rows).toHaveLength(3)
})

it('retains owner isolation and denies browser access to the privileged initializer', async () => {
 const collection = (await db.query<Collection>("select * from public.collections where user_id=$1 and name='Original Works'", [alice])).rows[0]
 await asUser(bob, async () => {
  expect((await db.query('select * from public.collections where id=$1', [collection.id])).rows).toEqual([])
  expect((await db.query("update public.collections set name='Foreign' where id=$1 returning id", [collection.id])).rows).toEqual([])
 })
 await expect(asUser(bob, () => db.query('select public.seed_original_works_collection($1)', [alice]))).rejects.toThrow('permission denied')
 expect((await db.query<{ allowed: boolean }>("select has_function_privilege('anon','public.seed_original_works_collection(uuid)','execute') allowed")).rows[0].allowed).toBe(false)
})

it('restores an older v1 backup without recreating intentionally absent starters or losing private data', async () => {
 await db.query("insert into storage.objects(bucket_id,name) values('library-backups',$1)", [`${bob}/phase1-safety.json`])
 await asUser(bob, async () => {
  const fingerprint = (await db.query<{ r: { fingerprint: string } }>('select public.preview_library_restore($1) r', [JSON.stringify(oldBackup)])).rows[0].r.fingerprint
  await db.query('select public.restore_own_library_backup($1,$2,$3)', [JSON.stringify(oldBackup), fingerprint, `${bob}/phase1-safety.json`])
  expect((await db.query('select * from public.collections')).rows).toEqual([])
 })
 const restored = (await db.query<{ story: Story }>("select story from public.library_search_documents where user_id=$1", [bob])).rows
 expect(restored).toHaveLength(3)
 for (const { story } of restored) expect(story.metadata).toMatchObject({ published_chapters: null, total_chapters: null })
 expect((await db.query('select * from public.works order by id')).rows).toEqual(beforeWorks)
 expect((await db.query("select * from public.collections where user_id=$1 and name='Original Works'", [alice])).rows).toHaveLength(1)
})
