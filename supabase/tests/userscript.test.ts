// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseMetadata } from '../../server/ao3/adapter'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JS database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001', bob = '10000000-0000-0000-0000-000000000002'
let secret: string, code: string, version: string
async function user(id: string, action: () => Promise<void>) {
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`)
 try { await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
async function manage(action: string, name = 'iPhone', id: string | null = null) {
 return (await db.query<{ result: { code: string } }>('select public.manage_userscript_device($1,$2,$3::uuid) as result', [action, name, id])).rows[0].result
}
type Result = { secret: string; userId: string; entry: { version: string; progress: number; notes: string; status: string; tags: string[]; collections: string[] } }
async function request(action: string, input: object = {}, token = secret, work = 123) {
 await db.exec('set role anon')
 try { return (await db.query<{ result: Result }>('select public.userscript_library($1,$2,$3,$4) as result', [token, action, work, JSON.stringify(input)])).rows[0].result }
 finally { await db.exec('reset role') }
}
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values ('${alice}'),('${bob}')`) }, 30000)
afterAll(async () => { await db?.close() })
it('requires sign-in to pair and hides hashed credentials from both clients', async () => {
 await db.exec('set role anon')
 try {
  await expect(manage('create')).rejects.toThrow(/permission denied/)
  await expect(db.query('select * from public.userscript_devices')).rejects.toThrow(/permission denied/)
 } finally { await db.exec('reset role') }
 await user(alice, async () => {
  code = (await manage('create')).code
  expect(code).toHaveLength(64)
  await expect(db.query('select secret_hash from public.userscript_devices')).rejects.toThrow(/permission denied/)
 })
 await expect(request('get', {}, code)).rejects.toThrow(/Pair/)
 const claimed = await request('claim', {}, code)
 secret = claimed.secret
 expect(claimed.userId).toBe(alice)
 expect(secret).not.toBe(code)
 await expect(request('claim', {}, code)).rejects.toThrow(/Reconnect/)
 expect((await db.query<{ secret_hash: string }>('select secret_hash from public.userscript_devices')).rows[0].secret_hash).not.toBe(secret)
})
it('reuses atomic saves, preserves metadata and rejects stale writes and foreign collections', async () => {
 expect((await request('get')).entry).toBeNull()
 const metadata = { ...parseMetadata(readFileSync(new URL('../../server/ao3/fixtures/work.html', import.meta.url), 'utf8'), 123, 'https://archiveofourown.org/works/123').metadata, title: 'Test', authors: ['Author'], published_chapters: 10, total_chapters: 10, publication_status: 'complete', is_complete: true }
 const input = { version: null, metadata, status: 'reading', progress: 3, notes: 'Private', rating: 4, tags: ['Comfort'], collections: [] }
 const saved = await request('save', input)
 version = saved.entry.version
 expect(saved.entry).toMatchObject({ progress: 3, notes: 'Private', tags: ['Comfort'] })
 await expect(request('save', input)).rejects.toThrow(/Entry changed/)
 const next = await request('progress', { version, progress: 10, status: 'finished' })
 expect(next.entry).toMatchObject({ progress: 10, notes: 'Private', status: 'finished', tags: ['Comfort'] })
 version = next.entry.version
 await expect(request('progress', { version, progress: -1, status: 'reading' })).rejects.toThrow(/check constraint/)
 const foreign = (await db.query<{ id: string }>("insert into public.collections(user_id,name) values ($1,'Bob shelf') returning id", [bob])).rows[0].id
 await expect(request('save', { ...input, version, collections: [foreign] })).rejects.toThrow(/Collection unavailable/)
 const edited = await request('save', { ...input, metadata: { title: 'Should not replace' }, version, notes: 'Updated' })
 version = edited.entry.version
 expect((await db.query<{ extension_metadata: object; metadata_overrides: object }>('select extension_metadata,metadata_overrides from public.library_entries')).rows[0]).toMatchObject({ metadata_overrides: {}, extension_metadata: metadata })
 expect(edited.entry.notes).toBe('Updated')
 // The impersonated identity never survives a successful RPC.
 expect((await db.query<{ uid: string | null }>('select auth.uid() as uid')).rows[0].uid).toBeNull()
})
it('isolates accounts and supports remote revocation, expiry, and self-disconnect', async () => {
 let other = ''
 await user(bob, async () => { other = (await manage('create')).code })
 const bobDevice = await request('claim', {}, other)
 expect((await request('get', {}, bobDevice.secret)).entry).toBeNull()
 await request('disconnect', {}, bobDevice.secret)
 await expect(request('get', {}, bobDevice.secret)).rejects.toThrow(/Reconnect/)
 await user(bob, async () => {
  await expect(db.query('select id from public.userscript_devices where user_id=$1', [alice])).rejects.toThrow(/permission denied/)
 })
 const id = (await db.query<{ id: string }>('select id from public.userscript_devices where user_id=$1', [alice])).rows[0].id
 await user(bob, async () => { await manage('revoke', '', id) })
 expect((await request('get')).entry.notes).toBe('Updated')
 await db.exec("update public.userscript_devices set expires_at=now()-interval '1 second'")
 await expect(request('get')).rejects.toThrow(/Reconnect/)
 await user(alice, async () => { await manage('revoke', '', id) })
 expect((await db.query('select * from public.userscript_devices')).rows).toHaveLength(0)
})

