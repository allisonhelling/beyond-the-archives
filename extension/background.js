import { parseSeriesUrl, parseWorkUrl } from '../src/features/imports/urls.ts'
import { captureMetadataPage } from './capture.js'

const appOrigin = __APP_ORIGIN__
const backend = __SUPABASE_URL__
const publicKey = __SUPABASE_KEY__
let running = false
let rerun = false
let connectionVersion = 0
const nextJobDelayMs = 3000
let nextJobTimer

async function api(auth, path, body) {
 const response = await fetch(`${backend}${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { apikey: publicKey, Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  signal: AbortSignal.timeout(20000),
 })
 if (response.status === 401 || response.status === 403) {
  const current = await chrome.storage.session.get('auth')
  if (current.auth?.token === auth.token) await chrome.storage.session.clear()
  await chrome.action.setBadgeText({ text: 'AUTH' })
  throw new Error('Reconnect in library Settings.')
 }
 if (!response.ok) throw new Error('Library request failed.')
 return response.json()
}
function matchingWork(url, workId) {
 try { return parseWorkUrl(url).workId === workId && new URL(url).origin === 'https://archiveofourown.org' }
 catch { return false }
}
async function pump() {
 if (running) { rerun = true; return }
 clearTimeout(nextJobTimer)
 running = true
 const version = connectionVersion
 let completed = false
 try {
  const state = await chrome.storage.session.get(['auth', 'active'])
  if (version !== connectionVersion) return
  const auth = state.auth
  if (!auth) return
  if (auth.expiresAt * 1000 <= Date.now()) {
   await chrome.storage.session.clear()
   await chrome.action.setBadgeText({ text: 'AUTH' })
   return
  }
  let active = state.active
  if (!active) {
   const job = await api(auth, '/rest/v1/rpc/claim_extension_job', {})
   if (version !== connectionVersion) return
   if (!job) { await chrome.action.setBadgeText({ text: '' }); return }
   active = { ...job, tabId: null }
   await chrome.storage.session.set({ active })
  }
  const payload = { jobId: active.id, token: active.token }
  if (Date.now() >= Date.parse(active.expiresAt) - 45000) {
   // Finish before the server lease expires. Expired/cancelled results are fenced.
   try { await api(auth, '/functions/v1/extension-metadata', { ...payload, timedOut: true }) }
   finally { await chrome.storage.session.remove('active') }
   return
  }
  let tab
  if (active.tabId !== null) {
   try { tab = await chrome.tabs.get(active.tabId) }
   catch {
    await api(auth, '/functions/v1/extension-metadata', { ...payload, timedOut: true })
    await chrome.storage.session.remove('active')
    return
   }
  } else {
   const tabs = await chrome.tabs.query({ url: 'https://archiveofourown.org/*' })
   if (version !== connectionVersion) return
   tab = tabs.find(candidate => matchingWork(candidate.url, active.workId))
   if (!tab) tab = await chrome.tabs.create({ url: `https://archiveofourown.org/works/${active.workId}`, active: false })
   active.tabId = tab.id
   await chrome.storage.session.set({ active })
  }
  await chrome.action.setBadgeText({ text: 'WAIT' })
  if (!matchingWork(tab.url, active.workId)) return
  const jobs = await api(auth, `/rest/v1/metadata_jobs?id=eq.${encodeURIComponent(active.id)}&select=status,lease_token`)
  if (jobs[0]?.status !== 'processing' || jobs[0]?.lease_token !== active.token) {
   await chrome.storage.session.remove('active')
   return
  }
  const latest = await chrome.storage.session.get(['auth', 'active'])
  if (version !== connectionVersion || latest.auth?.userId !== auth.userId || latest.active?.token !== active.token) return
  // No content script runs on ordinary visits. Injection requires a claimed job.
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureMetadataPage, injectImmediately: true, args: [tab.status !== 'complete'] })
  const page = results[0]?.result
  if (version !== connectionVersion || !page || !matchingWork(page.url, active.workId)) return
  const result = await api(auth, '/functions/v1/extension-metadata', { ...payload, ...page })
  if (result.committed) {
   await chrome.storage.session.remove('active')
   await chrome.action.setBadgeText({ text: 'OK' })
   completed = true
  }
 } catch {
  // Session storage and the server lease survive worker suspension and outages.
  const current = await chrome.storage.session.get('auth')
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
async function previewSeries(url) {
 if (previewRunning) throw new Error('Another series preview is loading. Retry shortly.')
 previewRunning = true
 try {
  const identity = parseSeriesUrl(url)
  const version = connectionVersion
  const { auth } = await chrome.storage.session.get('auth')
  if (!auth || auth.expiresAt * 1000 <= Date.now()) throw new Error('Reconnect the extension in Settings, then retry.')
  const matches = candidate => {
   try { return new URL(candidate).origin === 'https://archiveofourown.org' && parseSeriesUrl(candidate).seriesId === identity.seriesId } catch { return false }
  }
  const tabs = await chrome.tabs.query({ url: 'https://archiveofourown.org/*' })
  if (version !== connectionVersion) throw new Error('Extension connection changed. Retry the preview.')
  const tab = tabs.find(candidate => matches(candidate.url)) ?? await chrome.tabs.create({ url: identity.normalizedUrl, active: false })
  for (let attempt = 0; attempt < 120; attempt++) {
   if (version !== connectionVersion) throw new Error('Extension connection changed. Retry the preview.')
   const current = await chrome.tabs.get(tab.id)
   if (current.status === 'complete' && matches(current.url)) {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureMetadataPage, args: [false, 'series'] })
    const page = results[0]?.result
    if (version !== connectionVersion) throw new Error('Extension connection changed. Retry the preview.')
    if (page && matches(page.url)) return page
   }
   await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Series preview timed out. Complete AO3 sign-in or confirmation in its tab, then retry, or skip this series.')
 } finally { previewRunning = false }
}

chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
 let trusted = false
 try { trusted = new URL(sender.url).origin === appOrigin && !sender.id } catch { /* No trusted website sender. */ }
 if (!trusted) return
 if (message?.type === 'AO3_LIBRARY_PREVIEW_SERIES') {
  void previewSeries(message.url).then(page => respond({ ok: true, page })).catch(error => respond({ ok: false, error: error.message }))
  return true
 }
 if (message?.type === 'AO3_LIBRARY_DISCONNECT') {
  connectionVersion += 1
  clearTimeout(nextJobTimer)
  void chrome.storage.session.clear().then(() => chrome.action.setBadgeText({ text: '' })).then(() => respond({ ok: true }))
  return true
 }
 if (message?.type !== 'AO3_LIBRARY_CONNECT' || typeof message.token !== 'string' || !Number.isFinite(message.expiresAt)) return
 const version = ++connectionVersion
 void (async () => {
  try {
   const auth = { token: message.token, expiresAt: message.expiresAt }
   const user = await api(auth, '/auth/v1/user')
   if (version !== connectionVersion) { respond({ ok: false }); return }
   const previous = await chrome.storage.session.get('auth')
   if (previous.auth?.userId !== user.id) await chrome.storage.session.clear()
   await chrome.storage.session.set({ auth: { ...auth, userId: user.id } })
   await chrome.alarms.create('requested-imports', { periodInMinutes: 0.5 })
   respond({ ok: true })
   void pump()
  } catch { respond({ ok: false }) }
 })()
 return true
})
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'requested-imports') void pump() })
function checkRequestedTab(tabId) {
 void chrome.storage.session.get('active').then(({ active }) => { if (active?.tabId === tabId) void pump() })
}
chrome.webNavigation.onDOMContentLoaded.addListener(({ tabId, frameId }) => {
 if (frameId === 0) checkRequestedTab(tabId)
}, { url: [{ schemes: ['https'], hostEquals: 'archiveofourown.org' }] })
chrome.tabs.onUpdated.addListener((tabId, change) => {
 if (change.status === 'complete') checkRequestedTab(tabId)
})
chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: `${appOrigin}/settings` }) })
// Recreate alarms if Chrome discarded them; credentials stay session-only.
void chrome.alarms.create('requested-imports', { periodInMinutes: 0.5 })
