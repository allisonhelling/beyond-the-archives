// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { createLibrarySync } from './library-sync.js'
import { listingUrl } from './listing.js'
let local, session, chrome, sync, user, clock
const row = id => ({ source_list: 'bookmarks', 'bookmark id': String(id), title: `Work ${id}`, link: `https://archiveofourown.org/works/${id}` })
const storage = state => ({
 get: vi.fn(async key => Object.fromEntries((Array.isArray(key) ? key : [key]).map(key => [key, structuredClone(state[key])]))),
 set: vi.fn(async data => Object.assign(state, structuredClone(data))),
 remove: vi.fn(async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key] }),
})
beforeEach(() => {
 local = {}; session = {}; clock = Date.now()
 vi.spyOn(Date, 'now').mockImplementation(() => clock)
 user = { userId: 'alice', expiresAt: clock / 1000 + 3600 }
 chrome = { storage: { local: storage(local), session: storage(session) }, tabs: {
 create: vi.fn(async ({ url }) => ({ id: 8, url })), get: vi.fn(async () => ({ id: 8, status: 'complete', url: local.librarySync.requestUrl })), update: vi.fn(async () => {}) },
 scripting: { executeScript: vi.fn(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(1)], skipped: 0, hasNext: false } }]) } }
 vi.stubGlobal('chrome', chrome)
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
})
const start = (mode = 'full') => sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode })
async function collect() { clock += 20000; await sync.pump(); await sync.pump() }
it('validates list identity and rejects histories, foreign origins, filters, and quick sync without a baseline', async () => {
 for (const url of ['https://evil.example/users/alice/bookmarks', 'https://archiveofourown.org/users/alice/readings', 'https://archiveofourown.org/users/alice/bookmarks?page=2']) expect(() => listingUrl(url)).toThrow()
 expect(listingUrl('https://archiveofourown.org/users/alice/readings?show=to-read').kind).toBe('marked_for_later')
 await expect(start('quick')).rejects.toThrow('full scan')
})
it('checkpoints pages, survives controller restart, and commits baseline only after import acknowledgment', async () => {
 await start(); await collect()
 expect(local.librarySync.status).toBe('ready')
 expect(local[local.librarySync.baselineKey]).toBeUndefined()
 const restarted = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await restarted.command({ action: 'page', page: 1 })).rows).toEqual([row(1)])
 await restarted.command({ action: 'finish' })
 expect(local[local.librarySync.baselineKey]).toEqual(['1'])
 expect(local[`librarySync:${local.librarySync.id}:1`]).toBeUndefined()
 await start('quick'); await collect()
 expect(local.librarySync).toMatchObject({ status: 'ready', count: 1 })
})
it('uses a single tab, paces requests, and stops Quick Sync on overlap while retaining all new rows on that page', async () => {
 await start(); await collect(); await sync.command({ action: 'finish' }); await start('quick')
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(2), row(1), row(3)], skipped: 0, hasNext: true } }])
 await collect()
 expect(local.librarySync.status).toBe('ready')
 expect((await sync.command({ action: 'page', page: 1 })).rows).toEqual([row(2), row(1), row(3)])
 expect(chrome.tabs.update).not.toHaveBeenCalled()
})
it('waits for work imports, spaces pagination, and resumes the first uncaptured page after a restriction', async () => {
 const available = vi.fn(async () => false)
 sync = createLibrarySync({ auth: async () => user, available, changed: vi.fn() })
 await start(); clock += 20000; await sync.pump(); expect(chrome.tabs.create).not.toHaveBeenCalled()
 available.mockResolvedValue(true)
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(1)], skipped: 0, hasNext: true } }])
 await sync.pump(); await sync.pump()
 expect(local.librarySync.pages).toBe(1); expect(chrome.tabs.update).not.toHaveBeenCalled()
 clock += 20000; await sync.pump()
 expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
 chrome.scripting.executeScript.mockResolvedValue([{ result: { error: 'AO3 rate limit' } }])
 await sync.pump(); expect(local.librarySync).toMatchObject({ status: 'paused', page: 2, pages: 1 })
 await sync.command({ action: 'resume' }); expect(local.librarySync.page).toBe(2)
 clock += 20000; await sync.pump()
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 expect(chrome.tabs.update).toHaveBeenCalledTimes(2)
 expect(local.librarySync.pages).toBe(1)
})
it('fences account switches and never exposes another user’s scan', async () => {
 await start(); await collect(); user = { ...user, userId: 'bob' }
 expect((await sync.command({ action: 'status' })).state).toBeNull()
 expect((await sync.command({ action: 'page', page: 1 })).rows).toBeUndefined()
 expect(await sync.blocksImports()).toBe(false)
})

