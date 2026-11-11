// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
const archived = (id: number) => `https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/${id}?view_full_work=true`
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values('${alice}'),('${bob}')`) }, 30000)
afterAll(async () => { await db?.close() })
async function asUser<T>(user: string, action: () => Promise<T>) {
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}'`)
 try { return await action() } finally { await db.exec('reset role;reset request.jwt.claim.sub') }
}
async function submit(urls: string[]) { return asUser(alice, async () => (await db.query<{ id: string }>('select public.submit_import_urls($1) id', [urls])).rows[0].id) }
it('deduplicates live and archived links, preserves source history, and privately commits archived extension metadata', async () => {
 const batch = await submit([archived(17199254), 'https://archiveofourown.org/works/17199254'])
 expect((await db.query<{ original_url: string }>('select original_url from public.library_entries')).rows[0].original_url).toBe(archived(17199254))
 expect((await db.query('select original_url from public.import_items where batch_id=$1 order by ordinal', [batch])).rows).toHaveLength(2)
 expect((await db.query('select work_status from public.library_entries')).rows[0]).toMatchObject({work_status:'deleted'})
 expect((await db.query<{story:{metadata:{title:string;publication_status:string}}}>('select story from public.library_search_documents')).rows[0].story.metadata).toMatchObject({title:'AO3 work 17199254',publication_status:'deleted'})
 expect((await db.query('select * from public.metadata_jobs where batch_id=$1', [batch])).rows).toHaveLength(1)
 await db.exec("set role service_role; update public.metadata_worker_state set next_request_at=now()-interval '1 second',paused_until=null")
 await db.exec("set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'")
 const claim = (await db.query<{ job: { id: string; token: string; sourceUrl: string } }>('select public.claim_extension_job() job')).rows[0].job
 expect(claim.sourceUrl).toBe(archived(17199254))
 await db.exec('reset role;reset request.jwt.claim.sub')
 await db.query('select public.finish_metadata_job($1,$2,$3,$4,null,null,false,0)', [claim.id, claim.token, JSON.stringify({ title: 'Archived title', authors: ['Archived author'], published_chapters: 2, total_chapters: 2, is_complete: true }), JSON.stringify({ 1: '101', 2: '102' })])
 await db.exec('reset role')
 expect((await db.query('select title,canonical_url from public.works where ao3_work_id=17199254')).rows[0]).toEqual({ title: null, canonical_url: null })
 await asUser(alice, async () => {
  expect((await db.query('select extension_metadata,work_status from public.library_entries')).rows[0]).toMatchObject({work_status:'deleted', extension_metadata: { title: 'Archived title', authors: ['Archived author'] } })
  await expect(db.query('select public.metadata_job_archive_source($1)', [claim.id])).rejects.toThrow('permission denied')
 })
 await asUser(bob, async () => expect((await db.query('select * from public.library_entries')).rows).toEqual([]))
})
it('makes the archived source available to extension claims through the existing account queue', async () => {
 await asUser(alice, () => db.exec("insert into public.metadata_preferences(user_id,retrieval_mode) values(auth.uid(),'extension') on conflict(user_id) do update set retrieval_mode='extension'"))
 await submit([archived(17199255)])
 await asUser(alice, async () => {
  const claim = (await db.query<{ job: { sourceUrl: string } }>('select public.claim_extension_job() job')).rows[0].job
  expect(claim.sourceUrl).toBe(archived(17199255))
  await db.query("select public.cancel_import_batch(batch_id) from public.metadata_jobs where status='processing'")
 })
})
it.each([17199256, 17199257])('supports manual save and deletion undo for archived work %s, including collection-qualified links', async workId => {
 await asUser(alice, async () => {
  const id = (await db.query<{ id: string }>("select public.save_library_story($1,$2,'to_read',0,'',null,false,'{}','{}') id", [workId === 17199257 ? archived(workId).replace('/works/', '/collections/Test/works/') : archived(workId), JSON.stringify({ title: 'Manual archive' })])).rows[0].id
  const entry = (await db.query<{work_status:string}>('select * from public.library_entries where id=$1', [id])).rows[0]
  expect(entry.work_status).toBe('deleted')
  await db.query('delete from public.library_entries where id=$1', [id])
  expect((await db.query<{ id: string }>("select public.restore_library_story($1,'{}','{}') id", [JSON.stringify(entry)])).rows[0].id).toBe(id)
 })
})
it('rejects unrelated archive targets and unsupported wildcard captures without creating entries', async () => {
 for (const url of ['https://web.archive.org/web/20251007001146/https://evil.test/works/999', 'https://web.archive.org/web/*/https://archiveofourown.org/works/999', 'https://web.archive.org/web/20251007001146/https://archiveofourown.org.evil.test/works/999']) {
  expect(await submit([url])).toBeNull()
  await asUser(alice, async () => {
   await expect(db.query("select public.save_library_story($1,$2,'to_read',0,'',null,false,'{}','{}')", [url, JSON.stringify({ title: 'Invalid' })])).rejects.toThrow('supported AO3 work URL')
  })
 }
})

it('preserves current shared metadata and personal overrides when refreshing an existing work from an archive', async () => {
 const workId = 17199258
 await asUser(alice, async () => {
  await db.exec("update public.metadata_preferences set retrieval_mode='direct' where user_id=auth.uid()")
  await db.query("select public.save_library_story($1,$2,'reading',1,'My notes',4::smallint,true,'{}','{}')", [`https://archiveofourown.org/works/${workId}`, JSON.stringify({ title: 'My correction' })])
 })
 await db.query("update public.works set title='Current live title' where ao3_work_id=$1", [workId])
 await submit([archived(workId)])
 await db.exec("set role service_role; update public.metadata_worker_state set next_request_at=now()-interval '1 second',paused_until=null")
 const claim = await asUser(alice,async()=>(await db.query<{ job: { id: string; token: string } }>('select public.claim_extension_job() job')).rows[0].job)
 await db.query('select public.finish_metadata_job($1,$2,$3,$4,null,null,false,0)', [claim.id, claim.token, JSON.stringify({ title: 'Historical title', published_chapters: 2 }), '{}'])
 await db.exec('reset role')
 expect((await db.query('select title from public.works where ao3_work_id=$1', [workId])).rows[0]).toEqual({ title: 'Current live title' })
 expect((await db.query('select e.* from public.library_entries e join public.works w on w.id=e.work_id where w.ao3_work_id=$1', [workId])).rows[0]).toMatchObject({ work_status: 'deleted', metadata_overrides: { title: 'My correction' }, extension_metadata: { title: 'Historical title' }, notes: 'My notes', reading_status: 'reading', last_read_chapter: 1, is_favorite: true, personal_rating: 4 })
})
