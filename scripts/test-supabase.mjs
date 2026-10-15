// Integration checks against a running LOCAL Supabase stack, including GoTrue and PostgREST.
// Keys are read into memory from the CLI; never written or printed.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const status = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' })
if (status.status !== 0) {
  console.error('Local Supabase is unavailable. Install/start Docker, then run npm run db:start and npm run db:reset.')
  process.exit(1)
}
const settings = JSON.parse(status.stdout)
const url = settings.API_URL
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Integration tests only run against the local stack.')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, settings.SERVICE_ROLE_KEY, options)
const anonymous = createClient(url, settings.ANON_KEY, options)
const tables = ['works', 'library_entries', 'authors', 'work_authors', 'fandoms', 'work_fandoms', 'tags', 'work_tags', 'collections', 'collection_works', 'personal_tags', 'library_entry_tags']
const users = []
const cleanup = { works: [], authors: [], fandoms: [], tags: [] }
let passed = 0
async function check(name, action) {
  await action()
  passed++
  console.log(`PASS ${name}`)
}
try {
  for (const index of [1, 2]) {
    const email = `phase1-${randomUUID()}@example.test`
    const password = `Test-${randomUUID()}!Aa1`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.ok(!created.error, 'Could not create test account')
    const userId = created.data.user.id
    const client = createClient(url, settings.ANON_KEY, options)
    users.push({ id: userId, client })
    assert.ok(!(await client.auth.signInWithPassword({ email, password })).error, 'Could not authenticate test account')
    const workId = randomUUID(), entryId = randomUUID(), authorId = randomUUID(), fandomId = randomUUID(), tagId = randomUUID(), collectionId = randomUUID(), personalTagId = randomUUID()
    const seed = [
      ['works', { id: workId, ao3_work_id: Math.floor(Date.now() / 10) + index, title: `Integration ${index}` }],
      ['library_entries', { id: entryId, user_id: userId, work_id: workId, original_url: `https://archiveofourown.org/works/${index}/chapters/987`, notes: `private ${index}` }],
      ['authors', { id: authorId, name: `Author ${randomUUID()}` }],
      ['work_authors', { work_id: workId, author_id: authorId }],
      ['fandoms', { id: fandomId, name: `Fandom ${randomUUID()}` }],
      ['work_fandoms', { work_id: workId, fandom_id: fandomId }],
      ['tags', { id: tagId, name: `Tag ${randomUUID()}` }],
      ['work_tags', { work_id: workId, tag_id: tagId }],
      ['collections', { id: collectionId, user_id: userId, name: 'Test shelf' }],
      ['collection_works', { user_id: userId, collection_id: collectionId, library_entry_id: entryId }],
      ['personal_tags', { id: personalTagId, user_id: userId, name: 'Test tag' }],
      ['library_entry_tags', { user_id: userId, personal_tag_id: personalTagId, library_entry_id: entryId }],
    ]
    for (const [table, row] of seed) {
      assert.ok(!(await admin.from(table).insert(row)).error, `Seed failed for ${table}`)
      if (table in cleanup) cleanup[table].push(row.id)
    }
  }
  for (const table of tables) {
    await check(`unauthenticated ${table} is denied`, async () => {
      const result = await anonymous.from(table).select('*')
      assert.ok(result.error, 'Anonymous read unexpectedly permitted')
    })
    await check(`both authenticated accounts see only their ${table}`, async () => {
      for (const user of users) {
        const result = await user.client.from(table).select('*')
        assert.ok(!result.error, `Authenticated read failed for ${table}`)
        assert.equal(result.data.length, 1, `Incorrect visible row count for ${table}`)
      }
    })
  }
  await check('cross-account notes cannot be changed or deleted', async () => {
    const [alice, bob] = users
    const result = await alice.client.from('library_entries').update({ notes: 'stolen' }).eq('user_id', bob.id).select()
    assert.ok(!result.error)
    assert.equal(result.data.length, 0)
    const deleted = await alice.client.from('library_entries').delete().eq('user_id', bob.id).select()
    assert.equal(deleted.data.length, 0)
    const own = await bob.client.from('library_entries').select('notes').single()
    assert.equal(own.data.notes, 'private 2')
  })
  await check('public registration is disabled', async () => {
    const signup = await anonymous.auth.signUp({ email: `blocked-${randomUUID()}@example.test`, password: `Test-${randomUUID()}!Aa1` })
    // Track an unexpected account so a failed security assertion still cleans it up.
    if (signup.data.user) users.push({ id: signup.data.user.id, client: anonymous })
    assert.ok(signup.error, 'Public registration unexpectedly succeeded')
  })
  console.log(`${passed} live Supabase integration checks passed.`)
} catch {
  console.error('Live Supabase integration checks failed. Inspect local Auth/PostgREST configuration and migrations; credentials are intentionally omitted.')
  process.exitCode = 1
} finally {
  let cleanupFailed = false
  for (const user of users) {
    await user.client.auth.signOut()
    if ((await admin.auth.admin.deleteUser(user.id)).error) cleanupFailed = true
  }
  for (const [table, ids] of Object.entries(cleanup)) {
    if (ids.length && (await admin.from(table).delete().in('id', ids)).error) cleanupFailed = true
  }
  if (cleanupFailed) { console.error('Test cleanup incomplete. Reset the local development database.'); process.exitCode = 1 }
}
