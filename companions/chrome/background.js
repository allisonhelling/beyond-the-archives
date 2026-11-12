import { parseSeriesUrl, seriesPageUrl, parseWorkUrl } from '../../src/features/imports/urls.ts'
import { captureMetadataPage } from './capture.js'
import { isLocalHostname } from '../../src/lib/local-app.ts'
import { createLibrarySync } from './library-sync.js'
import { installBarBridge } from './bar-background.js'
import { configuredEnvironments, createEnvironmentManager } from './environments.js'
import { companionContractVersion, metadataRetrievalCapability, validCapabilityRequest } from '../../src/features/imports/companion-contract.ts'

const profiles = configuredEnvironments()
const environments = profiles ? createEnvironmentManager(profiles, __DEFAULT_ENVIRONMENT__) : null
const storage = environments?.storage ?? chrome.storage
let appOrigin = __APP_ORIGIN__, backend = __SUPABASE_URL__, publicKey = __SUPABASE_KEY__
const ready = environments?.ready.then(() => {
 const profile = environments.current
 appOrigin = profile.appOrigin; backend = profile.backend; publicKey = profile.publicKey
}) ?? Promise.resolve()
const bar = installBarBridge(environments, () => switching)
let switching = false
let externalRequests = 0
let running = false
let rerun = false
let connectionVersion = 0
const nextJobDelayMs = 3000
let nextJobTimer
let librarySyncTimer
const librarySync = createLibrarySync({
 storage,
 schedule: when => {
  clearTimeout(librarySyncTimer)
  librarySyncTimer = setTimeout(() => { void librarySync.pump() }, Math.max(0, when - Date.now()))
 },
 auth: async () => {
  await ready
  if (switching) return null
  const state = await storage.session.get(['auth', 'sampleAuth', 'syncSample'])
  return state.syncSample ? state.sampleAuth : state.auth
 },
 available: async () => !switching && !running && !previewRunning && !(await storage.session.get('active')).active,
 changed: () => { void librarySync.pump(); void pump() },
})

