// Integration checks against a running LOCAL Supabase stack, including GoTrue and PostgREST.
// Keys are read into memory from the CLI; never written or printed.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { parseLocalSupabaseStatus } from './supabase-status.mjs'

console.log('Checking local Supabase service status…')
const status = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', timeout: 60000 })
if (status.status !== 0) {
  console.error('Local Supabase is unavailable. Install/start Docker, then run npm run db:start and npm run db:reset.')
  process.exit(1)
}
let settings
try { settings = parseLocalSupabaseStatus(status.stdout) } catch (error) {
  console.error(error.message)
  process.exit(1)
}
const { url, publicKey, secretKey } = settings
const { createClient } = await import('@supabase/supabase-js')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, secretKey, options)
const anonymous = createClient(url, publicKey, options)
const tables = ['works', 'library_entries', 'authors', 'work_authors', 'fandoms', 'work_fandoms', 'tags', 'work_tags', 'collections', 'collection_works', 'personal_tags', 'library_entry_tags']
const users = []
const cleanup = { works: [], authors: [], fandoms: [], tags: [] }
let passed = 0
let stage = 'initializing local test fixtures'
async function check(name, action) {
  stage = name
  await action()
  passed++
  console.log(`PASS ${name}`)
}
try {
  for (const index of [1, 2]) {
    stage = `creating local test account ${index}`
    const email = `phase1-${randomUUID()}@example.test`
    const password = `Test-${randomUUID()}!Aa1`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.ok(!created.error, `Could not create test account (Auth status ${created.error?.status ?? 'unknown'}, code ${created.error?.code ?? 'unknown'})`)
    const userId = created.data.user.id
    const client = createClient(url, publicKey, options)
    users.push({ id: userId, client, email, password })
    stage = `signing in local test account ${index}`
    const signedIn = await client.auth.signInWithPassword({ email, password })
    assert.ok(!signedIn.error, `Could not authenticate test account (Auth status ${signedIn.error?.status ?? 'unknown'}, code ${signedIn.error?.code ?? 'unknown'})`)
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
      stage = `seeding ${table} for local test account ${index}`
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
  await check('Phase 2 manual saves, duplicate prevention, collections, tags and login persistence', async () => {
    const [alice, bob] = users
    const ao3Id = Math.floor(Date.now() / 10) + 100
    const createdCollections = await alice.client.from('collections').insert([{ name: `Manual A ${randomUUID()}` }, { name: `Manual B ${randomUUID()}` }]).select('id')
    assert.ok(!createdCollections.error)
    const args = { p_url: `https://archiveofourown.org/works/${ao3Id}/chapters/999`, p_metadata: { title: 'Manual private title', authors: ['One', 'Two'], total_chapters: null, published_chapters: 6, publication_status: 'complete' }, p_status: 'reading', p_progress: 3, p_notes: 'Persistent private note', p_rating: 5, p_favorite: true, p_collections: createdCollections.data.map(c => c.id), p_tags: ['Manual tag'], p_id: null }
    const created = await alice.client.rpc('save_library_story', args)
    assert.ok(!created.error, 'Manual RPC failed; apply the Phase 2 migration locally')
    const work = await admin.from('works').select('id').eq('ao3_work_id', ao3Id).single()
    assert.ok(!work.error); cleanup.works.push(work.data.id)
    const duplicate = await alice.client.rpc('save_library_story', { ...args, p_url: `https://archiveofourown.org/works/${ao3Id}` })
    assert.equal(duplicate.error?.code, '23505')
    assert.ok((await anonymous.rpc('save_library_story', args)).error)
    assert.ok((await bob.client.rpc('save_library_story', { ...args, p_id: created.data })).error)
    assert.equal((await bob.client.from('library_entries').select('id').eq('id', created.data)).data.length, 0)
    await alice.client.auth.signOut()
    alice.client = createClient(url, publicKey, options)
    assert.ok(!(await alice.client.auth.signInWithPassword({ email: alice.email, password: alice.password })).error)
    const restored = await alice.client.from('library_entries').select('*').eq('id', created.data).single()
    assert.ok(!restored.error); assert.equal(restored.data.notes, args.p_notes); assert.equal(restored.data.last_read_chapter, 3); assert.equal(restored.data.metadata_overrides.total_chapters, null)
    assert.equal((await alice.client.from('collection_works').select('*').eq('library_entry_id', created.data)).data.length, 2)
    assert.equal((await alice.client.from('library_entry_tags').select('*').eq('library_entry_id', created.data)).data.length, 1)
    for (const reading_status of ['did_not_finish', 're_reading', 'waiting_for_updates', 'reading']) {
      assert.ok(!(await alice.client.from('library_entries').update({ reading_status }).eq('id', created.data)).error)
    }
    assert.ok(!(await alice.client.from('library_entries').update({ last_read_chapter: 6 }).eq('id', created.data)).error)
    const caughtUp = await alice.client.from('library_entries').select('reading_status').eq('id', created.data).single()
    assert.equal(caughtUp.data.reading_status, 'reading')
    assert.ok(!(await alice.client.rpc('save_library_story', { ...args, p_id: created.data, p_metadata: { ...args.p_metadata, title: 'Edited manually' } })).error)
    assert.ok(!(await alice.client.from('library_entries').delete().eq('id', created.data)).error)
    assert.equal((await alice.client.from('library_entries').select('*').eq('id', created.data)).data.length, 0)
  })
  await check('Phase 3 bulk imports, real concurrent claims, account isolation and fenced cancellation', async () => {
    const [alice, bob] = users
    const active = await admin.from('metadata_jobs').select('id').in('status', ['pending', 'processing'])
    assert.ok(!active.error, 'Apply the Phase 3 migration before running integration tests')
    assert.equal(active.data.length, 0, 'Stop local workers and finish/cancel pre-existing jobs before running queue integration tests')
    const workIds = Array.from({ length: 110 }, (_, n) => Date.now() + n + 100000)
    const urls = workIds.map(id => `https://archiveofourown.org/works/${id}`)
    const batch = await alice.client.rpc('submit_import_urls', { p_urls: [...urls, `${urls[0]}/chapters/960`, `${urls[0]}/chapters/920`, 'https://example.com', 'https://archiveofourown.org/works/0'] })
    assert.ok(!batch.error)
    const works = await admin.from('works').select('id').in('ao3_work_id', workIds)
    cleanup.works.push(...works.data.map(w => w.id))
    const items = await alice.client.from('import_items').select('*').eq('batch_id', batch.data)
    assert.equal(items.data.length, 113)
    assert.equal(items.data.filter(i => i.result === 'duplicate').length, 2)
    for (const table of ['import_batches', 'import_items', 'metadata_jobs', 'processing_logs']) {
      assert.ok((await anonymous.from(table).select('*')).error)
      assert.equal((await bob.client.from(table).select('*')).data.length, 0)
    }
    assert.ok((await bob.client.rpc('cancel_import_batch', { p_batch: batch.data })).error)
    assert.ok((await alice.client.rpc('claim_metadata_job')).error)
    assert.ok(!(await admin.from('metadata_worker_state').update({ next_request_at: new Date(0).toISOString(), paused_until: null }).eq('id', 1)).error)
    const claims = await Promise.all([admin.rpc('claim_metadata_job'), admin.rpc('claim_metadata_job')])
    assert.ok(claims.every(c => !c.error))
    assert.equal(claims.filter(c => c.data).length, 1, 'Concurrent workers must claim exactly one global job')
    const claim = claims.find(c => c.data).data
    const commit = { p_job: claim.id, p_token: claim.token, p_metadata: { title: 'Fixture metadata', published_chapters: 6 }, p_chapters: { '2': '920', '6': '960' }, p_category: null, p_message: null, p_retryable: false, p_pause_seconds: 0 }
    assert.ok(!(await admin.rpc('finish_metadata_job', commit)).error)
    assert.equal((await admin.rpc('finish_metadata_job', commit)).data, false, 'Duplicate completion must be fenced out')
    assert.ok(!(await alice.client.rpc('cancel_import_batch', { p_batch: batch.data })).error)
    assert.equal((await alice.client.from('metadata_jobs').select('id').eq('batch_id', batch.data).in('status', ['pending', 'processing'])).data.length, 0)
    const retained = await alice.client.from('library_entries').select('id').in('work_id', works.data.map(w => w.id))
    assert.equal(retained.data.length, 110, 'Cancellation must retain every saved work')
  })
  await check('public registration is disabled', async () => {
    const signup = await anonymous.auth.signUp({ email: `blocked-${randomUUID()}@example.test`, password: `Test-${randomUUID()}!Aa1` })
    // Track an unexpected account so a failed security assertion still cleans it up.
    if (signup.data.user) users.push({ id: signup.data.user.id, client: anonymous })
    assert.ok(signup.error, 'Public registration unexpectedly succeeded')
    assert.equal(signup.error.code, 'signup_disabled', 'Registration must be rejected by the signup policy, not a disabled provider or invalid input')
  })
  console.log(`${passed} live Supabase integration checks passed.`)
} catch (error) {
  console.error(`Failed stage: ${stage}`)
  if (error instanceof assert.AssertionError) console.error(error.message)
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
