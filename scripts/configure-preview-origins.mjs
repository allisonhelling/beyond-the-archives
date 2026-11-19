import { readFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { vercelProjects, vercelTeamId } from './vercel-projects.mjs'

const isPreviewBranch = branch => typeof branch === 'string' && Boolean(branch) && branch.toLowerCase() !== 'main'

export function previewPush(event, repository) {
 const run = event?.workflow_run
 const branch = run?.head_branch
 const sha = run?.head_sha
 if (!repository || event?.action !== 'in_progress' || run?.name !== 'CI' || run.event !== 'push'
  || event.repository?.full_name !== repository || run.head_repository?.full_name !== repository
  || !isPreviewBranch(branch) || !/^[a-f0-9]{40}$/.test(sha ?? '')) return null
 return { branch, sha }
}

export function deletedPreviewBranch(event, repository) {
 return repository && event?.repository?.full_name === repository && event.ref_type === 'branch' && isPreviewBranch(event.ref)
  ? event.ref : null
}

async function previewOriginBindings(project, branch, request) {
 const { envs } = await request(`/v10/projects/${project.id}/env`, { query: { gitBranch: branch, decrypt: 'false' } })
 return new Map(vercelProjects.map(({ originKey }) => {
  const matches = envs.filter(env => env.key === originKey && env.gitBranch === branch)
  const binding = matches[0]
  if (matches.length > 1 || binding && (!binding.id || binding.target?.length !== 1 || binding.target[0] !== 'preview' || binding.customEnvironmentIds?.length)) {
   throw new Error(`Unexpected scope for ${originKey} on ${project.name}.`)
  }
  return [originKey, binding]
 }))
}

const bindingPath = (project, id) => `/v9/projects/${project.id}/env/${encodeURIComponent(id)}`

export async function removePreviewOrigins({ branch, request, currentHead, log = console.log }) {
 if (!isPreviewBranch(branch)) throw new Error('Preview cleanup requires a non-main branch.')
 const wasRecreated = async () => (await currentHead(branch)) !== null
 if (await wasRecreated()) return log('Skipping cleanup because the branch exists on GitHub.')
 const plans = await Promise.all(vercelProjects.map(async project => ({ project, bindings: await previewOriginBindings(project, branch, request) })))
 for (const { project, bindings } of plans) {
  for (const [key, binding] of bindings) {
   if (!binding) continue
   if (await wasRecreated()) return log('Stopping cleanup because the branch was recreated on GitHub.')
   await request(bindingPath(project, binding.id), { method: 'DELETE' })
   log(`Removed ${key} from ${project.name} Preview for the deleted branch.`)
  }
 }
}

function verifyDeployment(deployment, project, { branch, sha }) {
 if (!deployment || deployment.name !== project.name || (deployment.projectId ?? deployment.project?.id ?? project.id) !== project.id
  || ![null, 'preview'].includes(deployment.target) || deployment.customEnvironment || deployment.customEnvironmentId
  || deployment.meta?.githubCommitRef !== branch || deployment.meta?.githubCommitSha !== sha) {
  throw new Error(`Unexpected deployment identity for ${project.name}.`)
 }
 return deployment
}

async function waitFor(read, attempts, pause) {
 for (let attempt = 0; attempt < attempts; attempt++) {
  const result = await read()
  if (result) return result
  if (attempt + 1 < attempts) await pause(5000)
 }
 return null
}

export async function configurePreviewOrigins({ preview, request, currentHead, pause = setTimeout, log = console.log }) {
 if (!isPreviewBranch(preview.branch)) throw new Error('Preview automation requires a non-main branch.')
 const { branch, sha } = preview
 const stillCurrent = async () => (await currentHead(branch)) === sha
 if (!await stillCurrent()) return log('Skipping a deleted or superseded Preview branch revision.')

 const deployments = await Promise.all(vercelProjects.map(async project => {
  const found = await waitFor(async () => {
   const { deployments } = await request('/v7/deployments', { query: { projectId: project.id, branch, sha, limit: '1' } })
   if (!deployments.length) return null
   const deployment = verifyDeployment(await request(`/v13/deployments/${encodeURIComponent(deployments[0].uid)}`), project, preview)
   const domains = (deployment.alias ?? []).filter(alias => typeof alias === 'string'
    && alias.startsWith(`${project.name}-git-`) && /^[a-z0-9-]+\.vercel\.app$/.test(alias))
   if (domains.length > 1) throw new Error(`Ambiguous Git branch alias for ${project.name}.`)
   return domains.length ? { project, deployment, origin: `https://${domains[0]}` } : null
  }, 30, pause)
  if (!found) throw new Error(`Vercel did not expose a Preview alias for ${project.name} on this revision.`)
  return found
 }))
 const origins = deployments.map(({ project, origin }) => ({ key: project.originKey, value: origin }))

 const plans = await Promise.all(deployments.map(async ({ project, deployment }) => {
  const bindings = await previewOriginBindings(project, branch, request)
  const updates = []
  let rebuild = [...bindings.values()].some(binding => binding && (binding.updatedAt ?? binding.createdAt) > deployment.createdAt)
  for (const { key, value } of origins) {
   const existing = bindings.get(key)
   const binding = existing && await request(`/v1/projects/${project.id}/env/${encodeURIComponent(existing.id)}`)
   if (binding?.value === value) continue
   updates.push({ id: existing?.id, body: { key, value, gitBranch: branch, target: ['preview'], type: 'encrypted' } })
   rebuild = true
  }
  return { project, deployment, updates, rebuild }
 }))

 for (const { project, updates } of plans) {
  for (const { id, body } of updates) {
   if (!await stillCurrent()) return log('Skipping a deleted or superseded Preview branch revision.')
   if (id) await request(bindingPath(project, id), { method: 'PATCH', body })
   else {
    const result = await request(`/v10/projects/${project.id}/env`, { method: 'POST', query: { upsert: 'false' }, body })
    if (result.failed?.length) throw new Error(`Could not add ${body.key} on ${project.name}.`)
   }
  }
 }
 for (const { project, deployment, rebuild } of plans) {
  if (!rebuild) {
   log(`${project.name} already has both Preview origins for this build.`)
   continue
  }
  if (!await stillCurrent()) return log('Skipping a deleted or superseded Preview branch revision.')
  const result = await request('/v13/deployments', { method: 'POST', query: { forceNew: '1' },
   body: { name: project.name, project: project.id, deploymentId: deployment.id } })
  if (!result.id || ![null, 'preview'].includes(result.target)) throw new Error(`Unexpected rebuild response for ${project.name}.`)
  log(`Queued Preview rebuild for ${project.name} (${result.id}).`)
 }
}

async function run(env) {
 if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Preview automation runs from main.')
 const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'))
 const deletedBranch = env.GITHUB_EVENT_NAME === 'delete' ? deletedPreviewBranch(event, env.GITHUB_REPOSITORY) : null
 const preview = env.GITHUB_EVENT_NAME === 'workflow_run' ? previewPush(event, env.GITHUB_REPOSITORY) : null
 if (!preview && !deletedBranch) return
 if (!env.VERCEL_PREVIEW_TOKEN || !env.GH_TOKEN) throw new Error('Configure VERCEL_PREVIEW_TOKEN in the preview-automation GitHub environment.')
 const request = async (path, { query = {}, method = 'GET', body } = {}) => {
  const url = new URL(path, 'https://api.vercel.com')
  url.search = new URLSearchParams({ teamId: vercelTeamId, ...query })
  const result = await fetch(url, {
   method, redirect: 'error', signal: AbortSignal.timeout(15000),
   headers: { Authorization: `Bearer ${env.VERCEL_PREVIEW_TOKEN}`, 'Content-Type': 'application/json' },
   body: body && JSON.stringify(body),
  })
  if (method === 'DELETE' && (result.ok || result.status === 404)) return null
  if (!result.ok) throw new Error(`Vercel ${method} request failed (HTTP ${result.status}).`)
  return result.json()
 }
 const currentHead = async branch => {
  const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`
  const result = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${env.GH_TOKEN}` } })
  if (result.status === 404) return null
  if (!result.ok) throw new Error(`GitHub branch lookup failed (HTTP ${result.status}).`)
  return (await result.json()).object?.sha
 }
 if (deletedBranch) {
  // GitHub can also return 404 when the token cannot read the repository.
  if (!await currentHead('main')) throw new Error('Cannot verify GitHub repository access for Preview cleanup.')
  await removePreviewOrigins({ branch: deletedBranch, request, currentHead })
 } else await configurePreviewOrigins({ preview, request, currentHead })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try { await run(process.env) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