async function api(auth, path, body) {
 await ready
 if (switching) throw new Error('Environment changed. Reload the library page.')
 const response = await fetch(`${backend}${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { apikey: publicKey, Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  signal: AbortSignal.timeout(20000),
 })
 if (response.status === 401 || response.status === 403) {
  const current = await storage.session.get('auth')
  if (current.auth?.token === auth.token) await storage.session.clear()
  await chrome.action.setBadgeText({ text: 'AUTH' })
  throw new Error('Reconnect in library Settings.')
 }
 if (!response.ok) throw new Error('Library request failed.')
 return response.json()
}
function matchingWork(url, workId, sourceUrl) {
 try { const identity = parseWorkUrl(url); return identity.workId === workId && (sourceUrl ? Boolean(identity.archiveUrl) : new URL(url).origin === 'https://archiveofourown.org') }
 catch { return false }
}
// Each capture lane reuses its own extension-created tab. A matching user tab
// may be read for work captures, but is never claimed or redirected. Series
// previews always stay in their own extension-created window.
async function captureTab(targetUrl, matches, key, version, windowKey) {
 const tabs = windowKey ? [] : await chrome.tabs.query({ url: 'https://archiveofourown.org/*' })
 if (version !== connectionVersion) throw new Error('Extension connection changed. Retry the capture.')
 const matching = tabs.find(candidate => matches(candidate.url))
 if (matching) return matching
 const stored = await storage.session.get(windowKey ? [key, windowKey] : key)
 let owned
 if (stored[key] !== undefined) {
  try {
   const tab = await chrome.tabs.get(stored[key])
   if (new URL(tab.url).origin === 'https://archiveofourown.org' && (!windowKey || tab.windowId === stored[windowKey])) owned = tab
  } catch { /* Closed or repurposed tabs are left alone. */ }
 }
 if (version !== connectionVersion) throw new Error('Extension connection changed. Retry the capture.')
 if (owned && matches(owned.url)) return owned
 await storage.session.set({ ao3LastNavigation: Date.now() })
 if (owned) return chrome.tabs.update(owned.id, { url: targetUrl })
 let windowId
 if (windowKey && stored[windowKey] !== undefined) {
  try { windowId = (await chrome.windows.get(stored[windowKey])).id } catch { /* Recreate a closed preview window. */ }
 }
 let tab
 if (windowKey && windowId === undefined) {
  const window = await chrome.windows.create({ url: targetUrl, type: 'normal', focused: false })
  tab = window.tabs?.[0]
  if (!Number.isInteger(tab?.id)) throw new Error('Could not open the series preview window. Retry the preview.')
  windowId = window.id
 } else tab = await chrome.tabs.create({ url: targetUrl, active: false, ...(windowKey ? { windowId } : {}) })
 await storage.session.set({ [key]: tab.id, ...(windowKey ? { [windowKey]: windowId } : {}) })
 return tab
}
async function pump() {
 await ready
 if (switching) return
 if (running) { rerun = true; return }
 clearTimeout(nextJobTimer)
 running = true
 const version = connectionVersion
 let completed = false
 try {
  const state = await storage.session.get(['auth', 'active', 'syncSample'])
  if (version !== connectionVersion) return
  if (state.syncSample) return
  const auth = state.auth
  if (!auth) return
  if (auth.expiresAt * 1000 <= Date.now()) {
   await storage.session.clear()
   await chrome.action.setBadgeText({ text: 'AUTH' })
   return
  }
  let active = state.active
  if (!active) {
   if (previewRunning || await librarySync.blocksImports()) return
   if ((await storage.session.get('ao3RequestAfter')).ao3RequestAfter > Date.now()) return
   const job = await api(auth, '/rest/v1/rpc/claim_extension_job', {})
   if (version !== connectionVersion) return
   if (!job) { await chrome.action.setBadgeText({ text: '' }); return }
   active = { ...job, tabId: null }
   await storage.session.set({ active })
  }
  const payload = { jobId: active.id, token: active.token }
  if (Date.now() >= Date.parse(active.expiresAt) - 45000) {
   // Finish before the server lease expires. Expired/cancelled results are fenced.
   try { await api(auth, '/functions/v1/extension-metadata', { ...payload, timedOut: true }) }
   finally { await storage.session.remove('active') }
   return
  }
  let tab
  if (active.tabId !== null) {
   try { tab = await chrome.tabs.get(active.tabId) }
   catch {
    await api(auth, '/functions/v1/extension-metadata', { ...payload, timedOut: true })
    await storage.session.remove('active')
    return
   }
  } else {
   tab = await captureTab(active.sourceUrl ?? `https://archiveofourown.org/works/${active.workId}`, candidate => matchingWork(candidate, active.workId, active.sourceUrl), 'workTabId', version)
   active.tabId = tab.id
   await storage.session.set({ active })
  }
  await chrome.action.setBadgeText({ text: 'WAIT' })
  const navigationUrl = `https://archiveofourown.org/works/${active.workId}/navigate`
  if (active.workPage ? tab.url !== navigationUrl : !matchingWork(tab.url, active.workId, active.sourceUrl)) return
  const jobs = await api(auth, `/rest/v1/metadata_jobs?id=eq.${encodeURIComponent(active.id)}&select=status,lease_token`)
  if (jobs[0]?.status !== 'processing' || jobs[0]?.lease_token !== active.token) {
   await storage.session.remove('active')
   return
  }
  const latest = await storage.session.get(['auth', 'active', 'syncSample'])
  if (version !== connectionVersion || latest.auth?.userId !== auth.userId || latest.active?.token !== active.token) return
  // Metadata capture requires a claimed job; the inline bar runs independently.
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureMetadataPage, injectImmediately: true, args: active.workPage ? [tab.status !== 'complete', 'navigation'] : [tab.status !== 'complete'] })
  const page = results[0]?.result
  if (version !== connectionVersion || !page) return
  if (active.workPage ? page.url !== navigationUrl : !matchingWork(page.url, active.workId, active.sourceUrl)) return
  if (!active.sourceUrl && active.chapterDates && !active.workPage && !page.notFound) {
   active.workPage = page
   await storage.session.set({ active })
   await storage.session.set({ ao3LastNavigation: Date.now() })
   await chrome.tabs.update(tab.id, { url: navigationUrl })
   return
  }
  const snapshot = active.workPage ? { ...active.workPage, navigationHtml: page.html, navigationUrl: page.url } : page
  const result = await api(auth, '/functions/v1/extension-metadata', { ...payload, ...snapshot })
  if (result.committed) {
   await storage.session.remove('active')
   await chrome.action.setBadgeText({ text: 'OK' })
   completed = true
  }
 } catch {
  // Session storage and the server lease survive worker suspension and outages.
  const current = await storage.session.get('auth')
  if (current.auth) await chrome.action.setBadgeText({ text: '!' })
 } finally {
  running = false
  if (completed && version === connectionVersion) {
   rerun = false
   nextJobTimer = setTimeout(() => {
    if (version === connectionVersion) void pump()
   }, nextJobDelayMs)
  } else if (rerun) { rerun = false; void pump() }
 }
}