it('allows a growing work to advance beyond its captured chapter count without replacing manual corrections', async () => {
 let pairing = ''
 await user(alice, async () => { pairing = (await manage('create')).code })
 const device = await request('claim', {}, pairing)
 const input = { version: null, metadata: { title: 'WIP', published_chapters: 2, total_chapters: null }, status: 'reading', progress: 1, notes: '', rating: null, tags: [], collections: [] }
 const saved = await request('save', input, device.secret, 456)
 const next = await request('progress', { version: saved.entry.version, progress: 3, status: 'reading' }, device.secret, 456)
 expect(next.entry.progress).toBe(3)
 await db.exec("update public.library_entries set metadata_overrides=' {\"title\":\"Manual correction\"}'::jsonb where work_id=(select id from public.works where ao3_work_id=456)")
 const current = await request('get', {}, device.secret, 456)
 await request('save', { ...input, version: current.entry.version, metadata: { title: 'Unwanted replacement' }, progress: 3 }, device.secret, 456)
 expect((await db.query<{ metadata_overrides: object }>('select metadata_overrides from public.library_entries where work_id=(select id from public.works where ao3_work_id=456)')).rows[0].metadata_overrides).toEqual({ title: 'Manual correction' })
})

it('refreshes private metadata and chapter mappings while preserving personal fields, drafts versions and manual corrections', async () => {
 let pairing = ''
 await user(alice, async () => { pairing = (await manage('create')).code })
 const device = await request('claim', {}, pairing)
 const saved = await request('save', { version: null, metadata: { title: 'Old title', summary: 'Keep summary', published_chapters: 2, total_chapters: 2, publication_status: 'complete' }, status: 'reading', progress: 1, notes: 'Keep notes', rating: 4, tags: ['Keep tag'], collections: [] }, device.secret, 789)
 await db.exec("update public.library_entries set metadata_overrides='{\"title\":\"My title\"}',is_favorite=true where work_id=(select id from public.works where ao3_work_id=789)")
 const current = await request('get', {}, device.secret, 789)
 const before = (await db.query<{ entry: Record<string, unknown> }>('select to_jsonb(e) as entry from public.library_entries e where work_id=(select id from public.works where ao3_work_id=789)')).rows[0].entry
 const input = { version: current.entry.version, metadata: { title: 'New title', summary: null, summary_html: '<p>Keep <em>summary</em></p>', published_chapters: 3, is_complete: false, kudos: 456, additional_tags: ['New tag'], notes: 'Unwanted note' }, chapters: { '3': '930' } }
 await expect(request('refresh_metadata', { ...input, version: 'stale' }, device.secret, 789)).rejects.toThrow(/Entry changed/)
 await expect(request('refresh_metadata', { ...input, metadata: { title: 'Bad', published_chapters: -1 } }, device.secret, 789)).rejects.toThrow(/Invalid/)
 await expect(request('refresh_metadata', { ...input, chapters: { '4': '940' } }, device.secret, 789)).rejects.toThrow(/Invalid chapter/)
 await expect(request('refresh_metadata', { ...input, metadata: { title: 'Bad', kudos: -1 } }, device.secret, 789)).rejects.toThrow(/Invalid/)
 const refreshed = await request('refresh_metadata', input, device.secret, 789)
 expect(refreshed.entry).toEqual(current.entry)
 const after = (await db.query<{ entry: Record<string, unknown> }>('select to_jsonb(e) as entry from public.library_entries e where work_id=(select id from public.works where ao3_work_id=789)')).rows[0].entry
 expect(after).toEqual({ ...before, extension_metadata: expect.objectContaining({ title: 'New title', summary: 'Keep summary', summary_html: '<p>Keep <em>summary</em></p>', published_chapters: 3, total_chapters: null, publication_status: 'in_progress', additional_tags: ['New tag'], kudos: 456, last_metadata_success: expect.any(String) }), extension_chapters: { '3': '930' } })
 expect(after.extension_metadata).not.toHaveProperty('notes')
 expect((await db.query('select title,verified_chapters from public.works where ao3_work_id=789')).rows[0]).toMatchObject({ title: null, verified_chapters: {} })
 await expect(request('refresh_metadata', { ...input, version: null }, device.secret, 999)).rejects.toThrow(/Save this work first/)
 let other = ''
 await user(bob, async () => { other = (await manage('create')).code })
 const bobDevice = await request('claim', {}, other)
 await expect(request('refresh_metadata', { ...input, version: null }, bobDevice.secret, 789)).rejects.toThrow(/Save this work first/)
 await request('disconnect', {}, device.secret)
 await expect(request('refresh_metadata', input, device.secret, 789)).rejects.toThrow(/Reconnect/)
 expect(saved.entry.notes).toBe('Keep notes')
})
