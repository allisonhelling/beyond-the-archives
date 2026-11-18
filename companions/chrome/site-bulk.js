import { classifyObservations } from '../../src/features/imports/classify-observations.ts'
import { mappingMatches, readObservations, sourcePage, validRequestId } from '../../src/features/imports/site-mapping.ts'

const rpc = '/rest/v1/rpc/'
const lanePrefix = 'site-bulk:'
export function createSiteBulk({ storage, getAuth, api, generation, appOrigin, loadMappings }) {
 const key = tabId => lanePrefix + tabId
 const running = new Set()
 const timers = new Map()
 async function lane(tabId) { return (await storage.get(key(tabId)))[key(tabId)] }
 async function store(tabId, job) { await storage.set({ [key(tabId)]: job }) }
 async function close(tabId) {
  clearTimeout(timers.get(tabId)); timers.delete(tabId)
  await storage.remove(key(tabId))
 }
 async function begin(message, sender) {
  const auth = await getAuth(), version = generation()
  const { batch, url } = message
  if (!auth || auth.sample || sender.frameId !== 0 || !sender.documentId || !validRequestId(batch) || !sourcePage(url) || sourcePage(url) !== url || new URL(url).origin === appOrigin()) throw new Error('Open this batch from the connected library.')
  const origins = await api(auth, rpc + 'site_import_origins', { p_batch: batch })
  if (version !== generation() || !origins.some(item => item.url === url)) throw new Error('The pending batch changed. Refresh and retry.')
  const tab = await chrome.tabs.create({ url, active: true })
  if (version !== generation() || !Number.isInteger(tab.id)) throw new Error('The account changed. Retry the batch.')
  await store(tab.id, { account: auth.userId, batch, origin: new URL(url).origin, expected: url, authorized: false })
  return { ok: true }
 }
 async function authorize(tab) {
  if (!Number.isInteger(tab.id)) return false
  const current = await lane(tab.id)
  if (!current) return false
  const auth = await getAuth(), version = generation()
  if (!auth || auth.userId !== current.account) throw new Error('Reopen a pending source tab from the original batch.')
  if (sourcePage(tab.url) !== current.expected) {
   const job = await api(auth, rpc + 'claim_site_import', { p_batch: current.batch, p_origin: current.origin, p_url: current.expected })
   if (job && version === generation()) await api(auth, rpc + 'finish_site_import', { p_batch: current.batch, p_item: job.id, p_token: job.token, p_problem: 'redirected' })
   await close(tab.id)
   return true
  }
  await store(tab.id, { ...current, authorized: true })
  void pump(tab.id)
  return true
 }
 function schedule(tabId) {
  clearTimeout(timers.get(tabId))
  timers.set(tabId, setTimeout(() => { timers.delete(tabId); void pump(tabId) }, 3000))
 }
 async function pump(tabId) {
  if (running.has(tabId)) return
  running.add(tabId)
  let again = false
  try {
   const task = await lane(tabId), auth = await getAuth(), version = generation()
   if (!task?.authorized || !auth || auth.userId !== task.account || auth.expiresAt * 1000 <= Date.now()) return
   const tab = await chrome.tabs.get(tabId)
   const payload = { p_batch: task.batch }
   const finish = async fields => {
    if (version !== generation()) return false
    return api(auth, rpc + 'finish_site_import', { ...payload, p_item: task.job.id, p_token: task.job.token, ...fields })
   }
   if (task.job && Date.now() >= Date.parse(task.job.expiresAt) - 20_000) {
    await finish({ p_problem: 'capture_failed' })
    await close(tabId)
    return
   }
   if (task.job && tab.status === 'loading') { again = true; return }
   if (sourcePage(tab.url) !== task.expected) {
    if (task.job) await finish({ p_problem: 'redirected' })
    await close(tabId)
    return
   }
   if (!task.job) {
    const job = await api(auth, rpc + 'claim_site_import', { ...payload, p_origin: task.origin })
    if (!job) return
    if (version !== generation() || sourcePage(job.url) !== job.url || new URL(job.url).origin !== task.origin) return
    const beforeNavigation = await chrome.tabs.get(tabId)
    if (beforeNavigation.url !== task.expected) return
    await store(tabId, { ...task, job, expected: job.url })
    if (job.url !== tab.url) await chrome.tabs.update(tabId, { url: job.url })
    again = true
    return
   }
   let result
   const filter = rule => rule && mappingMatches(rule, task.expected)
   const { rules, classificationRules } = task
   const mapped = rules ?? await loadMappings(auth)
   const ruleRevision = await api(auth, rpc + 'tag_classification_revision', {})
   const labels = classificationRules && ruleRevision === task.ruleRevision ? classificationRules : await loadRules(auth)
   if (version !== generation()) return
   try {
    const [target] = await chrome.scripting.executeScript({ target: { tabId }, files: ['site-content.js'], world: 'ISOLATED' })
    if (target?.documentId) result = await chrome.tabs.sendMessage(tabId, {
     type: 'BTA_SITE_BULK_CAPTURE', url: task.expected, rules: mapped.filter(filter),
    }, { documentId: target.documentId })
   } catch { /* The browser may revoke tab access or block injection. */ }
   const observations = readObservations(result?.observations)
   const recognized = mapped.some(rule => filter(rule) && rule.scope !== 'site')
   const hasStoryEvidence = recognized || result?.storyEvidence === true
   await finish(result?.ok && hasStoryEvidence && observations.title ? {
    p_metadata: classifyObservations(observations, task.expected, labels), p_observations: observations,
   } : { p_problem: result?.ok ? 'needs_story_evidence' : 'capture_failed' })
   if (version !== generation() || !await lane(tabId)) return
   await store(tabId, { ...task, job: null, rules: mapped, classificationRules: labels, ruleRevision })
   again = true
  } catch { again = true } finally {
   running.delete(tabId)
   if (again) schedule(tabId)
  }
 }
 async function loadRules(auth) {
  const rules = []
  for (let offset = 0; ; offset += 500) {
   const page = await api(auth, `/rest/v1/tag_classification_rules?select=*&order=id&limit=500&offset=${offset}`)
   rules.push(...page)
   if (page.length < 500) return rules
  }
 }
 async function resume() {
  const sessions = await storage.get(null)
  for (const entry of Object.keys(sessions)) if (entry.startsWith(lanePrefix)) void pump(Number(entry.slice(lanePrefix.length)))
 }
 return { begin, authorize, close, resume, busy: () => running.size > 0 }
}