let previewRunning = false
async function previewPage(url, pageType = 'series') {
 await ready
 if (switching) throw new Error('Environment changed. Reload the library page.')
 if (await librarySync.blocksImports()) throw new Error('Pause the library scan before opening another AO3 page.')
 if ((await storage.session.get('ao3RequestAfter')).ao3RequestAfter > Date.now()) throw new Error('AO3 request cooldown is active. Retry shortly.')
 if (previewRunning) throw new Error('Another AO3 page is loading. Retry shortly.')
 previewRunning = true
 try {
  const work = pageType === 'work'
  const identity = work ? parseWorkUrl(url) : parseSeriesUrl(url)
  const targetUrl = work ? identity.archiveUrl ?? identity.normalizedUrl : seriesPageUrl(url, identity.seriesId)
  const version = connectionVersion
  const state = await storage.session.get(['auth', 'sampleAuth', 'syncSample'])
  if (work && !state.syncSample) throw new Error('Direct work captures are available only in local sample mode.')
  const auth = state.syncSample ? state.sampleAuth : state.auth
  if (!auth || auth.expiresAt * 1000 <= Date.now()) throw new Error('Reconnect the extension in Settings, then retry.')
  const matches = candidate => {
   try { return work ? matchingWork(candidate, identity.workId, identity.archiveUrl) : seriesPageUrl(candidate, identity.seriesId) === targetUrl } catch { return false }
  }
  const tab = await captureTab(targetUrl, matches, work ? 'previewTabId' : 'seriesPreviewTabId', version, work ? undefined : 'seriesPreviewWindowId')
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
   if (version !== connectionVersion) throw new Error('Extension connection changed. Retry the preview.')
   const current = await chrome.tabs.get(tab.id)
   if (matches(current.url)) {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureMetadataPage, injectImmediately: true, args: [current.status !== 'complete', pageType] })
    const page = results[0]?.result
    if (version !== connectionVersion) throw new Error('Extension connection changed. Retry the preview.')
    if (page && matches(page.url)) return page
   }
   await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('AO3 page retrieval timed out. Complete sign-in or confirmation in its tab, then retry.')
 } finally { previewRunning = false }
}

