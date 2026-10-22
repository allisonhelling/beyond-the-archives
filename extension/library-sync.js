import { captureListingPage, listingKey, listingUrl } from './listing.js'

// Durable state is separate from work-import leases and credentials. Never persist tokens here.
export function createLibrarySync({ auth, available, changed }) {
 let busy = false
 const read = async () => (await chrome.storage.local.get('librarySync')).librarySync
 const write = state => chrome.storage.local.set({ librarySync: state })
 const pageKey = (state, page) => `librarySync:${state.id}:${page}`
 async function owned() {
  const user = await auth(), state = await read()
  if (!user || user.expiresAt * 1000 <= Date.now()) throw new Error('Reconnect the extension in Settings.')
  if (state && state.userId !== user.userId) return { user, state: undefined }
  return { user, state }
 }
 async function discard(state) {
  if (!state) return
  await chrome.storage.local.remove(Array.from({ length: state.pages }, (_, i) => pageKey(state, i + 1)))
 }
 async function command(message) {
  const { user, state } = await owned()
  if (message.action === 'status') return { state: state ?? null }
  if (message.action === 'start') {
   if (state && ['running', 'paused', 'ready'].includes(state.status)) throw new Error('Finish or discard the saved scan first.')
   const identity = listingUrl(message.url, message.mode)
   const baselineKey = `libraryBaseline:${user.userId}:${identity.url}`
   const baseline = (await chrome.storage.local.get(baselineKey))[baselineKey] ?? []
   if (message.mode === 'quick' && !baseline.length) throw new Error('Complete and import a full scan of this list before Quick Sync.')
   await discard(await read())
   const next = { ...identity, id: crypto.randomUUID(), userId: user.userId, mode: message.mode, baselineKey, baseline,
    status: 'running', page: 1, pages: 0, count: 0, skipped: 0, tabId: null, nextAt: Date.now() + 15000, keys: [], error: '' }
   await write(next); changed(); return { state: next }
  }
  if (message.scanId && state?.id !== message.scanId) throw new Error('The saved scan changed in another tab. Refresh before continuing.')
  if (!state) return { state: null }
  if (message.action === 'page') {
   if (state.status !== 'ready' || !Number.isInteger(message.page) || message.page < 1 || message.page > state.pages) throw new Error('No completed page at that position.')
   const rows = (await chrome.storage.local.get(pageKey(state, message.page)))[pageKey(state, message.page)]
   if (!Array.isArray(rows)) throw new Error('Saved page is missing. Discard this scan and run a full scan again.')
   return { rows }
  }
  if (message.action === 'resume' && state.status === 'paused') {
   state.status = 'running'; state.error = ''; state.tabId = null; state.nextAt = Math.max(state.nextAt, Date.now() + 15000)
  } else if (message.action === 'pause' && state.status === 'running') state.status = 'paused'
  else if (message.action === 'discard') { await discard(state); state.status = 'discarded'; state.keys = []; state.baseline = [] }
  else if (message.action === 'finish' && state.status === 'ready') {
   await chrome.storage.local.set({ [state.baselineKey]: [...new Set([...state.baseline, ...state.keys])] })
   await discard(state); state.status = 'complete'; state.baseline = []; state.keys = []
  } else throw new Error('This action is unavailable for the saved scan.')
  await write(state); changed(); return { state }
 }
 async function pump() {
  if (busy) return
  busy = true
  let state
  try {
   const context = await owned(); state = context.state
   if (state?.status !== 'running' || !await available()) return
   if (state.tabId === null) {
    const gate = (await chrome.storage.session.get('ao3LastNavigation')).ao3LastNavigation ?? 0
    if (Date.now() < Math.max(state.nextAt, gate + 15000)) return
    const url = new URL(state.url); url.searchParams.set('page', String(state.page))
    const tab = await chrome.tabs.create({ url: url.href, active: false })
    state.tabId = tab.id; state.requestUrl = url.href; state.requestedAt = Date.now()
    state.nextAt = Date.now() + 15000 + Math.floor(Math.random() * 3000)
    await chrome.storage.session.set({ ao3RequestAfter: state.nextAt })
    await write(state); return
   }
   const tab = await chrome.tabs.get(state.tabId)
   if (tab.status !== 'complete') {
    if (Date.now() - state.requestedAt > 120000) throw new Error('Page load timed out. Check AO3, then resume.')
    return
   }
   if (tab.url !== state.requestUrl) throw new Error('AO3 redirected the scan. Complete sign-in in its tab, then resume.')
   if (!state.captured) {
    const result = (await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: captureListingPage, args: [state.kind] }))[0]?.result
    if (!result || result.error || result.url !== state.requestUrl) throw new Error(result?.error ?? 'AO3 page could not be captured. Check the tab and resume.')
    // Recheck session after async capture so disconnects cannot publish a page.
    if ((await auth())?.userId !== state.userId) return
    const keys = result.rows.map(listingKey)
    if (keys.some(key => !key)) throw new Error('Missing stable record identifier.')
    const known = new Set(state.baseline)
    const rows = state.mode === 'quick' ? result.rows.filter(row => !known.has(listingKey(row))) : result.rows
    await chrome.storage.local.set({ [pageKey(state, state.page)]: rows })
    state.keys.push(...keys); state.pages = state.page; state.count += rows.length; state.skipped += result.skipped
    state.captured = true
    state.done = !result.hasNext || state.mode === 'quick' && keys.some(key => known.has(key))
    if (!state.done && state.page >= 500) throw new Error('Reached the 500-page safety limit. The scan is incomplete; nothing has been imported.')
    await write(state)
   }
   if (state.done) { state.status = 'ready'; state.error = ''; await write(state); changed(); return }
   if (Date.now() < state.nextAt) return
   if (state.page >= 500) throw new Error('Reached the 500-page safety limit. Discard this incomplete scan.')
   const url = new URL(state.url); url.searchParams.set('page', String(state.page + 1))
   // Save the next position first. On a restart a mismatched URL pauses safely.
   state.page++; state.captured = false; state.requestUrl = url.href; state.requestedAt = Date.now()
   state.nextAt = Date.now() + 15000 + Math.floor(Math.random() * 3000)
   await write(state)
   await chrome.storage.session.set({ ao3RequestAfter: state.nextAt })
   await chrome.tabs.update(state.tabId, { url: url.href })
  } catch (error) {
   if (state?.status === 'running') { state.status = 'paused'; state.error = error.message; await write(state) }
  } finally { busy = false }
 }
 return { async command(message) {
  const mutation = !['status', 'page'].includes(message.action)
  if (mutation && busy) throw new Error('A page is being saved. Retry shortly.')
  if (mutation) busy = true
  try {
   const result = await command(message)
   if (result.state) {
    const { id, status, url, mode, pages, count, skipped, error } = result.state
    return { state: { id, status, url, mode, pages, count, skipped, error } }
   }
   return result
  } finally { if (mutation) busy = false }
 }, pump, async blocksImports() { const state = await read(); return state?.status === 'running' && state.userId === (await auth())?.userId } }
}
