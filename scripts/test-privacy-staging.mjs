import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { stagingSessions, stagingAudit, fixtureResult as checked } from './staging-fixtures.mjs'
import { syntheticEpub } from './local-fixtures.mjs'

const checks = [], cleanup = []
let fixture, failed = false, auditHistoryVerified = false
try {
 assert.equal(process.argv.length, 2, 'No target overrides or external fixtures are accepted.')
 fixture = await stagingSessions()
 const { accounts, anonymous } = fixture
 const bytes = await syntheticEpub(), hash = createHash('sha256').update(bytes).digest('hex')
 // Fail MFA before writing sentinels. These audit reads append retained events.
 for (const account of accounts) await stagingAudit(account)
 for (const account of accounts) {
  const id = checked(await account.client.rpc('save_library_story', {
   p_url: `https://synthetic.example/staging/${randomUUID()}`,
   p_metadata: { title: 'Synthetic Staging Privacy Fixture' }, p_status: 'to_read', p_progress: 0,
   p_notes: 'Generated staging sentinel', p_rating: null, p_favorite: false, p_collections: [], p_tags: [],
  }))
  account.entries.push(id)
  cleanup.push(async () => { checked(await account.client.from('library_entries').delete().eq('id', id).eq('user_id', account.id)) })
  // Unique path per run: never replace an existing reader original.
  const fixtureHash = createHash('sha256').update(randomUUID()).digest('hex')
  account.path = `${account.id}/${fixtureHash}/0.epub`
  cleanup.push(async () => {
   checked(await account.client.rpc('reader_cloud_apply',{p_id:randomUUID(),p_key:`${fixtureHash}/deleted`,p_value:true,p_base:0,p_generation:0}))
   checked(await account.client.storage.from('reader-epubs').remove([account.path]))
  })
  checked(await account.client.storage.from('reader-epubs').upload(account.path, bytes, { contentType: 'application/epub+zip', upsert: false }))
 }
 for (const [index, account] of accounts.entries()) {
  const victim = accounts[(index + 1) % accounts.length]
  assert.equal(checked(await account.client.from('library_entries').select('id').eq('id', account.entries[0])).length, 1)
  assert.deepEqual(checked(await account.client.from('library_entries').select('id').eq('id', victim.entries[0])), [])
  assert.deepEqual(checked(await account.client.from('library_entries').update({ notes: 'Forged' }).eq('id', victim.entries[0]).select('id')), [])
  assert.deepEqual(checked(await account.client.from('library_entries').delete().eq('id', victim.entries[0]).select('id')), [])
  const own = checked(await account.client.storage.from('reader-epubs').download(account.path))
  assert.equal(createHash('sha256').update(new Uint8Array(await own.arrayBuffer())).digest('hex'), hash)
  for (const client of [account.client, anonymous]) {
   assert.ok((await client.storage.from('reader-epubs').download(victim.path)).error)
   assert.ok((await client.storage.from('reader-epubs').createSignedUrl(victim.path, 60)).error)
  }
  assert.ok((await account.client.from('user_roles').update({ role_id: 'owner' }).eq('user_id', account.id)).error)
  checks.push({ identity: account.identity, library: 'passed', storage: 'passed', directRoleWrite: 'denied' })
 }
 const anon = await anonymous.from('library_entries').select('id').in('id', accounts.flatMap(a => a.entries))
 if (!anon.error) assert.deepEqual(anon.data, [])
 await fixture.verifyRetainedState()
} catch { failed = true }
finally {
 for (const remove of cleanup.reverse()) { try { await remove() } catch { failed = true } }
 if (fixture) { try { await fixture.verifyRetainedState(); auditHistoryVerified = true } catch { failed = true } }
 await mkdir(new URL('../artifacts/privacy/', import.meta.url), { recursive: true })
 const report = { capturedAt: new Date().toISOString(), environment: 'staging', passed: !failed, checks, auditHistoryVerified, ownerLifecycle: 'Persistent Owner; no transfer/bootstrap/role cleanup', limitations: ['Focused signed-session smoke; does not replace the full local S3 catalog, browser, queue, or recovery matrix.'] }
 await writeFile(new URL(`../artifacts/privacy/staging-${report.capturedAt.replaceAll(/[:.]/g, '-')}.json`, import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
 console.log(failed ? 'Staging privacy verification failed or prerequisites are missing; response details withheld. Check synthetic state before retrying.' : 'PASS staging real-session privacy checks; accounts, Owner and audit history retained.')
 if (failed) process.exitCode = 1
}
