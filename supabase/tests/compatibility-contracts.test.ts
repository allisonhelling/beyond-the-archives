// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Existing embedded PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { parseMetadata } from '../../server/ao3/adapter'
import { validateMetadata } from '../../server/ao3/metadata-service'
import { compatibilityFixtures, compatibilityHtml } from '../../src/test/compatibility-fixtures'
import { defaultReadingFilters } from '../../src/features/library/reading-search'
import { readChapter, type Story } from '../../src/features/library/model'
import { savedWorkIdentity } from '../../reader/src/metadata'
import type { EditValues } from '../../src/features/library/edit-merge'
import { storySourceVersion, sourceIdentityKey } from '../../src/features/library/story-source'

let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
async function asUser<T>(owner: string, run: () => Promise<T>) {
 await db.exec('savepoint contract_user')
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`)
 try { return await run() }
 catch (error) { await db.exec('rollback to savepoint contract_user'); throw error }
 finally { await db.exec('reset role; reset request.jwt.claim.sub; release savepoint contract_user') }
}
async function query(owner = alice) {
 return asUser(owner, async () => (await db.query<{ result: { stories: Story[]; total: number } }>('select public.query_library($1,1,25) result',
  [JSON.stringify({ mode: 'library', shelf: 'all', includeFacets: false, filters: { ...defaultReadingFilters, characters: 'Fixture Character' } })])).rows[0].result)
}
beforeAll(async () => {
 db = await createTestDatabase()
 await db.query('insert into auth.users(id) values($1),($2)', [alice, bob])
}, 30000)
afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.exec('begin') })
afterEach(async () => { await db.exec('rollback') })

it.each(compatibilityFixtures)('round-trips $key through extraction, owned persistence, indexed search and account restore', async fixture => {
 const originalUrl = `https://archiveofourown.org/works/${fixture.workId}?view_full_work=true`
 const parsed = validateMetadata(parseMetadata(compatibilityHtml(fixture), fixture.workId, originalUrl))
 expect(parsed.metadata?.fandoms).toEqual([fixture.fandom])
 expect(parsed.metadata?.word_count).toBeUndefined()
 await asUser(alice, () => db.query('select public.submit_import_urls($1::text[])', [[originalUrl]]))
 const job = await asUser(alice, async () => (await db.query<{ job: { id: string; token: string } }>('select public.claim_extension_job() job')).rows[0].job)
 const manualTitle = `My ${fixture.key}`
 const entryId = (await db.query<{ entry_id: string }>('select entry_id from public.metadata_jobs where id=$1', [job.id])).rows[0].entry_id
 await asUser(alice, () => db.query("select public.save_library_story($1,$2,'to_read',0,'',null,false,'{}'::uuid[],'{}'::text[],$3)",
  [originalUrl, JSON.stringify({ title: manualTitle }), entryId]))
 expect((await db.query<{ ok: boolean }>('select public.finish_metadata_job($1,$2,$3,$4,null,null,false,0) ok',
  [job.id, job.token, JSON.stringify(parsed.metadata), '{}'])).rows[0].ok).toBe(true)
 // A completed lease cannot accept a duplicate payload or blank out saved values.
 expect((await db.query<{ ok: boolean }>('select public.finish_metadata_job($1,$2,null,$3,null,null,false,0) ok', [job.id, job.token, '{}'])).rows[0].ok).toBe(false)
 // Record a real companion chapter event, then reset current progress without deleting history.
 const code = await asUser(alice, async () => (await db.query<{ r: { code: string } }>("select public.manage_userscript_device('create','Fixture Device') r")).rows[0].r.code)
 const secret = (await db.query<{ r: { secret: string } }>("select public.userscript_library($1,'claim') r", [code])).rows[0].r.secret
 const saved = (await db.query<{ r: { entry: { version: string; status: string; progress: number } } }>("select public.userscript_library($1,'get',$2) r", [secret, fixture.workId])).rows[0].r.entry
 await db.query("select public.userscript_library($1,'progress',$2,$3)", [secret, fixture.workId, JSON.stringify({ version: saved.version, base: { status: saved.status, progress: saved.progress },
  status: 'reading', progress: 1, chapter_read: { chapter: 1, chapter_id: null, word_count: null } })])
 const base = (await db.query<{ r: EditValues }>('select public.library_edit_snapshot($1) r', [entryId])).rows[0].r
 await asUser(alice, () => db.query('select public.update_library_entry_checked($1,$2,$3)', [entryId, JSON.stringify({ status: 'to_read', progress: 0 }), JSON.stringify(base)]))
 await asUser(alice, () => db.exec("insert into public.collections(name) values('Fixture Collection'); insert into public.collection_works(collection_id,library_entry_id) select c.id,e.id from public.collections c,public.library_entries e where c.name='Fixture Collection' and c.user_id=auth.uid() and e.user_id=auth.uid()"))
 const before = (await query()).stories[0]
 expect(before).toMatchObject({ original_url: originalUrl, reading_status: 'to_read', last_read_chapter: 0,
  metadata: { title: manualTitle, fandoms: [fixture.fandom], published_chapters: fixture.published, total_chapters: fixture.total, word_count: null,
   publication_status: fixture.published === null ? 'unknown' : fixture.published === fixture.total ? 'complete' : 'in_progress',
   character_tags: ['Fixture Character'], additional_tags: ['Fixture Additional Tag'], series: ['Fixture Series'] } })
 expect(before.reading_history).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'chapter_read', chapter: 1, word_count: null })]))
 expect(before.collectionIds).toHaveLength(1)
 expect(readChapter(before)).toBe(1)
 expect((await query(bob)).total).toBe(0)
 await asUser(bob, async () => expect((await db.query('select * from public.library_entries')).rows).toEqual([]))
 const backup = await asUser(alice, async () => (await db.query<{ backup: object }>('select public.export_library_backup() backup')).rows[0].backup)
 await db.query("insert into storage.objects(bucket_id,name) values('library-backups',$1)", [`${alice}/fixture-safety.json`])
 await asUser(alice, async () => {
  const preview = (await db.query<{ result: { fingerprint: string } }>('select public.preview_library_restore($1) result', [JSON.stringify(backup)])).rows[0].result
  await db.query('select public.restore_own_library_backup($1,$2,$3)', [JSON.stringify(backup), preview.fingerprint, `${alice}/fixture-safety.json`])
 })
 const after = (await query()).stories[0]
 expect(after.id).not.toBe(before.id) // Account restore intentionally remaps private IDs.
 expect(after.work.id).toBe(before.work.id)
 expect(after.work.ao3_work_id).toBe(fixture.workId)
 expect(after.original_url).toBe(originalUrl)
 expect(after.metadata).toEqual(before.metadata)
 expect(after.last_read_chapter).toBe(before.last_read_chapter)
 expect(after.reading_history).toEqual(before.reading_history)
 const sourceBefore = storySourceVersion(before), sourceAfter = storySourceVersion(after)
 expect(sourceAfter.publishedChapters).toEqual(sourceBefore.publishedChapters)
 expect(sourceAfter.publicationStatus).toEqual(sourceBefore.publicationStatus)
 expect(sourceIdentityKey(sourceAfter.identity!)).toBe(sourceIdentityKey(sourceBefore.identity!))
 expect(sourceAfter.workId).toBe(sourceBefore.workId)
 expect(sourceAfter.ownerId).toBe(alice)
 expect(after.collectionIds).toHaveLength(1)
 expect(savedWorkIdentity({ workId: String(after.work.ao3_work_id), metadata: after.metadata })).toBe(String(fixture.workId))
 expect((await query(bob)).total).toBe(0)
})