it('validates ranges in both app builds and rejects ranges for Quick Sync', async () => {
 const request = { action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full' }
 for (const range of [{ startPage: 0 }, { startPage: 1.5 }, { startPage: 501 }, { endPage: '2' }, { endPage: 0 }, { startPage: 8, endPage: 7 }, { endPage: 501 }]) await expect(sync.command({ ...request, ...range })).rejects.toThrow('whole page numbers')
 await expect(sync.command({ ...request, mode: 'quick', startPage: 2 })).rejects.toThrow('Quick Sync must start')
 expect(chrome.tabs.create).not.toHaveBeenCalled()
})
it('requests only the inclusive selected range and preserves the full-sync baseline', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', startPage: 2, endPage: 3 })
 const key = local.librarySync.baselineKey
 local[key] = ['old-full-scan']
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(local.librarySync.page)], skipped: 0, hasNext: true } }])
 await collect()
 expect(local.librarySync).toMatchObject({ status: 'running', pages: 1, page: 2 })
 expect(chrome.tabs.create.mock.calls[0][0].url).toContain('page=2')
 clock += 20000; await sync.pump(); await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 2, limited: true, partial: true, startPage: 2, endPage: 3 })
 expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
 expect(chrome.tabs.update.mock.calls[0][1].url).toContain('page=3')
 expect((await sync.command({ action: 'page', page: 3 })).rows).toEqual([row(3)])
 await expect(sync.command({ action: 'page', page: 1 })).rejects.toThrow('No completed page')
 await sync.command({ action: 'finish' }); await sync.pump()
 expect(local[key]).toEqual(['old-full-scan'])
 expect(local[`librarySync:${local.librarySync.id}:2`]).toBeUndefined()
 expect(local[`librarySync:${local.librarySync.id}:3`]).toBeUndefined()
 expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
})
it('scans from an optional start through the list end and never establishes a partial baseline', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', startPage: 8 })
 await collect(); await sync.command({ action: 'finish' })
 expect(chrome.tabs.create.mock.calls[0][0].url).toContain('page=8')
 await expect(start('quick')).rejects.toThrow('full scan')
})
it('keeps sample checkpoints separate from the signed-in library scan', async () => {
 await start(); const real = structuredClone(local.librarySync)
 user = { userId: 'local-sample-reader', sample: true, expiresAt: clock / 1000 + 3600 }
 expect((await sync.command({ action: 'status' })).state).toBeNull()
 await start()
 expect(local.sampleLibrarySync).toMatchObject({ sample: true, userId: 'local-sample-reader' })
 expect(local.librarySync).toEqual(real)
 await sync.command({ action: 'discard' }); expect(local.librarySync).toEqual(real)
})

