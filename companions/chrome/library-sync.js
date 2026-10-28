import { isLibrarySyncSafetyLimit, librarySyncSafetyLimitError, mergeLibrarySyncRepairs } from '../../src/features/imports/library-sync-state.ts'
import { parseSeries } from '../../src/features/imports/ao3-series.ts'
import { captureMetadataPage } from './capture.js'
import { parseChapterDates } from '../../src/features/imports/chapter-dates.ts'
import { readAo3Rows, bookmarkReadingState, scraperDate } from '../../src/features/imports/ao3-csv.ts'
import { captureListingPage, listingKey, listingUrl, sameScanUrl } from './listing.js'

// Durable state is separate from work-import leases and credentials. Never persist tokens here.
export function createLibrarySync({ auth, available, changed, schedule = () => {}, storage = chrome.storage }) {
 let busy = false
 let endingScanId = null
 let idle = Promise.resolve(), releaseIdle = () => {}
 function lock() { busy = true; idle = new Promise(resolve => { releaseIdle = resolve }) }
 function unlock() { busy = false; releaseIdle() }
 const stateKey = sample => sample ? 'sampleLibrarySync' : 'librarySync'
 const read = async () => { const key = stateKey((await auth())?.sample); return (await storage.local.get(key))[key] }
 const write = state => storage.local.set({ [stateKey(state.sample)]: state })
 const delayMs = state => (state.delaySeconds ?? 15) * 1000
 function requestDelay(value = 15) {
  if (!Number.isInteger(value) || value < 5 || value > 3600) throw new Error('Enter a request interval from 5 to 3,600 whole seconds.')
  return value
 }
 const pageKey = (state, page) => `librarySync:${state.id}:${page}`
 function pendingPageUrl(state) {
  const url = new URL(state.chapterRequest ? `https://archiveofourown.org/works/${state.chapterRequest.workId}/navigate` : state.currentUrl ?? state.url)
  if (!state.chapterRequest) url.searchParams.set('page', String(state.page))
  return url.href
 }
 async function owned() {
  const user = await auth(), state = await read()
  if (!user || user.expiresAt * 1000 <= Date.now()) throw new Error('Reconnect the extension in Settings.')
  if (state && state.startPage === undefined) { state.startPage = 1; if (state.limited) state.endPage = state.maxPages }
  if (state && state.userId !== user.userId) return { user, state: undefined }
  // Older scans already distinguish series checkpoints by seriesUrl. Recover
  // their primary-list count without changing checkpoint numbering or contents.
  if (state && state.listPages === undefined && ['running', 'paused', 'ready'].includes(state.status)) {
   const keys = Array.from({ length: state.pages }, (_, i) => pageKey(state, (state.startPage ?? 1) + i))
   const saved = await storage.local.get(keys)
   if (keys.every(key => saved[key] !== undefined)) state.listPages = keys.filter(key => !saved[key]?.seriesUrl).length
  }
  return { user, state }
 }
 async function discard(state) {
  if (!state) return
  await storage.local.remove(Array.from({ length: state.pages }, (_, i) => pageKey(state, (state.startPage ?? 1) + i)))
 }
 async function command(message) {
  const { user, state } = await owned()
  if (message.action === 'status') return { state: state ?? null }
  if (message.action === 'start') {
   if (state && ['running', 'paused', 'ready'].includes(state.status)) throw new Error('Finish or discard the saved scan first.')
   if (message.reviewRelatedSeries !== undefined && typeof message.reviewRelatedSeries !== 'boolean') throw new Error('Choose whether to check related series.')
   if (message.seriesBehavior !== undefined && !['choose', 'all'].includes(message.seriesBehavior)) throw new Error('Choose a valid series import behavior.')
   const startPage = message.startPage ?? 1, endPage = message.endPage
   if (message.maxPages !== undefined) throw new Error('Use Start page and End page instead of a page limit.')
   if (!Number.isSafeInteger(startPage) || startPage < 1 || endPage !== undefined && (!Number.isSafeInteger(endPage) || endPage < startPage)) throw new Error('Enter positive whole page numbers, with End page at or after Start page.')
   const limited = startPage > 1 || endPage !== undefined
   if (message.mode === 'quick' && limited) throw new Error('Quick Sync must start at page 1 with no End page. Use a full scan for page ranges.')
   if (message.reviewExisting && message.mode !== 'full') throw new Error('Review Existing Entries requires Full Scan.')
   const delaySeconds = requestDelay(message.delaySeconds)
   const identity = listingUrl(message.url, message.mode)
   if ((identity.collectionUrl || identity.kind === 'series') && limited) throw new Error('Page ranges are available for individual work or bookmark lists. Clear the range to scan a collection or series list.')
   const baselineKey = `libraryBaseline:${user.userId}:${identity.url}`
   const baseline = (await storage.local.get(baselineKey))[baselineKey] ?? []
   if (message.mode === 'quick' && !baseline.length) throw new Error('Complete and import a full scan of this list before Quick Sync.')
   await discard(await read())
   const sources = identity.collectionUrl && (identity.kind === 'collection' || message.importToCollection) ? [
    ...(message.importToCollection ? [{ url: `${identity.collectionUrl}/profile`, kind: 'collection_profile' }] : []),
    { url: `${identity.collectionUrl}/works`, kind: 'works' }, { url: `${identity.collectionUrl}/bookmarks`, kind: 'bookmarks' },
   ] : [{ url: identity.url, kind: identity.kind }]
   if (sources.length > 1 && new URL(message.url).search) throw new Error('Use an unfiltered collection URL to scan both Works and Bookmarks.')
   const first = sources.shift()
   const next = { ...identity, currentUrl: first.url, kind: first.kind, sources, seenSeries: [], seriesBookmarkDates: {}, bookmarkedWorkIds: [], ...([first, ...sources].some(source => source.kind === 'bookmarks') ? { bookmarkedSeries: [] } : {}), seriesReviewVersion: 1, reviewRelatedSeries: Boolean(message.reviewRelatedSeries), seriesBehavior: message.seriesBehavior ?? 'choose', importToCollection: Boolean(identity.collectionUrl && message.importToCollection), autoImport: Boolean(message.autoImport), checkChapterDates: Boolean(message.checkChapterDates), chapterDatesChecked: 0, chapterDatesUnavailable: 0, readingStatus: message.readingStatus, id: crypto.randomUUID(), userId: user.userId, mode: message.mode, baselineKey, baseline,
    batchStart: 0, hasMore: false, startPage, endPage, delaySeconds, sample: Boolean(user.sample), limited, partial: false, status: 'running', page: startPage, pages: 0, listPages: 0, count: 0, skipped: 0, diagnosticsVersion: 1, skippedEntries: [], chapterDateIssues: [], tabId: null, nextAt: Date.now(), keys: [], error: '' }
   next.readingStatusOrigin = message.readingStatusOrigin === 'default' ? 'default' : 'manual'; next.reviewExisting = Boolean(message.reviewExisting); next.repairPages = {}
   await write(next); return { state: next }
  }
  if (message.scanId && state?.id !== message.scanId) throw new Error('The saved scan changed in another tab. Refresh before continuing.')
  if (!state) return { state: null }
  if (message.action === 'end') {
   if (state.endedEarly) return { state }
   if (!['running', 'paused', 'ready'].includes(state.status)) throw new Error('This scan has already ended.')
   // End only primary-list discovery. Drain the same dependent series and
   // chapter-date work that a natural end of the list would still require.
   const remaining = (state.sources ?? []).filter(source => source.kind !== 'series_works')
   if (state.kind !== 'series_works' && !state.done) remaining.unshift({ url: state.currentUrl ?? state.url, kind: state.kind, page: state.page + (state.captured ? 1 : 0) })
   state.continuation = remaining.length ? remaining : undefined
   state.canContinue = Boolean(state.continuation?.length)
   state.endedEarly = true; state.partial = true; state.hasMore = false
   state.sources = (state.sources ?? []).filter(source => source.kind === 'series_works')
   if (state.kind !== 'series_works') { state.captured = true; state.done = true }
   state.retryNavigation = Boolean((state.chapterRequest || !state.captured) && (state.retryNavigation || state.status === 'paused' || !sameScanUrl(state.requestUrl, pendingPageUrl(state))))
   if (state.status === 'paused') state.nextAt = Math.max(state.nextAt, Date.now() + delayMs(state))
   state.status = state.chapterRequest || state.chapterQueue?.length || state.sources.length || !state.captured || !state.done ? 'running' : 'ready'
   state.error = ''; state.attention = undefined; state.attentionId = undefined
   await write(state); return { state }
  }
  if (message.action === 'continue') {
   if (!['ready', 'complete'].includes(state.status) || !state.endedEarly || !state.continuation?.length) throw new Error('Wait for the ended scan to finish before continuing.')
   const [source, ...sources] = state.continuation
   state.currentUrl = source.url; state.kind = source.kind; state.page = source.page ?? 1; state.sources = sources
   if (state.status === 'complete') state.batchStart = state.pages
   state.hasMore = false; state.captured = false; state.done = false
   state.endedEarly = false; state.partial = Boolean(state.limited); state.canContinue = false; state.continuation = undefined
   state.status = 'running'; state.retryNavigation = true; state.error = ''; state.attention = undefined; state.attentionId = undefined
   if (message.delaySeconds !== undefined) state.delaySeconds = requestDelay(message.delaySeconds)
   state.nextAt = Math.max(state.nextAt, Date.now() + delayMs(state))
   await write(state); return { state }
  }
  if (message.action === 'record-repairs') {
   if (state.status !== 'ready' || !Number.isSafeInteger(message.page) || message.page < (state.startPage ?? 1) || message.page >= (state.startPage ?? 1) + state.pages) throw new Error('Invalid repair page.')
   const counts = message.repairs
   if (!counts || ['metadata', 'series', 'reading'].some(key => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) throw new Error('Invalid repair summary.')
   if (counts.ids && ['metadata', 'series', 'reading'].some(key => !Array.isArray(counts.ids[key]) || counts.ids[key].length > 2000 || counts.ids[key].some(id => typeof id !== 'string' || id.length > 128))) throw new Error('Invalid repair identities.')
   const previous = state.repairPages?.[message.page]
   state.repairPages ??= {}
   state.repairPages[message.page] = mergeLibrarySyncRepairs(previous, counts)
   await write(state); return { state }
  }
  if (message.action === 'prepare-batch') {
   if (state.status !== 'paused' || !isLibrarySyncSafetyLimit(state) || !state.pages) throw new Error('No saved batch is available.')
   // Old safety-limit checkpoints may still need chapter dates for their final page.
   state.hasMore = true; state.batchStart ??= 0
   state.status = state.chapterQueue?.length || state.chapterRequest ? 'running' : 'ready'
   state.error = ''; state.attention = undefined; state.attentionId = undefined
   await write(state); return { state }
  }
  if (message.action === 'finish-batch') {
   if (state.status !== 'ready' || !state.hasMore || message.batchStart !== (state.batchStart ?? 0) || message.batchEnd !== state.pages) throw new Error('The saved batch changed. Refresh before continuing.')
   const previous = state.batchStart ?? 0
   state.batchStart = state.pages; state.hasMore = false; state.status = 'running'
   state.error = ''; state.attention = undefined; state.attentionId = undefined
   // Acknowledge durably before cleanup. A restart must never replay this batch.
   await write(state)
   await storage.local.remove(Array.from({ length: state.pages - previous }, (_, i) => pageKey(state, (state.startPage ?? 1) + previous + i)))
   return { state }
  }
  if (message.action === 'set-collection') {
   if (state.status !== 'ready' || !state.importToCollection || typeof message.collectionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(message.collectionId)) throw new Error('Collection assignment unavailable.')
   state.collectionId = message.collectionId
   await write(state); return { state }
  }
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
   await storage.session.set({ ao3RequestAfter: state.nextAt })
   await write(state); return { state }
  }
  if (message.action === 'page') {
   if (state.status !== 'ready' || !Number.isInteger(message.page) || message.page < (state.startPage ?? 1) + (state.batchStart ?? 0) || message.page >= (state.startPage ?? 1) + state.pages) throw new Error('No completed page at that position.')
   const saved = (await storage.local.get(pageKey(state, message.page)))[pageKey(state, message.page)]
   const rows = Array.isArray(saved) ? saved : saved?.rows
   if (!Array.isArray(rows)) throw new Error('Saved page is missing. Discard this scan and run a full scan again.')
   return { rows, ...(saved?.seriesUrl ? { seriesUrl: saved.seriesUrl, ...(saved.seriesPreview ? { seriesPreview: saved.seriesPreview } : {}) } : {}) }
  }
  if (message.action === 'resume' && state.status === 'paused') {
   if (isLibrarySyncSafetyLimit(state)) throw new Error(librarySyncSafetyLimitError)
   if (message.delaySeconds !== undefined) state.delaySeconds = requestDelay(message.delaySeconds)
   state.status = 'running'; state.error = ''; state.attention = undefined; state.retryNavigation = true; state.nextAt = Math.max(state.nextAt, Date.now() + delayMs(state))
  } else if (message.action === 'pause' && state.status === 'running') state.status = 'paused'
  else if (message.action === 'discard') {
   await discard(state)
   state.status = 'discarded'; state.keys = []; state.baseline = []; state.canContinue = false; state.continuation = undefined
   state.error = ''; state.attention = undefined; state.attentionId = undefined
  } else if (message.action === 'finish' && state.status === 'ready' && !state.hasMore) {
   // Partial scans must not establish or advance a complete-list baseline.
   if (!state.limited && !state.endedEarly) await storage.local.set({ [state.baselineKey]: [...new Set([...state.baseline, ...state.keys])] })
   await discard(state); state.status = 'complete'; if (!state.canContinue) { state.baseline = []; state.keys = [] }
  } else throw new Error('This action is unavailable for the saved scan.')
  await write(state); return { state }
 }
 async function navigate(state, url) {
  if (endingScanId === state.id) { await write(state); return }
  try { if (state.tabId !== null) await chrome.tabs.get(state.tabId) } catch { state.tabId = null }
  state.retryNavigation = false
  state.requestUrl = url; state.requestedAt = Date.now()
  state.nextAt = Date.now() + delayMs(state) + Math.floor(Math.random() * 3000)
  await storage.session.set({ ao3RequestAfter: state.nextAt })
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
  lock()
  let state
  try {
   const context = await owned(); state = context.state
   if (state?.status !== 'running' || !await available()) return
   const capturePending = !state.captured || Boolean(state.chapterRequest)
   if (capturePending && (state.retryNavigation || state.tabId === null)) {
    const gates = await storage.session.get(['ao3LastNavigation', 'ao3RequestAfter'])
    const nextAt = Math.max(state.nextAt, (gates.ao3LastNavigation ?? 0) + delayMs(state), gates.ao3RequestAfter ?? 0)
    if (Date.now() < nextAt) { state.nextAt = nextAt; return }
    await navigate(state, pendingPageUrl(state)); return
   }
   if (!state.chapterRequest && state.chapterQueue?.length) {
    if (Date.now() < state.nextAt) return
    state.chapterRequest = state.chapterQueue[0]
    await navigate(state, `https://archiveofourown.org/works/${state.chapterRequest.workId}/navigate`); return
   }
   if (capturePending) {
    const tab = await chrome.tabs.get(state.tabId)
    if (!sameScanUrl(tab.url, state.requestUrl)) {
     // Chrome may still report the previous URL while the requested document starts.
     if (tab.status !== 'complete') {
      if (Date.now() - state.requestedAt > 120000) throw new Error('Page load timed out. Check AO3, then resume.')
      return
     }
     state.attention = /\/users\/login(?:[/?#]|$)/.test(tab.url ?? '') ? 'login' : 'page_error'
     throw new Error('AO3 redirected the scan. Complete sign-in or confirmation in its tab, then resume.')
    }
   }
   if (state.chapterRequest) {
    const request = state.chapterRequest
    const result = (await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: captureMetadataPage, injectImmediately: true, args: [false, 'navigation'] }))[0]?.result
    if (!result || !sameScanUrl(result.url, state.requestUrl)) {
     const problem = (await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: captureListingPage, injectImmediately: true, args: ['chapter_dates'] }))[0]?.result
     if (!problem || problem.pending && sameScanUrl(problem.url, state.requestUrl)) {
      if (Date.now() - state.requestedAt > 120000) throw new Error('Page load timed out. Check AO3, then resume.')
      return
     }
     state.attention = problem.attention ?? 'page_error'
     throw new Error(problem.error ?? 'Chapter Index could not be read. Check the scan tab and resume.')
    }
    if ((await auth())?.userId !== state.userId) return
    let dates = {}, reason = result.notFound ? 'AO3 reported that this work or chapter index was unavailable.' : ''
    try { if (!result.notFound) dates = parseChapterDates(result.html, request.workId, request.published) } catch { reason = 'The chapter index contained ambiguous release dates.' }
    const complete = Object.keys(dates).length === request.published
    if (complete) {
     const key = pageKey(state, request.page), saved = (await storage.local.get(key))[key]
     if (!saved?.rows?.[request.row]) throw new Error('The saved listing page is missing. Discard this scan and retry.')
     saved.rows[request.row]['chapter dates'] = JSON.stringify(dates)
     await storage.local.set({ [key]: saved })
    } else {
     state.chapterDatesUnavailable++
     state.chapterDateIssues ??= []
     state.chapterDateIssues.push({ workId: request.workId, title: request.title || `AO3 Work ${request.workId}`, url: `https://archiveofourown.org/works/${request.workId}`,
      sourceUrl: state.requestUrl, expectedChapters: request.published, foundChapters: Object.keys(dates).length,
      reason: reason || `Release dates were available for ${Object.keys(dates).length} of ${request.published} published chapters.` })
    }
    state.chapterDatesChecked++; state.chapterQueue.shift(); state.chapterRequest = null
    await write(state); changed(); return
   }
   if (!state.captured) {
    const result = (await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: captureListingPage, injectImmediately: true, args: [state.kind] }))[0]?.result
    // Tab completion and the injected document can briefly disagree during navigation.
    // Wait for this document without requesting the page again or reporting a login failure.
    if (!result || result.pending && sameScanUrl(result.url, state.requestUrl)) {
     if (Date.now() - state.requestedAt > 120000) throw new Error(!result ? 'The extension received no capture from the AO3 listing. Check the extension’s service worker errors, then resume.' : 'Page load timed out. Check AO3, then resume.')
     return
    }
    if (!result || result.error || !sameScanUrl(result.url, state.requestUrl)) {
     state.attention = result?.attention ?? 'page_error'
     throw new Error(result?.error ?? 'AO3 page could not be captured. Check the tab and resume.')
    }
    // Recheck session after async capture so disconnects cannot publish a page.
    if ((await auth())?.userId !== state.userId) return
    if (state.kind === 'collection_profile') {
     if (!result.collection) throw new Error('Collection profile is unavailable. Check the scan tab and resume.')
     state.collection = result.collection
    }
    state.sources ??= []; state.seenSeries ??= []
    const seriesUrls = state.kind === 'series' || state.reviewRelatedSeries !== false ? result.seriesUrls ?? [] : result.bookmarkedSeriesUrls ?? []
    for (const seriesUrl of seriesUrls) {
     if (!/^https:\/\/archiveofourown\.org\/series\/[1-9]\d*$/.test(seriesUrl)) throw new Error('Unexpected series URL in listing.')
     if (!state.seenSeries.includes(seriesUrl)) {
      state.seenSeries.push(seriesUrl); state.sources.push({ url: seriesUrl, kind: 'series_works' })
     }
    }
    if (state.kind === 'bookmarks' && state.bookmarkedSeries) for (const seriesUrl of result.bookmarkedSeriesUrls ?? []) {
     if (!result.seriesUrls?.includes(seriesUrl)) throw new Error('Unexpected bookmarked series URL in listing.')
     if (!state.bookmarkedSeries.includes(seriesUrl)) state.bookmarkedSeries.push(seriesUrl)
    }
    if (state.kind === 'bookmarks') {
     state.seriesBookmarkDates ??= {}
     for (const [url, date] of Object.entries(result.seriesBookmarkDates ?? {})) {
      if (!result.bookmarkedSeriesUrls?.includes(url) || !result.seriesUrls?.includes(url) || typeof date !== 'string') throw new Error('Unexpected series bookmark date in listing.')
      const cutoff = scraperDate(date) ?? ''
      if (state.seriesBookmarkDates[url] === undefined || cutoff > state.seriesBookmarkDates[url]) state.seriesBookmarkDates[url] = cutoff
     }
     const bookmarked = new Set(state.bookmarkedWorkIds ?? [])
     for (const work of readAo3Rows(result.rows)) if (typeof work.workId === 'number') bookmarked.add(work.workId)
     state.bookmarkedWorkIds = [...bookmarked]
    }
    const keys = result.rows.map(listingKey)
    if (keys.some(key => !key)) throw new Error('Missing stable record identifier.')
    const known = new Set(state.baseline)
    // Keep observed existing rows for metadata refresh, while still stopping on overlap.
    const cutoff = state.kind === 'series_works' ? state.seriesBookmarkDates?.[state.currentUrl] : undefined
    const bookmarked = new Set(state.bookmarkedWorkIds ?? [])
    // Inherit only the date, never the series bookmark ID or personal fields.
    const rows = cutoff === undefined ? result.rows : result.rows.map(row => bookmarked.has(Number(listingKey(row))) ? row : { ...row, source_list: 'bookmarks', 'bookmark date': cutoff })
    let seriesPreview
    if (state.kind === 'series_works') {
     const snapshot = (await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: captureMetadataPage, injectImmediately: true, args: [false, 'series'] }))[0]?.result
     if (snapshot?.html && sameScanUrl(snapshot.url, state.requestUrl)) {
      seriesPreview = { ...parseSeries(snapshot.html, snapshot.url), fetchedAt: new Date().toISOString() }
     }
    }
    await storage.local.set({ [pageKey(state, (state.startPage ?? 1) + state.pages)]: { rows, ...(state.kind === 'series_works' ? { seriesUrl: state.currentUrl, ...(seriesPreview ? { seriesPreview } : {}) } : {}) } })
    if (state.checkChapterDates && (!state.readingStatus || state.readingStatus === 'reading')) {
     state.chapterQueue = readAo3Rows(rows).flatMap((work, row) => work.source === 'bookmarks' && work.workId && work.workStatus !== 'deleted' && work.bookmarkDate && work.metadata.published_chapters && bookmarkReadingState(work).status === 'reading' && (state.reviewExisting || !known.has(keys[row])) ? [{ workId: work.workId, title: work.metadata.title, published: work.metadata.published_chapters, page: (state.startPage ?? 1) + state.pages, row }] : [])
    }
    state.keys.push(...keys.map(key => state.kind === 'series_works' ? `series-work:${key}` : key)); state.pages++; state.count += rows.length; state.skipped += result.skipped
    state.skippedEntries ??= []
    state.skippedEntries.push(...result.skippedEntries ?? [])
    if (state.kind !== 'series_works') state.listPages = (state.listPages ?? 0) + 1
    state.captured = true
    state.done = !result.hasNext || state.mode === 'quick' && state.kind !== 'series_works' && keys.some(key => known.has(key))
    if (!state.done && state.kind !== 'series_works' && state.limited && state.page >= (state.endPage ?? state.maxPages ?? Infinity)) { state.partial = true; state.done = true }
    await write(state)
    if (state.chapterQueue?.length) return
   }
   // Complete chapter checks before exposing an importable batch. Keep the
   // captured page and source queue intact so continuation advances exactly once.
   if (state.captured && (!state.done || state.sources?.length) && (state.hasMore || state.pages - (state.batchStart ?? 0) >= 500)) {
    state.status = 'ready'; state.hasMore = true; state.error = ''
    await write(state); changed(); return
   }
   if (state.done && state.sources?.length) {
    if (Date.now() < state.nextAt) return
    const source = state.sources.shift()
    state.currentUrl = source.url; state.kind = source.kind; state.page = 1; state.captured = false; state.done = false
    const url = new URL(source.url); url.searchParams.set('page', '1')
    await navigate(state, url.href); return
   }
   if (state.done) { state.status = 'ready'; state.error = ''; await write(state); changed(); return }
   if (Date.now() < state.nextAt) return
   const url = new URL(state.currentUrl ?? state.url); url.searchParams.set('page', String(state.page + 1))
   state.page++; state.captured = false
   await navigate(state, url.href)
  } catch (error) {
   if (state?.status === 'running') { state.status = 'paused'; state.error = error.message; state.attention = isLibrarySyncSafetyLimit(state) ? 'safety_limit' : state.attention ?? 'page_error'; state.attentionId = crypto.randomUUID(); await write(state) }
  } finally {
   unlock()
   if (state?.status === 'running') schedule(Math.max(Date.now() + 1000, state.tabId === null || state.retryNavigation || state.captured ? state.nextAt : 0))
  }
 }
 return { busy: () => busy, async command(message) {
  const mutation = !['status', 'page', 'open-tab'].includes(message.action)
  // Ending is queued behind the current atomic page/checkpoint operation. Other
  // mutations retain their existing retry behavior while the scanner is busy.
  if (message.action === 'end') {
   const { state } = await owned()
   if (message.scanId && state?.id !== message.scanId) throw new Error('The saved scan changed in another tab. Refresh before continuing.')
   endingScanId = state?.id ?? null
   while (busy) await idle
  }
  if (mutation && busy) throw new Error('A page is being saved. Retry shortly.')
  if (mutation) lock()
  let updated = false
  try {
   const result = await command(message)
   updated = mutation
   if (result.state) {
    const { id, status, url, mode, pages, batchStart, hasMore, endedEarly, canContinue, listPages, count, skipped, error, startPage, endPage, limited, partial, delaySeconds, attention, attentionId, collection, collectionId, importToCollection, autoImport, checkChapterDates, chapterDatesChecked, chapterDatesUnavailable, readingStatus, seenSeries, bookmarkedSeries, seriesReviewVersion, reviewRelatedSeries, seriesBehavior, diagnosticsVersion, skippedEntries, chapterDateIssues, readingStatusOrigin, reviewExisting, repairPages } = result.state
    return { state: { batchVersion: 1, id, status, url, mode, pages, batchStart, hasMore, endedEarly, canContinue, listPages, count, skipped, error, startPage, endPage, limited, partial, delaySeconds, attention, attentionId, collection, collectionId, importToCollection, autoImport, checkChapterDates, chapterDatesChecked, chapterDatesUnavailable, readingStatus, seenSeries, bookmarkedSeries, seriesReviewVersion, reviewRelatedSeries, seriesBehavior, diagnosticsVersion, skippedEntries, chapterDateIssues, readingStatusOrigin, reviewExisting, repairPages } }
   }
   return result
  } finally {
   if (message.action === 'end') endingScanId = null
   if (mutation) unlock()
   // Wake the processor only after releasing the command lock.
   if (updated) changed()
  }
 }, pump, async blocksImports() { const state = await read(); return state?.status === 'running' && state.userId === (await auth())?.userId } }
}
