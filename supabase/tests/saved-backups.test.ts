// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared JavaScript database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001'
const bob = '10000000-0000-0000-0000-000000000002'
async function asUser(user: string, action: () => Promise<void>) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`)
  try { await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
beforeAll(async () => { db = await createTestDatabase(); await db.exec(`insert into auth.users values('${alice}'),('${bob}')`) }, 30000)
afterAll(async () => { await db?.close() })

it('creates a private bucket with constrained file size/types and scopes all object operations to the account folder', async () => {
  const bucket = await db.query('select public,file_size_limit,allowed_mime_types from storage.buckets where id=$1', ['library-backups'])
  expect(bucket.rows).toEqual([{ public: false, file_size_limit: 52428800, allowed_mime_types: ['application/json', 'application/gzip'] }])
  await db.query("insert into storage.objects(bucket_id,name) values('library-backups',$1)", [`${alice}/backup.json.gz`])
  await asUser(alice, async () => {
    await expect(db.query("insert into storage.objects(bucket_id,name) values('library-backups',$1)", [`${alice}/bypass.json.gz`])).rejects.toThrow(/row-level security/)
    await expect(db.query("insert into storage.objects(bucket_id,name) values('library-backups',$1)", [`${bob}/stolen.json.gz`])).rejects.toThrow(/row-level security/)
    await expect(db.query("insert into storage.objects(bucket_id,name) values('library-backups','root.json')")).rejects.toThrow(/row-level security/)
    expect((await db.query("select name from storage.objects")).rows).toEqual([{ name: `${alice}/backup.json.gz` }])
    // The SDK can request upsert; there is deliberately no matching UPDATE policy.
    expect((await db.query("update storage.objects set name=$1 returning id", [`${alice}/changed.json.gz`])).rows).toEqual([])
  })
  await asUser(bob, async () => {
    expect((await db.query('select * from storage.objects')).rows).toEqual([])
    expect((await db.query('delete from storage.objects returning id')).rows).toEqual([])
  })
  await db.exec('set role anon')
  try {
    expect((await db.query('select * from storage.objects')).rows).toEqual([])
    await expect(db.query("insert into storage.objects(bucket_id,name) values('library-backups',$1)", [`${alice}/anonymous.json`])).rejects.toThrow(/row-level security/)
  } finally { await db.exec('reset role') }
  await asUser(alice, async () => {
    expect((await db.query('delete from storage.objects returning name')).rows).toEqual([{ name: `${alice}/backup.json.gz` }])
  })
})

it('uses a timeout exception for backup functions without changing the general API roles', async () => {
  const config = await db.query<{ proname: string; proconfig: string[] }>("select proname,proconfig from pg_proc where proname in ('export_library_backup','restore_library_backup')")
  expect(config.rows).toHaveLength(2)
  for (const row of config.rows) expect(row.proconfig).toContain('statement_timeout=60s')
})


it('serializes per-account saves, enforces one attempt per minute, and fences stale releases', async () => {
  const claim = async (user: string, create = true) => (await db.query<{ result: { token?: string; error?: string; retry_after?: number } }>('select public.claim_backup_save($1,$2) result',[user,create])).rows[0].result
  const first = await claim(alice)
  expect(first.token).toBeTruthy()
  expect((await claim(alice)).error).toBe('busy')
  expect((await claim(bob)).token).toBeTruthy()
  await db.query('select public.release_backup_save($1,$2)',[alice,'99999999-0000-0000-0000-000000000000'])
  expect((await claim(alice,false)).error).toBe('busy')
  await db.query('select public.release_backup_save($1,$2)',[alice,first.token])
  expect(await claim(alice)).toMatchObject({ error: 'rate_limited' })
  const refresh = await claim(alice,false)
  expect(refresh.token).toBeTruthy()
  await db.query('select public.release_backup_save($1,$2)',[alice,refresh.token])
  await db.exec(`update public.backup_save_state set attempted_at=now()-interval '2 minutes' where user_id='${alice}'`)
  expect((await claim(alice)).token).toBeTruthy()
  await db.exec(`update public.backup_save_state set lease_until=now()-interval '1 second',attempted_at=now()-interval '2 minutes' where user_id='${alice}'`)
  expect((await claim(alice)).token).toBeTruthy()
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      await expect(db.query('select public.claim_backup_save($1,true)',[alice])).rejects.toThrow('permission denied')
      await expect(db.query('select public.backup_storage_files($1)',[alice])).rejects.toThrow('permission denied')
      await expect(db.query('select * from public.backup_save_state')).rejects.toThrow('permission denied')
    } finally { await db.exec('reset role') }
  }
})