it('validates and persists the selected request interval across worker restarts', async () => {
 const request = { action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full' }
 for (const delaySeconds of [4, 0, 3601, 12.5, '60']) await expect(sync.command({ ...request, delaySeconds })).rejects.toThrow('request interval')
 await sync.command({ ...request, delaySeconds: 60 })
 await sync.pump(); expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(1)], skipped: 0, hasNext: true } }])
 await sync.pump()
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await sync.command({ action: 'status' })).state.delaySeconds).toBe(60)
 clock += 59000; await sync.pump(); expect(chrome.tabs.update).not.toHaveBeenCalled()
 clock += 4000; await sync.pump(); expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
})
it('applies an edited interval to the next page request and the shared request gate', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', delaySeconds: 60 })
 clock += 60000; await sync.pump()
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(1)], skipped: 0, hasNext: true } }])
 await sync.pump()
 await sync.command({ action: 'set-delay', delaySeconds: 10 })
 expect(session.ao3RequestAfter).toBe(clock + 10000)
 clock += 9999; await sync.pump(); expect(chrome.tabs.update).not.toHaveBeenCalled()
 clock++; await sync.pump(); expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
})
it('records distinct attention events and focuses only the owned scan tab without a new navigation', async () => {
 await start(); clock += 20000; await sync.pump()
 chrome.scripting.executeScript.mockResolvedValue([{ result: { attention: 'rate_limit', error: 'AO3 is limiting requests.' } }])
 await sync.pump()
 const first = (await sync.command({ action: 'status' })).state
 expect(first).toMatchObject({ status: 'paused', attention: 'rate_limit' }); expect(first.attentionId).toBeTruthy()
 chrome.tabs.get.mockResolvedValue({ id: 8, windowId: 12, url: local.librarySync.requestUrl })
 chrome.windows = { update: vi.fn().mockResolvedValue(undefined) }
 await sync.command({ action: 'open-tab', scanId: local.librarySync.id })
 expect(chrome.tabs.update).toHaveBeenCalledWith(8, { active: true })
 expect(chrome.windows.update).toHaveBeenCalledWith(12, { focused: true })
 expect(local.librarySync.status).toBe('paused')
 await expect(sync.command({ action: 'open-tab', scanId: 'another-scan' })).rejects.toThrow('changed')
 chrome.tabs.get.mockRejectedValue(new Error('No tab'))
 await expect(sync.command({ action: 'open-tab' })).rejects.toThrow('closed')
})
it('marks a redirected login as needing attention without trying to import it', async () => {
 await start(); clock += 20000; await sync.pump()
 chrome.tabs.get.mockResolvedValue({ id: 8, status: 'complete', url: 'https://archiveofourown.org/users/login' })
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'paused', attention: 'login', pages: 0 })
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
})

it('retains deleted bookmarks in scan pages without a deletion preference', async () => {
 const reply = await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full' })
 expect(reply.state).not.toHaveProperty('updateDeleted')
 const deleted = { source_list: 'bookmarks', 'bookmark id': '22', work_status: 'deleted', link: 'https://archiveofourown.org/bookmarks/22', title: '' }
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [deleted], skipped: 0, hasNext: false } }])
 await collect()
 expect((await sync.command({ action: 'page', page: 1 })).rows).toEqual([deleted])
 const restarted = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await restarted.command({ action: 'status' })).state).not.toHaveProperty('updateDeleted')
})

it('accepts full user, pseud, tag, search, series, and collection URLs while restricting Quick Sync', () => {
 for (const path of ['/users/alice/works', '/users/alice/pseuds/Other/works', '/users/alice/series', '/collections/example', '/collections/example/profile', '/tags/Example/works', '/works/search?work_search[query]=stars']) {
  expect(listingUrl(`https://archiveofourown.org${path}`).url).toContain('archiveofourown.org')
  expect(() => listingUrl(`https://archiveofourown.org${path}`, 'quick')).toThrow()
 }
 expect(listingUrl('https://archiveofourown.org/users/alice/works?work_search[complete]=T').url).toContain('work_search[complete]=T')
})
it('resumes a collection across profile, works, bookmarks, and expanded series without overwriting checkpoints', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/collections/example', mode: 'full', importToCollection: true })
 chrome.scripting.executeScript.mockImplementation(async () => {
  const { requestUrl, kind } = local.librarySync
  return [{ result: { url: requestUrl, rows: kind === 'collection_profile' ? [] : [row(kind === 'works' ? 1 : kind === 'bookmarks' ? 2 : 3)], skipped: 0, hasNext: false,
   ...(kind === 'collection_profile' ? { collection: { name: 'Example', description: 'Summary\n\nIntro' } } : {}), ...(kind === 'bookmarks' ? { seriesUrls: ['https://archiveofourown.org/series/99', 'https://archiveofourown.org/series/99'] } : {}) } }]
 })
 await collect()
 expect(local.librarySync).toMatchObject({ status: 'running', pages: 1, collection: { name: 'Example' } })
 // Restart after a source transition to exercise persisted queue and URL state.
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 for (let i = 0; i < 5; i++) await collect()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 4, count: 3, sources: [], seenSeries: ['https://archiveofourown.org/series/99'] })
 for (let page = 1; page <= 4; page++) expect((await sync.command({ action: 'page', page })).rows).toHaveLength(page === 1 ? 0 : 1)
 expect((await sync.command({ action: 'status' })).state).toMatchObject({ seenSeries: ['https://archiveofourown.org/series/99'], seriesReviewVersion: 1 })
 expect((await sync.command({ action: 'page', page: 3 })).seriesUrl).toBeUndefined()
 expect((await sync.command({ action: 'page', page: 4 })).seriesUrl).toBe('https://archiveofourown.org/series/99')
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 const collectionId = '00000000-0000-4000-8000-000000000001'
 await sync.command({ action: 'set-collection', collectionId })
 expect((await sync.command({ action: 'status' })).state.collectionId).toBe(collectionId)
 await sync.command({ action: 'finish' })
 expect(Object.keys(local).filter(key => key.startsWith('librarySync:'))).toHaveLength(0)
})

