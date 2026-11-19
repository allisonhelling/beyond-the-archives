import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createServer } from 'vite'
import { createTestDatabase } from './test-database.mjs'

// Synthetic measurements. Database replay and fixture setup are outside timed operations.
async function measure(label, operation) {
 const start = performance.now()
 const result = await operation()
 console.log(`${label}: ${(performance.now() - start).toFixed(1)} ms`)
 return result
}

const vite = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
try {
 const { previewBulkLinks } = await vite.ssrLoadModule('/src/features/imports/bulk-links.ts')
 const { classifyObservations } = await vite.ssrLoadModule('/src/features/imports/classify-observations.ts')
 const origin = 'https://fiction.example'
 const urls = Array.from({ length: 2000 }, (_, index) => `${origin}/story/${index + 1}`)
 const commonRule = { scope: 'matching', prefix: '/story/', field: 'title' }
 const rules = Array.from({ length: 1000 }, (_, index) => ({ ...commonRule, example: `https://source${index}.example/story/1` }))
 rules.push({ ...commonRule, example: urls[0] })
 const links = await measure('Preview 2,000 URLs against 1,001 cached mappings', () => previewBulkLinks(urls, rules))
 assert(links.every(link => link.kind === 'recognized'))

 const labels = Array.from({ length: 30 }, (_, index) => `Fixture Tag ${index}`)
 const classificationRules = Array.from({ length: 1000 }, (_, index) => ({
  id: String(index), label: `Fixture Tag ${index}`, scope: 'site', site: origin, category: 'character', enabled: true, priority: null,
 }))
 const observations = { ao3_tags: { text: labels.join('\n'), via: 'Page Element' } }
 await measure('Classify 30 observations using 1,000 cached rules on each of 2,000 pages', () => {
  for (const url of urls) assert.deepEqual(classifyObservations(observations, url, classificationRules).character_tags, labels)
 })

 const db = await createTestDatabase()
 try {
  const owner = '61000000-0000-4000-8000-000000000001', batch = '61000000-0000-4000-8000-000000000002'
  const rpc = async (statement, params) => (await db.query(`select ${statement} result`, params)).rows[0].result
  await db.query('insert into auth.users(id) values ($1)', [owner])
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`)
  const items = urls.map(url => ({ url, recognized: true }))
  assert.equal(await measure('Submit 2,000 website links', () => rpc('public.submit_site_import($1,$2)', [batch, items])), batch)
  for (let index = 0; index < 100; index++) {
   const job = await rpc('public.claim_site_import($1,$2)', [batch, origin])
   assert(await rpc('public.finish_site_import($1,$2,$3,$4)', [batch, job.id, job.token, { title: `Fixture Story ${index + 1}` }]))
  }
  const page = await measure('Read page 4 of a 100-story unresolved review', () => rpc('public.review_import_counts($1,4,25)', [batch]))
  assert.equal(page.reviewNeeded, 100)
  assert.equal(page.rows.length, 25)
  const edits = page.rows.map(({ id, revision }) => ({ id, revision, count: '100000', manual: true }))
  const saved = await measure('Save 25 unresolved counts at the 100,000 chapter limit', () =>
   rpc('public.review_import_counts($1,4,25,false,$2)', [batch, edits]))
  assert.equal(saved.saved, 25)
  assert.equal(saved.reviewNeeded, 75)
 } finally {
  await db.close()
 }
} finally {
 await vite.close()
}
