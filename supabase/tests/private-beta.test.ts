// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
beforeAll(async () => { db = await createTestDatabase() }, 30000)
afterAll(async () => { await db?.close() })
async function hook(user: unknown) {
 await db.exec('set role supabase_auth_admin')
 try {
  return (await db.query<{ result: { error?: { http_code: number; message: string } } }>(
   'select public.before_user_created($1::jsonb) result', [JSON.stringify({ user })])).rows[0].result
 } finally { await db.exec('reset role') }
}
it('denies unlisted, absent, anonymous and metadata-forged emails by default', async () => {
 for (const user of [{ email: 'unlisted@example.com' }, {}, { email: '' }, null,
  { email: 'unlisted@example.com', user_metadata: { email: 'approved@example.com', approved: true } }]) {
  expect(await hook(user)).toMatchObject({ error: { http_code: 403 } })
 }
})
it('allows only exact approved addresses regardless of case and rejects them after removal', async () => {
 await db.exec("insert into public.beta_signup_allowlist(email) values ('approved@example.com')")
 expect(await hook({ email: ' Approved@Example.COM ' })).toEqual({})
 for (const email of ['approved+other@example.com', 'other@example.com', 'approved@example.com.evil']) {
  expect(await hook({ email })).toHaveProperty('error')
 }
 expect(await hook({ email: 'approved@example.com', is_anonymous: true })).toHaveProperty('error')
 await db.exec("delete from public.beta_signup_allowlist where email='approved@example.com'")
 expect(await hook({ email: 'approved@example.com' })).toHaveProperty('error')
})
it('limits hook execution and approvals to trusted roles', async () => {
 for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`)
  try {
   for (const sql of [
    'select * from public.beta_signup_allowlist',
    "insert into public.beta_signup_allowlist(email) values ('self@example.com')",
    "update public.beta_signup_allowlist set email='self@example.com'",
    'delete from public.beta_signup_allowlist',
    "select public.before_user_created('{}'::jsonb)",
   ]) await expect(db.query(sql)).rejects.toThrow(/permission denied/)
  } finally { await db.exec('reset role') }
 }
 await db.exec('set role supabase_auth_admin')
 try {
  await expect(db.query("insert into public.beta_signup_allowlist(email) values ('self@example.com')")).rejects.toThrow(/permission denied/)
 } finally { await db.exec('reset role') }
 await db.exec('set role service_role')
 try {
  await db.query("insert into public.beta_signup_allowlist(email) values ('tester@example.com')")
  await expect(db.query("select public.before_user_created('{}'::jsonb)")).rejects.toThrow(/permission denied/)
 } finally { await db.exec('reset role') }
 expect(await hook({ email: 'tester@example.com' })).toEqual({})
})