it('persists URL reading status through checkpoints and omits it for username imports', async () => {
 const request = { action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', readingStatus: 'paused_reading' }
 await sync.command(request)
 expect((await sync.command({ action: 'status' })).state.readingStatus).toBe('paused_reading')
 await sync.command({ action: 'discard' })
 await sync.command({ ...request, autoImport: true })
 expect((await sync.command({ action: 'status' })).state.readingStatus).toBeUndefined()
})

const datedRow = (id = 1) => ({ ...row(id), chapters: '3/3', date: '2026-10-20', 'bookmark date': '2026-10-10' })
const chapterIndex = '<ol class="chapter index"><li><a href="/works/1/chapters/101">1. First</a><span class="datetime">(2026-09-01)</span></li><li><a href="/works/1/chapters/102">2. Second</a><span class="datetime">(2026-10-01)</span></li><li><a href="/works/1/chapters/103">3. Third</a><span class="datetime">(2026-10-10)</span></li></ol>'
it('checks opted-in chapter indexes in the paced scan tab and resumes from durable checkpoints', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', checkChapterDates: true, delaySeconds: 5 })
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: local.librarySync.requestUrl.endsWith('/navigate') ? { url: local.librarySync.requestUrl, html: chapterIndex } : { url: local.librarySync.requestUrl, rows: [datedRow()], skipped: 0, hasNext: false } }])
 await collect()
 expect(local.librarySync).toMatchObject({ status: 'running', pages: 1, chapterQueue: [{ workId: 1, published: 3, page: 1, row: 0 }] })
 const before = chrome.tabs.update.mock.calls.length
 await sync.pump()
 expect(chrome.tabs.update).toHaveBeenCalledTimes(before)
 clock += 10000
 await sync.pump()
 expect(local.librarySync.requestUrl).toBe('https://archiveofourown.org/works/1/navigate')
 await sync.command({ action: 'pause' })
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 await sync.command({ action: 'resume' })
 clock += 10000
 await sync.pump()
 expect(chrome.tabs.update).toHaveBeenLastCalledWith(8, { url: 'https://archiveofourown.org/works/1/navigate' })
 await sync.pump(); await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', chapterDatesChecked: 1, chapterDatesUnavailable: 0 })
 const rows = (await sync.command({ action: 'page', page: 1 })).rows
 expect(JSON.parse(rows[0]['chapter dates'])).toEqual({ '1': '2026-09-01', '2': '2026-10-01', '3': '2026-10-10' })
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
})
it.each([{ checkChapterDates: false }, { checkChapterDates: true, readingStatus: 'paused_reading' }])('keeps listing-only scans free of chapter requests when the check does not apply: %j', async options => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', ...options })
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [datedRow()], skipped: 0, hasNext: false } }])
 await collect()
 expect(local.librarySync.status).toBe('ready')
 expect(local.librarySync.chapterDatesChecked).toBe(0)
 expect(chrome.tabs.update).not.toHaveBeenCalled()
})
it('keeps progress unconfirmed for incomplete indexes without losing the saved listing', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', checkChapterDates: true })
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: local.librarySync.requestUrl.endsWith('/navigate') ? { url: local.librarySync.requestUrl, html: '<ol class="chapter index"></ol>' } : { url: local.librarySync.requestUrl, rows: [datedRow()], skipped: 0, hasNext: false } }])
 await collect(); await collect(); await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', chapterDatesChecked: 1, chapterDatesUnavailable: 1 })
 expect((await sync.command({ action: 'page', page: 1 })).rows[0]['chapter dates']).toBeUndefined()
})

it('waits for a pending capture without pausing or requesting another page', async () => {
 await start(); clock += 20000; await sync.pump()
 chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { url: local.librarySync.requestUrl, pending: true } }])
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'running', pages: 0, error: '' })
 expect(chrome.tabs.update).not.toHaveBeenCalled()
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 1, count: 1 })
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
})

