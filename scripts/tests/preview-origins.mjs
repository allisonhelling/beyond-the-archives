import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configurePreviewOrigins, deletedPreviewBranch, previewPush, removePreviewOrigins } from '../configure-preview-origins.mjs'
import { vercelProjects } from '../vercel-projects.mjs'

const preview = { branch: 'universal-stories/new-preview', sha: 'a'.repeat(40) }
const repository = { full_name: 'owner/beyond-the-archives' }
const run = { name: 'CI', event: 'push', head_branch: preview.branch, head_sha: preview.sha, head_repository: repository }
const event = { action: 'in_progress', repository, workflow_run: run }

test('uses same-repository CI pushes and rejects main, pull requests and forks', () => {
 assert.deepEqual(previewPush(event, repository.full_name), preview)
 for (const override of [{ head_branch: 'main' }, { event: 'pull_request' }, { head_repository: { full_name: 'fork/project' } }]) {
  assert.equal(previewPush({ ...event, workflow_run: { ...run, ...override } }, repository.full_name), null)
 }
})

const deployments = vercelProjects.map(({ id, name }, index) => ({
 uid: `dpl_${index}`, id: `dpl_${index}`, projectId: id, name, target: null, createdAt: 100,
 meta: { githubCommitRef: preview.branch, githubCommitSha: preview.sha },
 alias: [`${name}-git-feature-${index}-team.vercel.app`],
}))
const bindings = vercelProjects.map(({ originKey }, index) => ({
 id: `env_${index}`, key: originKey, value: `https://${deployments[index].alias[0]}`,
 target: ['preview'], gitBranch: preview.branch, createdAt: 90,
}))

function fixture({ rows = [], target, head = preview.sha, rollout = deployments } = {}) {
 const writes = []
 const request = async (path, { query, method, body } = {}) => {
  if (method) {
   writes.push({ path, method, body })
   return { id: 'dpl_rebuild', target: null }
  }
  if (path === '/v7/deployments') {
   assert.equal(query.branch, preview.branch)
   assert.equal(query.sha, preview.sha)
   return { deployments: rollout.filter(deployment => deployment.projectId === query.projectId) }
  }
  const deployment = rollout.find(({ id }) => path === `/v13/deployments/${id}`)
  if (deployment) return target === undefined ? deployment : { ...deployment, target }
  if (path.startsWith('/v1/projects/')) return rows.find(row => path.endsWith(`/${row.id}`))
  if (path.startsWith('/v10/projects/')) {
   assert.equal(query.gitBranch, preview.branch)
   assert.equal(query.decrypt, 'false')
   return { envs: rows }
  }
  throw new Error(`Unexpected read ${path}.`)
 }
 const options = { request, currentHead: typeof head === 'function' ? head : async () => head, log: () => {} }
 return { writes, run: () => configurePreviewOrigins({ ...options, preview, pause: async () => {} }),
  clean: () => removePreviewOrigins({ ...options, branch: preview.branch }) }
}

test('writes the verified pair to both projects and queues Preview rebuilds', async () => {
 const { writes, run } = fixture()
 await run()
 assert.equal(writes.length, 6)
 for (const [index, project] of vercelProjects.entries()) {
  for (const [offset, { key, value }] of bindings.entries()) {
   assert.deepEqual(writes[index * 2 + offset], {
    path: `/v10/projects/${project.id}/env`, method: 'POST',
    body: { key, value, target: ['preview'], gitBranch: preview.branch, type: 'encrypted' },
   })
  }
  assert.deepEqual(writes[4 + index].body, { name: project.name, project: project.id, deploymentId: deployments[index].id })
 }
})

test('leaves matching bindings and other scopes alone, and recovers a missed rebuild', async () => {
 const clean = fixture({ rows: [...bindings, { ...bindings[0], gitBranch: null, target: ['production'] }] })
 await clean.run()
 assert.deepEqual(clean.writes, [])
 const interrupted = fixture({ rows: [{ ...bindings[0], updatedAt: 101 }, bindings[1]] })
 await interrupted.run()
 assert.deepEqual(interrupted.writes.map(write => write.path), ['/v13/deployments', '/v13/deployments'])
 const outdated = fixture({ rows: [{ ...bindings[0], value: 'https://old.example' }, bindings[1]] })
 await outdated.run()
 assert.deepEqual(outdated.writes.map(write => write.method), ['PATCH', 'PATCH', 'POST', 'POST'])
})

test('refuses ambiguous scopes, production deployments, and superseded commits', async () => {
 for (const options of [{ target: 'production' }, { rollout: [deployments[0]] }, { rows: [{ ...bindings[0], target: ['preview', 'production'] }] }]) {
  const { writes, run } = fixture(options)
  await assert.rejects(run())
  assert.deepEqual(writes, [])
 }
 const stale = fixture({ head: 'b'.repeat(40) })
 await stale.run()
 assert.deepEqual(stale.writes, [])
})

test('accepts only same-repository non-main branch deletions', () => {
 const deletion = { repository, ref: preview.branch, ref_type: 'branch' }
 assert.equal(deletedPreviewBranch(deletion, repository.full_name), preview.branch)
 for (const override of [{ ref: 'main' }, { ref_type: 'tag' }, { repository: { full_name: 'fork/project' } }]) {
  assert.equal(deletedPreviewBranch({ ...deletion, ...override }, repository.full_name), null)
 }
})

test('deletes only the two branch-scoped Preview URL bindings from both projects', async () => {
 const otherRows = [
  { ...bindings[0], id: 'env_default', gitBranch: null },
  { ...bindings[0], id: 'env_production', gitBranch: null, target: ['production'] },
  { ...bindings[1], id: 'env_other_branch', gitBranch: 'other' },
  { ...bindings[0], id: 'env_backend', key: 'VITE_SUPABASE_URL' },
 ]
 const cleanup = fixture({ rows: [...bindings, ...otherRows], head: null })
 await cleanup.clean()
 assert.deepEqual(cleanup.writes, vercelProjects.flatMap(({ id }) => bindings.map(binding => ({
  path: `/v9/projects/${id}/env/${binding.id}`, method: 'DELETE', body: undefined,
 }))))
 const retry = fixture({ rows: otherRows, head: null })
 await retry.clean()
 assert.deepEqual(retry.writes, [])
})

test('skips recreated branches and stops before a write if the branch returns', async () => {
 let reads = 0
 for (const head of [preview.sha, async () => ++reads === 1 ? null : preview.sha]) {
  const cleanup = fixture({ rows: bindings, head })
  await cleanup.clean()
  assert.deepEqual(cleanup.writes, [])
 }
 const ambiguous = fixture({ rows: [{ ...bindings[0], target: ['preview', 'production'] }], head: null })
 await assert.rejects(ambiguous.clean(), /Unexpected scope/)
 assert.deepEqual(ambiguous.writes, [])
})
