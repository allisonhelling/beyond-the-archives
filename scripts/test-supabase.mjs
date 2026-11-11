// Integration checks against a running LOCAL Supabase stack, including GoTrue and PostgREST.
// Keys are read into memory from the CLI; never written or printed.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
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
const approvedEmails = []
async function approveEmail(email) {
  const result = await admin.from('beta_signup_allowlist').insert({ email })
  assert.equal(result.error, null)
  approvedEmails.push(email)
}
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
    await approveEmail(email)
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
        if (table === 'collections') {
          // New accounts also receive starter collections from the Auth trigger.
          const owned = await admin.from(table).select('id').eq('user_id', user.id)
          assert.ok(!owned.error, 'Could not read expected account collections')
          assert.deepEqual(result.data.map(row => row.id).sort(), owned.data.map(row => row.id).sort(), 'Visible collections must exactly match the account’s collections')
        } else {
          assert.equal(result.data.length, 1, `Incorrect visible row count for ${table}`)
        }
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
  await check('extension-only bulk imports, real concurrent claims, account isolation and fenced cancellation', async () => {
    const [alice, bob] = users
    const active = await admin.from('metadata_jobs').select('id').in('user_id', users.map(user => user.id)).in('status', ['pending', 'processing'])
    assert.ok(!active.error, 'Apply the latest import migrations before running integration tests')
    assert.equal(active.data.length, 0, 'Test accounts must not have pre-existing active jobs')
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
    const modes = await alice.client.from('metadata_jobs').select('retrieval_mode').eq('batch_id', batch.data)
    assert.equal(modes.error, null)
    assert.ok(modes.data.length > 0 && modes.data.every(job => job.retrieval_mode === 'extension'), 'All new jobs must use the companion queue')
    const retired = await admin.rpc('claim_metadata_job')
    assert.equal(retired.error, null)
    assert.equal(retired.data, null, 'The retired hosted worker must not claim jobs')
    const otherOwner = await bob.client.rpc('claim_extension_job')
    assert.equal(otherOwner.error, null)
    assert.equal(otherOwner.data, null, 'Another account must not claim this queue')
    const claims = await Promise.all([alice.client.rpc('claim_extension_job'), alice.client.rpc('claim_extension_job')])
    assert.ok(claims.every(c => !c.error))
    assert.equal(claims.filter(c => c.data).length, 1, 'Concurrent companions must claim exactly one job for the account')
    const claim = claims.find(c => c.data).data
    const commit = { p_job: claim.id, p_token: claim.token, p_metadata: { title: 'Fixture metadata', published_chapters: 6 }, p_chapters: { '2': '920', '6': '960' }, p_category: null, p_message: null, p_retryable: false, p_pause_seconds: 0 }
    assert.ok((await alice.client.rpc('finish_metadata_job', commit)).error, 'Clients must not commit unvalidated metadata directly')
    const completed = await admin.rpc('finish_metadata_job', commit)
    assert.equal(completed.error, null)
    assert.equal(completed.data, true)
    const claimedEntry = items.data.find(item => item.ao3_work_id === claim.workId)?.entry_id
    assert.ok(claimedEntry, 'The claim must identify a saved work in this batch')
    const observation = await alice.client.from('library_entries').select('extension_metadata').eq('id', claimedEntry).single()
    assert.equal(observation.error, null)
    assert.equal(observation.data.extension_metadata.title, 'Fixture metadata')
    assert.equal((await admin.rpc('finish_metadata_job', commit)).data, false, 'Duplicate completion must be fenced out')
    const next = await alice.client.rpc('claim_extension_job')
    assert.equal(next.error, null)
    assert.ok(next.data)
    assert.ok(!(await alice.client.rpc('cancel_import_batch', { p_batch: batch.data })).error)
    assert.equal((await admin.rpc('finish_metadata_job', { ...commit, p_job: next.data.id, p_token: next.data.token })).data, false, 'Cancellation must fence an active companion lease')
    assert.equal((await alice.client.from('metadata_jobs').select('id').eq('batch_id', batch.data).in('status', ['pending', 'processing'])).data.length, 0)
    const retained = await alice.client.from('library_entries').select('id').in('work_id', works.data.map(w => w.id))
    assert.equal(retained.data.length, 110, 'Cancellation must retain every saved work')
  })
  await check('saved backups enforce retention and rate limits on the trusted backend', async () => {
    const [alice, bob] = users
    const snapshot = await alice.client.rpc('export_library_backup')
    assert.ok(!snapshot.error, 'Apply the library backup migrations before running Storage integration checks')
    const expected = process.env.INTEGRATION_BACKUP_FIXTURE
      ? JSON.parse(gunzipSync(await readFile(process.env.INTEGRATION_BACKUP_FIXTURE)).toString()) : snapshot.data
    const bytes = gzipSync(JSON.stringify(expected))
    const bucket = client => client.storage.from('library-backups')
    const invoke = client => client.functions.invoke('save-backup', { body: new Blob([bytes], { type: 'application/gzip' }), headers: { 'Content-Type': 'application/gzip' } })
    const list = async user => {
      const result = await bucket(admin).list(user.id)
      assert.ok(!result.error)
      return result.data.map(file => `${user.id}/${file.name}`).sort()
    }
    const blocked = `${alice.id}/bypass-${randomUUID()}.json.gz`
    assert.ok((await bucket(alice.client).upload(blocked,bytes,{ contentType:'application/gzip' })).error, 'Direct owner upload bypassed the retention gate')
    assert.ok((await bucket(bob.client).upload(blocked,bytes,{ contentType:'application/gzip' })).error, 'Cross-account upload succeeded')
    assert.ok((await invoke(anonymous)).error, 'Anonymous save succeeded')
    // Seed legacy copies using the service role; client accounts cannot do this.
    const originals = []
    for (let n = 1; n <= 3; n++) {
      const path = `${alice.id}/legacy-${n}-${randomUUID()}.json.gz`
      assert.ok(!(await bucket(admin).upload(path,bytes,{ contentType:'application/gzip' })).error)
      originals.push(path)
    }
    const saved = await invoke(alice.client)
    assert.ok(!saved.error, 'Trusted backup endpoint failed; serve/deploy save-backup and apply the retention migration')
    assert.equal(saved.data.backups.length,3)
    const after = await list(alice)
    assert.equal(after.length,3)
    assert.ok(!after.includes(originals[0]), 'Oldest backup was not pruned')
    const newest = saved.data.backups[0].path
    assert.ok(newest.startsWith(`${alice.id}/`), 'Server did not bind path to the authenticated user')
    assert.ok((await bucket(alice.client).upload(newest,bytes,{ contentType:'application/gzip',upsert:true })).error, 'Existing backup was overwritten')
    const rejected = await invoke(alice.client)
    assert.equal(rejected.error?.context?.status,429, 'Immediate repeat save was not rate limited')
    assert.deepEqual(await list(alice),after, 'Rejected save changed retained backups')
    assert.ok(!(await alice.client.rpc('export_library_backup')).error, 'Download export was rate limited')
    assert.ok((await bucket(bob.client).download(newest)).error)
    assert.ok((await bucket(anonymous).download(newest)).error)
    assert.deepEqual((await bucket(bob.client).list(alice.id)).data,[])
    await bucket(bob.client).remove([newest])
    const downloaded = await bucket(alice.client).download(newest)
    assert.ok(!downloaded.error, 'Another account deleted a backup or owner download failed')
    assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await downloaded.data.arrayBuffer())).toString()),expected)
    if (process.env.INTEGRATION_BACKUP_FIXTURE) console.log(`Verified live Storage round trip: ${expected.tables.library_entries.length} works; ${bytes.length} compressed bytes.`)
    // Administrative clock adjustment is test-only; users cannot access this table.
    assert.ok(!(await admin.from('backup_save_state').update({ attempted_at: new Date(0).toISOString() }).eq('user_id',alice.id)).error)
    const concurrent = await Promise.all([invoke(alice.client),invoke(alice.client)])
    assert.equal(concurrent.filter(result => !result.error).length,1,'Concurrent requests created multiple backups')
    assert.equal((await list(alice)).length,3)
    assert.ok(!(await invoke(bob.client)).error,'One account consumed another account’s cooldown')
    // Legacy/interrupted cleanup is reconciled by GET without a creation attempt.
    for (let n = 0; n < 2; n++) assert.ok(!(await bucket(admin).upload(`${alice.id}/extra-${n}-${randomUUID()}.json.gz`,bytes,{ contentType:'application/gzip' })).error)
    const refreshed = await alice.client.functions.invoke('save-backup',{ method:'GET' })
    assert.ok(!refreshed.error)
    assert.equal((await list(alice)).length,3)
  })
  await check('unapproved direct API signup is rejected by the beta hook', async () => {
    const email = `denied-${randomUUID()}@example.com`
    const signup = await anonymous.auth.signUp({ email, password: `Test-${randomUUID()}!Aa1` })
    if (signup.data.user) users.push({ id: signup.data.user.id, client: anonymous })
    assert.equal(signup.error?.message, 'Private beta: this email address has not been approved for account creation.')
    assert.equal(signup.data.user, null)
    assert.equal(signup.data.session, null)
  })
  await check('approved email signup reserves a username and requires confirmation', async () => {
    const username = `New_${randomUUID().replaceAll('-', '').slice(0, 20)}`
    const email = `signup-${randomUUID()}@example.com`
    await approveEmail(email)
    const signup = await anonymous.auth.signUp({ email, password: `Test-${randomUUID()}!Aa1`, options: { data: { username } } })
    if (signup.data.user) users.push({ id: signup.data.user.id, client: anonymous })
    assert.equal(signup.error, null)
    assert.ok(signup.data.user)
    assert.equal(signup.data.session, null, 'Public registration must require email confirmation')
    const confirmed = await admin.auth.admin.updateUserById(signup.data.user.id, { email_confirm: true })
    assert.equal(confirmed.error, null)
    const resolved = await admin.rpc('account_login_email', { p_username: username.toLowerCase() })
    assert.equal(resolved.error, null)
    assert.equal(resolved.data, signup.data.user.email)
  })
  console.log(`${passed} live Supabase integration checks passed.`)
} catch (error) {
  console.error(`Failed stage: ${stage}`)
  if (error instanceof assert.AssertionError) console.error(error.message)
  else if (error instanceof Error) console.error(error.name, error.stack?.split('\n').filter(line => line.includes('test-supabase.mjs')).slice(0,2).join('\n'))
  console.error('Live Supabase integration checks failed. Inspect local Auth/PostgREST configuration and migrations; credentials are intentionally omitted.')
  process.exitCode = 1
} finally {
  let cleanupFailed = false
  for (const user of users) {
    const saved = await admin.storage.from('library-backups').list(user.id)
    if (saved.error) cleanupFailed = true
    else if (saved.data.length && (await admin.storage.from('library-backups').remove(saved.data.map(file => `${user.id}/${file.name}`))).error) cleanupFailed = true
    await user.client.auth.signOut()
    if ((await admin.auth.admin.deleteUser(user.id)).error) cleanupFailed = true
  }
  for (const [table, ids] of Object.entries(cleanup)) {
    if (ids.length && (await admin.from(table).delete().in('id', ids)).error) cleanupFailed = true
  }
  if (approvedEmails.length && (await admin.from('beta_signup_allowlist').delete().in('email', approvedEmails)).error) cleanupFailed = true
  if (cleanupFailed) { console.error('Test cleanup incomplete. Reset the local development database.'); process.exitCode = 1 }
}