it('times out a document that remains pending without losing saved pages', async () => {
 await start(); clock += 20000; await sync.pump()
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, pending: true } }])
 clock += 120001; await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'paused', pages: 0, error: 'Page load timed out. Check AO3, then resume.' })
 expect(chrome.tabs.update).not.toHaveBeenCalled()
})

it('wakes an idle scan after releasing the command lock and opens its first tab immediately', async () => {
 let wake, locked
 const schedule = vi.fn()
 sync = createLibrarySync({ auth: async () => user, available: async () => true, schedule, changed: () => { locked = sync.busy(); wake = sync.pump() } })
 await start(); await wake
 expect(locked).toBe(false)
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 expect(schedule).toHaveBeenCalledWith(clock + 1000)
})
it('respects a recent work request before opening the initial scan tab', async () => {
 session.ao3LastNavigation = clock
 await start(); await sync.pump()
 expect(chrome.tabs.create).not.toHaveBeenCalled()
 clock += 15000; await sync.pump()
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
})
it('waits for a missing document capture without reloading and times out safely', async () => {
 await start(); await sync.pump()
 chrome.scripting.executeScript.mockResolvedValueOnce([])
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'running', pages: 0, error: '' })
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 1 })
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 expect(chrome.tabs.update).not.toHaveBeenCalled()
 await sync.command({ action: 'discard' }); clock += 20000; await start(); await sync.pump()
 chrome.scripting.executeScript.mockResolvedValue([{ result: null }])
 clock += 120001; await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'paused', error: 'Page load timed out. Check AO3, then resume.' })
})
it('accepts equivalent bookmark query encodings from Chrome and the captured document', async () => {
 await start(); await sync.pump()
 const url = local.librarySync.requestUrl.replaceAll('%5B', '[').replaceAll('%5D', ']')
 chrome.tabs.get.mockResolvedValue({ id: 8, status: 'complete', url })
 chrome.scripting.executeScript.mockResolvedValue([{ result: { url, rows: [row(1)], skipped: 0, hasNext: false } }])
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 1 })
})

it('keeps a previous scan cooldown when starting a new scan', async () => {
 session.ao3RequestAfter = clock + 60000
 await start(); await sync.pump()
 expect(chrome.tabs.create).not.toHaveBeenCalled()
 clock += 60000; await sync.pump()
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
})

it('saves a parsed listing while Chrome is still waiting for resources', async () => {
 await start(); await sync.pump()
 chrome.tabs.get.mockImplementation(async () => ({ id: 8, status: 'loading', url: local.librarySync.requestUrl }))
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 1, count: 1 })
 expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ injectImmediately: true }))
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 expect(chrome.tabs.update).not.toHaveBeenCalled()
})
it('waits for unparsed chapter indexes and captures them before resources finish', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', checkChapterDates: true })
 chrome.tabs.get.mockImplementation(async () => ({ id: 8, status: 'loading', url: local.librarySync.requestUrl }))
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [datedRow()], skipped: 0, hasNext: false } }])
 await collect(); clock += 20000; await sync.pump()
 expect(local.librarySync.chapterRequest.workId).toBe(1)
 chrome.scripting.executeScript.mockResolvedValueOnce([{ result: null }]).mockResolvedValueOnce([{ result: { url: local.librarySync.requestUrl, pending: true } }])
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'running', pages: 1, chapterDatesChecked: 0 })
 chrome.scripting.executeScript.mockResolvedValue([{ result: { url: local.librarySync.requestUrl, html: chapterIndex } }])
 await sync.pump(); await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 1, chapterDatesChecked: 1 })
})

it('can focus the scan tab while a capture is being saved without releasing its lock', async () => {
 await start(); await sync.pump()
 chrome.tabs.get.mockImplementation(async () => ({ id: 8, windowId: 12, status: 'loading', url: local.librarySync.requestUrl }))
 chrome.windows = { update: vi.fn().mockResolvedValue(undefined) }
 let finish
 chrome.scripting.executeScript.mockImplementation(() => new Promise(resolve => { finish = resolve }))
 const capture = sync.pump()
 await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
 await expect(sync.command({ action: 'open-tab', scanId: local.librarySync.id })).resolves.toHaveProperty('state')
 expect(sync.busy()).toBe(true)
 expect(chrome.tabs.update).toHaveBeenCalledWith(8, { active: true })
 finish([{ result: { url: local.librarySync.requestUrl, rows: [row(1)], skipped: 0, hasNext: false } }])
 await capture
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 1 })
})
