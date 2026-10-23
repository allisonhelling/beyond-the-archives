import { captureListingPage, listingKey, listingUrl } from './listing.js'

// Durable state is separate from work-import leases and credentials. Never persist tokens here.
export function createLibrarySync({ auth, available, changed }) {
 let busy = false
 const stateKey = sample => sample ? 'sampleLibrarySync' : 'librarySync'
 const read = async () => { const key = stateKey((await auth())?.sample); return (await chrome.storage.local.get(key))[key] }
 const write = state => chrome.storage.local.set({ [stateKey(state.sample)]: state })
 const delayMs = state => (state.delaySeconds ?? 15) * 1000
 function requestDelay(value = 15) {
  if (!Number.isInteger(value) || value < 5 || value > 3600) throw new Error('Enter a request interval from 5 to 3,600 whole seconds.')
  return value
 }
 const pageKey = (state, page) => `librarySync:${state.id}:${page}`
 async function owned() {
  const user = await auth(), state = await read()
  if (!user || user.expiresAt * 1000 <= Date.now()) throw new Error('Reconnect the extension in Settings.')
  if (state && state.startPage === undefined) { state.startPage = 1; if (state.limited) state.endPage = state.maxPages }
  if (state && state.userId !== user.userId) return { user, state: undefined }
  return { user, state }
 }
 async function discard(state) {
  if (!state) return
  await chrome.storage.local.remove(Array.from({ length: state.pages }, (_, i) => pageKey(state, (state.startPage ?? 1) + i)))
 }
 async function command(message) {
  const { user, state } = await owned()
  if (message.action === 'status') return { state: state ?? null }
  if (message.action === 'start') {
   if (state && ['running', 'paused', 'ready'].includes(state.status)) throw new Error('Finish or discard the saved scan first.')
   const startPage = message.startPage ?? 1, endPage = message.endPage
   if (message.maxPages !== undefined) throw new Error('Use Start page and End page instead of a page limit.')
   if (!Number.isInteger(startPage) || startPage < 1 || startPage > 500 || endPage !== undefined && (!Number.isInteger(endPage) || endPage < startPage || endPage > 500)) throw new Error('Enter whole page numbers from 1 to 500, with End page at or after Start page.')
   const limited = startPage > 1 || endPage !== undefined
   if (message.mode === 'quick' && limited) throw new Error('Quick Sync must start at page 1 with no End page. Use a full scan for page ranges.')
   const delaySeconds = requestDelay(message.delaySeconds)
   const identity = listingUrl(message.url, message.mode)
   const baselineKey = `libraryBaseline:${user.userId}:${identity.url}`
   const baseline = (await chrome.storage.local.get(baselineKey))[baselineKey] ?? []
   if (message.mode === 'quick' && !baseline.length) throw new Error('Complete and import a full scan of this list before Quick Sync.')
   await discard(await read())
   const next = { ...identity, id: crypto.randomUUID(), userId: user.userId, mode: message.mode, baselineKey, baseline,
    startPage, endPage, delaySeconds, sample: Boolean(user.sample), limited, partial: false, status: 'running', page: startPage, pages: 0, count: 0, skipped: 0, tabId: null, nextAt: Date.now() + delaySeconds * 1000, keys: [], error: '' }
   await write(next); changed(); return { state: next }
  }
  if (message.scanId && state?.id !== message.scanId) throw new Error('The saved scan changed in another tab. Refresh before continuing.')
  if (!state) return { state: null }
  if (message.action === 'open-tab') {
   if (state.tabId === null) throw new Error('No scan tab is available yet. Start or resume the scan first.')
   let tab
   try { tab = await chrome.tabs.get(state.tabId) } catch { throw new Error('The scan tab was closed. Return to Library Sync and resume the scan to open it again.') }
   await chrome.tabs.update(state.tabId, { active: true })
   await chrome.windows.update(tab.windowId, { focused: true })
   return { state }
  }
  if (message.action === 'set-delay') {
   state.delaySeconds = requestDelay(message.delaySeconds)
   state.nextAt = Math.max(Date.now(), (state.requestedAt ?? Date.now()) + delayMs(state))
   await chrome.storage.session.set({ ao3RequestAfter: state.nextAt })
   await write(state); changed(); return { state }
  }
  if (message.action === 'page') {
   if (state.status !== 'ready' || !Number.isInteger(message.page) || message.page < (state.startPage ?? 1) || message.page >= (state.startPage ?? 1) + state.pages) throw new Error('No completed page at that position.')
   const rows = (await chrome.storage.local.get(pageKey(state, message.page)))[pageKey(state, message.page)]
   if (!Array.isArray(rows)) throw new Error('Saved page is missing. Discard this scan and run a full scan again.')
   return { rows }
  }
  if (message.action === 'resume' && state.status === 'paused') {
   if (message.delaySeconds !== undefined) state.delaySeconds = requestDelay(message.delaySeconds)
   state.status = 'running'; state.error = ''; state.attention = undefined; state.retryNavigation = true; state.nextAt = Math.max(state.nextAt, Date.now() + delayMs(state))
  } else if (message.action === 'pause' && state.status === 'running') state.status = 'paused'
  else if (message.action === 'discard') { await discard(state); state.status = 'discarded'; state.keys = []; state.baseline = [] }
  else if (message.action === 'finish' && state.status === 'ready') {
   // Partial scans must not establish or advance a complete-list baseline.
   if (!state.limited) await chrome.storage.local.set({ [state.baselineKey]: [...new Set([...state.baseline, ...state.keys])] })
   await discard(state); state.status = 'complete'; state.baseline = []; state.keys = []
  } else throw new Error('This action is unavailable for the saved scan.')
  await write(state); changed(); return { state }
 }
 async function navigate(state, url) {
  state.requestUrl = url; state.requestedAt = Date.now()
  state.nextAt = Date.now() + delayMs(state) + Math.floor(Math.random() * 3000)
  await chrome.storage.session.set({ ao3RequestAfter: state.nextAt })
  if (state.tabId === null) {
   state.tabId = (await chrome.tabs.create({ url, active: false })).id
   await write(state)
  } else {
   // Persist before navigation; mismatches after suspension pause safely.
   await write(state)
   await chrome.tabs.update(state.tabId, { url })
  }
 }
 async function pump() {
  if (busy) return
  busy = true
  let state
  try {
   const context = await owned(); state = context.state
   if (state?.status !== 'running' || !await available()) return
   if (state.retryNavigation) {
    const gate = (await chrome.storage.session.get('ao3LastNavigation')).ao3LastNavigation ?? 0
    if (Date.now() < Math.max(state.nextAt, gate + delayMs(state))) return
    try { if (state.tabId !== null) await chrome.tabs.get(state.tabId) } catch { state.tabId = null }
    state.retryNavigation = false
    const url = new URL(state.url); url.searchParams.set('page', String(state.page))
    await navigate(state, url.href); return
   }
   if (state.tabId === null) {
    const gate = (await chrome.storage.session.get('ao3LastNavigation')).ao3LastNavigation ?? 0
    if (Date.now() < Math.max(state.nextAt, gate + delayMs(state))) return
    const url = new URL(state.url); url.searchParams.set('page', String(state.page))
    await navigate(state, url.href); return
   }
   const tab = await chrome.tabs.get(state.tabId)
   if (tab.status !== 'complete') {
    if (Date.now() - state.requestedAt > 120000) throw new Error('Page load timed out. Check AO3, then resume.')
    return
   }
   if (tab.url !== state.requestUrl) {
    state.attention = /\/users\/login(?:[/?#]|$)/.test(tab.url ?? '') ? 'login' : 'page_error'
    throw new Error('AO3 redirected the scan. Complete sign-in or confirmation in its tab, then resume.')
   }
   if (!state.captured) {
    const result = (await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: captureListingPage, args: [state.kind] }))[0]?.result
    if (!result || result.error || result.url !== state.requestUrl) {
     state.attention = result?.attention ?? 'page_error'
     throw new Error(result?.error ?? 'AO3 page could not be captured. Check the tab and resume.')
    }
    // Recheck session after async capture so disconnects cannot publish a page.
    if ((await auth())?.userId !== state.userId) return
    const keys = result.rows.map(listingKey)
    if (keys.some(key => !key)) throw new Error('Missing stable record identifier.')
    const known = new Set(state.baseline)
    // Keep observed existing rows for metadata refresh, while still stopping on overlap.
    const rows = result.rows
    await chrome.storage.local.set({ [pageKey(state, state.page)]: rows })
    state.keys.push(...keys); state.pages = state.page - (state.startPage ?? 1) + 1; state.count += rows.length; state.skipped += result.skipped
    state.captured = true
    state.done = !result.hasNext || state.mode === 'quick' && keys.some(key => known.has(key))
    if (!state.done && state.limited && state.page >= (state.endPage ?? state.maxPages ?? Infinity)) { state.partial = true; state.done = true }
    if (!state.done && state.page >= 500) throw new Error('Reached the 500-page safety limit. The scan is incomplete; nothing has been imported.')
    await write(state)
   }
   if (state.done) { state.status = 'ready'; state.error = ''; await write(state); changed(); return }
   if (Date.now() < state.nextAt) return
   if (state.page >= 500) throw new Error('Reached the 500-page safety limit. Discard this incomplete scan.')
   const url = new URL(state.url); url.searchParams.set('page', String(state.page + 1))
   state.page++; state.captured = false
   await navigate(state, url.href)
  } catch (error) {
   if (state?.status === 'running') { state.status = 'paused'; state.error = error.message; state.attention ??= 'page_error'; state.attentionId = crypto.randomUUID(); await write(state) }
  } finally { busy = false }
 }
 return { async command(message) {
  const mutation = !['status', 'page'].includes(message.action)
  if (mutation && busy) throw new Error('A page is being saved. Retry shortly.')
  if (mutation) busy = true
  try {
   const result = await command(message)
   if (result.state) {
    const { id, status, url, mode, pages, count, skipped, error, startPage, endPage, limited, partial, delaySeconds, attention, attentionId } = result.state
    return { state: { id, status, url, mode, pages, count, skipped, error, startPage, endPage, limited, partial, delaySeconds, attention, attentionId } }
   }
   return result
  } finally { if (mutation) busy = false }
 }, pump, async blocksImports() { const state = await read(); return state?.status === 'running' && state.userId === (await auth())?.userId } }
}