function externalMessage(message, sender, respond) {
 if (switching) { respond({ ok: false, error: 'Environment changed. Reload the library page.' }); return }

 let trusted = false
 try { trusted = new URL(sender.url).origin === appOrigin && !sender.id } catch { /* No trusted website sender. */ }
 if (!trusted) {
  if (!sender.id && profiles && Object.values(profiles).some(profile => { try { return profile.appOrigin === new URL(sender.url).origin } catch { return false } })) respond({ ok: false, error: 'Select the matching Hosted or Local environment in the extension settings, then retry.' })
  return
 }
 if (message?.type === 'AO3_LIBRARY_CAPABILITIES') {
  if (!validCapabilityRequest(message)) {
   respond({ ok: false, code: 'CONTRACT_UNSUPPORTED', error: 'Update and reconnect compatible components, or enter metadata manually.' }); return
  }
  respond({ ok: true, contractVersion: companionContractVersion, ...(message.requestId && { requestId: message.requestId }), capabilities: [metadataRetrievalCapability] }); return
 }
 if (message?.type === 'AO3_LIBRARY_SAMPLE_CONNECT') {
  if (!isLocalHostname(new URL(appOrigin).hostname)) { respond({ ok: false, error: 'Sample imports require the local extension.' }); return }
  const version = connectionVersion
  void (async () => {
   const state = await storage.session.get('active')
   if (running || previewRunning || state.active) throw new Error('Finish the current work import or preview before connecting sample mode.')
   if (version !== connectionVersion) throw new Error('Connection changed. Retry.')
   connectionVersion += 1
   clearTimeout(nextJobTimer)
   await storage.session.set({ syncSample: true, sampleAuth: { userId: 'local-sample-reader', sample: true, expiresAt: Date.now() / 1000 + 3600 } })
   respond({ ok: true })
  })().catch(error => respond({ ok: false, error: error.message }))
  return true
 }
 if (message?.type === 'AO3_LIBRARY_SYNC') {
  void librarySync.command(message).then(result => respond({ ok: true, ...result })).catch(error => respond({ ok: false, error: error.message }))
  return true
 }
 if (message?.type === 'AO3_LIBRARY_PREVIEW_SERIES' || message?.type === 'AO3_LIBRARY_CAPTURE_WORK') {
  void previewPage(message.url, message.type === 'AO3_LIBRARY_CAPTURE_WORK' ? 'work' : 'series').then(page => respond({ ok: true, page })).catch(error => respond({ ok: false, error: error.message }))
  return true
 }
 if (message?.type === 'AO3_LIBRARY_DISCONNECT') {
  connectionVersion += 1
  clearTimeout(nextJobTimer)
  void storage.session.clear().then(() => chrome.action.setBadgeText({ text: '' })).then(() => respond({ ok: true }))
  return true
 }
 if (message?.type !== 'AO3_LIBRARY_CONNECT' || typeof message.token !== 'string' || !Number.isFinite(message.expiresAt)) return
 const version = ++connectionVersion
 void (async () => {
  try {
   const auth = { token: message.token, expiresAt: message.expiresAt }
   const user = await api(auth, '/auth/v1/user')
   if (version !== connectionVersion) { respond({ ok: false }); return }
   const previous = await storage.session.get('auth')
   if (previous.auth?.userId !== user.id) await storage.session.clear()
   await storage.session.set({ syncSample: false, auth: { ...auth, userId: user.id } })
   await chrome.alarms.create('requested-imports', { periodInMinutes: 0.5 })
   respond({ ok: true })
   void pump()
  } catch { respond({ ok: false }) }
 })()
 return true
}
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
 externalRequests += 1
 let answered = false
 const reply = value => { if (!answered) { answered = true; externalRequests -= 1 }; respond(value) }
 void ready.then(() => {
  const pending = externalMessage(message, sender, reply)
  if (!pending && !answered) { answered = true; externalRequests -= 1 }
 }).catch(() => reply({ ok: false, error: 'Could not load extension settings.' }))
 return true
})
chrome.runtime.onMessage.addListener((message, sender, respond) => {
 if (message?.type !== 'AO3_LIBRARY_ENVIRONMENT' || !environments || sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('options.html')) return
 void (async () => {
  await ready
  if (message.action === 'select') {
   if (switching) throw new Error('An environment switch is already in progress.')
   switching = true
   try {
    if (running || previewRunning || externalRequests || bar.busy() || librarySync.busy() || (await storage.session.get('active')).active) throw new Error('Finish the current import, preview, or save before switching. Then retry.')
    // Check the scan directly: auth() intentionally returns null during a switch.
    const scan = await storage.local.get(['librarySync', 'sampleLibrarySync'])
    if ([scan.librarySync, scan.sampleLibrarySync].some(state => state?.status === 'running')) throw new Error('Pause the running scan before switching. Then retry.')
    await environments.select(message.environment)
    const profile = environments.current
    appOrigin = profile.appOrigin; backend = profile.backend; publicKey = profile.publicKey
    connectionVersion += 1; clearTimeout(nextJobTimer)
    await chrome.action.setBadgeText({ text: profile.id === 'local' ? 'LOCAL' : '' })
    respond({ ok: true })
    void chrome.tabs.query({ url: 'https://archiveofourown.org/*' }).then(tabs => Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'AO3_LIBRARY_ENVIRONMENT_CHANGED', environment: profile.id }))))
   } finally { switching = false }
  } else if (message.action === 'get') respond({ ok: true, current: environments.current.id, profiles: environments.list() })
  else throw new Error('Unknown environment action.')
 })().catch(error => respond({ ok: false, error: error.message }))
 return true
})
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'requested-imports') { void librarySync.pump(); void pump() } })
function checkRequestedTab(tabId) {
 void librarySync.pump()
 void storage.session.get('active').then(({ active }) => { if (active?.tabId === tabId) void pump() })
}
chrome.webNavigation.onDOMContentLoaded.addListener(({ tabId, frameId }) => {
 if (frameId === 0) checkRequestedTab(tabId)
}, { url: [{ schemes: ['https'], hostEquals: 'archiveofourown.org' }, { schemes: ['https'], hostEquals: 'web.archive.org' }] })
chrome.tabs.onUpdated.addListener((tabId, change) => {
 if (change.status === 'complete') checkRequestedTab(tabId)
})
chrome.action.onClicked.addListener(() => { if (environments) void chrome.runtime.openOptionsPage(); else void chrome.tabs.create({ url: `${appOrigin}/settings` }) })
// Recreate alarms if Chrome discarded them; credentials stay session-only.
void chrome.alarms.create('requested-imports', { periodInMinutes: 0.5 })

// Library checkpoints contain private notes; do not expose them to content scripts.
void chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
