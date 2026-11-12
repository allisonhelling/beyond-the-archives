// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { automaticCollectionRules, collectionRules } from '../../src/features/library/collections/automatic-collections'
import { defaultReadingFilters } from '../../src/features/library/reading-search'
import type { Collection } from '../../src/features/library/model'

let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
const rules = automaticCollectionRules({ ...defaultReadingFilters, oneShot: 'only' })
function expectStarterRules(collection: Collection) {
 const saved = collectionRules(collection)
 expect(saved).not.toBeNull()
 // Saved rules may predate filters whose omitted values use the current defaults.
 expect({ ...saved, filters: { ...defaultReadingFilters, ...saved?.filters } }).toEqual(rules)
}
beforeAll(async () => {
 db = await createTestDatabase()
 await db.exec(`insert into auth.users values ('${alice}'),('${bob}'); set role authenticated; set request.jwt.claim.sub='${alice}'`)
}, 30000)
afterAll(async () => { await db?.close() })

it('creates an ordinary private automatic collection before any works are saved', async () => {
 expect((await db.query('select * from public.library_entries')).rows).toEqual([])
 const collections = (await db.query<Collection>("select * from public.collections where name='One Shots'")).rows
 expect(collections).toHaveLength(1)
 expect(collections[0]).toMatchObject({ user_id: alice, name: 'One Shots', color: '#8b491e', symbol: 'scroll', default_key: null })
 expectStarterRules(collections[0])
 await expect(db.query('select public.seed_starter_collection($1)', [bob])).rejects.toThrow(/permission denied/)
})

it('matches one shots automatically and permits editing, reordering, conversion and deletion', async () => {
 const starter = (await db.query<Collection>("select * from public.collections where name='One Shots'")).rows[0]
 await db.exec(`reset role;
 insert into public.works(ao3_work_id,title,published_chapters,total_chapters,is_complete) values (101,'One chapter',1,1,true),(102,'Many chapters',3,3,true);
 insert into public.library_entries(user_id,work_id,original_url) select '${alice}',id,'https://archiveofourown.org/works/'||ao3_work_id from public.works;
 set role authenticated;`)
 const members = () => db.query<{ title: string }>('select story->\'metadata\'->>\'title\' title from public.library_collection_documents where story->\'automaticCollectionIds\' ? $1', [starter.id])
 expect((await members()).rows).toEqual([{ title: 'One chapter' }])
 await db.query('update public.collections set name=$2,color=$3,symbol=$4,automatic_rules=$5 where id=$1', [starter.id, 'My chaptered reads', '#123456', 'moon', JSON.stringify(automaticCollectionRules({ ...defaultReadingFilters, oneShot: 'exclude' }))])
 expect((await members()).rows).toEqual([{ title: 'Many chapters' }])
 await db.query('select public.reorder_collections($1::uuid[])', [(await db.query<{id:string}>('select id from public.collections order by sort_position')).rows.map(row=>row.id)])
 await db.query('update public.collections set automatic_rules=null where id=$1', [starter.id])
 expect((await db.query('select * from public.collection_works where collection_id=$1', [starter.id])).rows).toHaveLength(1)
 await db.query('delete from public.collections where id=$1', [starter.id])
 await db.query('select public.library_catalog()')
 expect((await db.query('select * from public.collections where id=$1', [starter.id])).rows).toEqual([])
})

it('preserves a same-named existing shelf when provisioning existing accounts', async () => {
 await db.exec('reset role')
 await db.query("update public.collections set color='#123456',symbol='moon',automatic_rules=null where user_id=$1 and name='One Shots'", [bob])
 await db.query('select public.seed_starter_collection($1)', [bob])
 const collections = (await db.query<Collection>("select * from public.collections where user_id=$1 and name='One Shots'", [bob])).rows
 expect(collections).toHaveLength(1)
 expect(collections[0]).toMatchObject({ name: 'One Shots', color: '#123456', symbol: 'moon', automatic_rules: null })
 await db.query('delete from public.collections where user_id=$1', [bob])
 await db.query('select public.seed_starter_collection($1)', [bob])
 const starter = (await db.query<Collection>('select * from public.collections where user_id=$1', [bob])).rows[0]
 expect(starter).toMatchObject({ name: 'One Shots' })
 expectStarterRules(starter)
})
