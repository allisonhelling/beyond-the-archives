// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeEach, expect, it, vi } from 'vitest'
import { createLibrarySync } from './library-sync.js'
import { listingUrl } from './listing.js'
import { readAo3Rows, bookmarkReadingState } from '../../src/features/imports/ao3-csv.ts'
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
it('clears persisted scan errors and attention on discard without changing the completed baseline', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', startPage: 2, endPage: 3 })
 await collect()
 const { id, baselineKey } = local.librarySync
 local[baselineKey] = ['previous-baseline']
 Object.assign(local.librarySync, { status: 'paused', error: 'AO3 listing capture failed: Invalid URL. Saved pages are preserved.', attention: 'page_error', attentionId: 'old-alert' })
 expect(local[`librarySync:${id}:2`]).toBeDefined()
 const reply = await sync.command({ action: 'discard', scanId: id })
 expect(reply.state).toMatchObject({ status: 'discarded', error: '' })
 expect(reply.state.attention).toBeUndefined()
 expect(reply.state.attentionId).toBeUndefined()
 expect(local[`librarySync:${id}:2`]).toBeUndefined()
 expect(local[baselineKey]).toEqual(['previous-baseline'])
 const restarted = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await restarted.command({ action: 'status' })).state).toMatchObject({ status: 'discarded', error: '' })
 chrome.tabs.create.mockClear(); chrome.tabs.update.mockClear()
 await restarted.pump()
 expect(chrome.tabs.create).not.toHaveBeenCalled()
 expect(chrome.tabs.update).not.toHaveBeenCalled()
})
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
 for (const range of [{ startPage: 0 }, { startPage: 1.5 }, { startPage: Number.MAX_SAFE_INTEGER + 1 }, { endPage: '2' }, { endPage: 0 }, { startPage: 8, endPage: 7 }, { endPage: Number.MAX_SAFE_INTEGER + 1 }]) await expect(sync.command({ ...request, ...range })).rejects.toThrow('whole page numbers')
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

it('persists explicit reading status for URL and username scans and leaves defaults unspecified', async () => {
 const request = { action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', readingStatus: 'paused_reading' }
 await sync.command(request)
 expect((await sync.command({ action: 'status' })).state.readingStatus).toBe('paused_reading')
 await sync.command({ action: 'discard' })
 await sync.command({ ...request, autoImport: true })
 expect((await sync.command({ action: 'status' })).state.readingStatus).toBe('paused_reading')
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await sync.command({ action: 'status' })).state.readingStatus).toBe('paused_reading')
 await sync.command({ action: 'discard' })
 await sync.command({ ...request, autoImport: true, readingStatus: undefined })
 expect((await sync.command({ action: 'status' })).state.readingStatus).toBeUndefined()
})

const datedRow = (id = 1) => ({ ...row(id), chapters: '3/3', date: '2026-10-20', 'bookmark date': '2026-10-10' })
const chapterIndex = '<ol class="chapter index"><li><a href="/works/1/chapters/101">1. First</a><span class="datetime">(2026-09-01)</span></li><li><a href="/works/1/chapters/102">2. Second</a><span class="datetime">(2026-10-01)</span></li><li><a href="/works/1/chapters/103">3. Third</a><span class="datetime">(2026-10-10)</span></li></ol>'
it.each([undefined, 'reading'])('checks bookmark chapter dates for the %s status and resumes from durable checkpoints', async readingStatus => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', checkChapterDates: true, delaySeconds: 5, readingStatus })
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
it.each([{ checkChapterDates: false }, { checkChapterDates: true, readingStatus: 'paused_reading' }, { checkChapterDates: true, readingStatus: 'finished' }, { checkChapterDates: true, readingStatus: 'to_read' }])('keeps listing-only scans free of chapter requests when the check does not apply: %j', async options => {
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
 const expected = { workId: 1, title: 'Work 1', url: 'https://archiveofourown.org/works/1', sourceUrl: 'https://archiveofourown.org/works/1/navigate', expectedChapters: 3, foundChapters: 0,
  reason: 'Release dates were available for 0 of 3 published chapters.' }
 expect((await sync.command({ action: 'status' })).state.chapterDateIssues).toEqual([expected])
 await sync.command({ action: 'finish' })
 const restarted = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await restarted.command({ action: 'status' })).state).toMatchObject({ status: 'complete', chapterDateIssues: [expected] })
})

it('retains skipped entry identities after completion and controller restart', async () => {
 const issue = { title: 'Hidden Work', url: 'https://archiveofourown.org/bookmarks/27', sourceUrl: 'https://archiveofourown.org/users/alice/bookmarks?page=1', reason: 'No work link was available.' }
 await start()
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(1)], skipped: 1, skippedEntries: [issue], hasNext: false } }])
 await collect()
 expect((await sync.command({ action: 'finish' })).state).toMatchObject({ status: 'complete', skipped: 1, skippedEntries: [issue], diagnosticsVersion: 1 })
 const restarted = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await restarted.command({ action: 'status' })).state.skippedEntries).toEqual([issue])
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
 expect(local.librarySync).toMatchObject({ status: 'paused', error: 'The extension received no capture from the AO3 listing. Check the extension’s service worker errors, then resume.' })
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

it('pauses on a reported capture exception without waiting for a page-load timeout', async () => {
 await start(); await sync.pump()
 chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { url: local.librarySync.requestUrl, rows: [row(1)], skipped: 0, hasNext: true } }])
 await sync.pump()
 clock += 20000; await sync.pump()
 const error = 'AO3 listing capture failed: Invalid URL. Saved pages are preserved.'
 chrome.scripting.executeScript.mockResolvedValue([{ result: { url: local.librarySync.requestUrl, attention: 'page_error', error } }])
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'paused', page: 2, pages: 1, error })
 expect(local[`librarySync:${local.librarySync.id}:1`].rows).toEqual([row(1)])
 expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
})

it('retains the loading timeout for documents that explicitly report pending', async () => {
 await start(); await sync.pump()
 chrome.scripting.executeScript.mockResolvedValue([{ result: { url: local.librarySync.requestUrl, pending: true } }])
 clock += 120001; await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'paused', error: 'Page load timed out. Check AO3, then resume.' })
})

it('separates primary list pages from expanded series pages across restarts', async () => {
 await start()
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: {
  url: local.librarySync.requestUrl, rows: [row(1)], skipped: 0, hasNext: false,
  ...(local.librarySync.kind === 'bookmarks' ? { seriesUrls: ['https://archiveofourown.org/series/99'] } : {}),
 } }])
 await collect()
 expect((await sync.command({ action: 'status' })).state).toMatchObject({ pages: 1, listPages: 1 })
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 await collect(); await sync.pump()
 expect((await sync.command({ action: 'status' })).state).toMatchObject({ status: 'ready', pages: 2, listPages: 1 })
 // An in-progress scan from an older extension recovers its count from checkpoints.
 delete local.librarySync.listPages
 expect((await sync.command({ action: 'status' })).state).toMatchObject({ pages: 2, listPages: 1 })
})

it('persists the series behavior with the scan and rejects invalid values', async () => {
 await expect(sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', seriesBehavior: 'invalid' })).rejects.toThrow('series import behavior')
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', seriesBehavior: 'all' })
 const restarted = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await restarted.command({ action: 'status' })).state).toMatchObject({ seriesBehavior: 'all' })
})

it('checkpoints full series previews from the scan tab without opening an additional tab', async () => {
 const html = readFileSync(new URL('../../server/ao3/fixtures/series.html', import.meta.url), 'utf8')
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full' })
 chrome.scripting.executeScript.mockImplementation(async ({ func }) => [{ result: func.name === 'captureMetadataPage' ? { url: local.librarySync.requestUrl, html } : {
  url: local.librarySync.requestUrl, rows: [row(101)], skipped: 0, hasNext: false,
  ...(local.librarySync.kind === 'bookmarks' ? { seriesUrls: ['https://archiveofourown.org/series/77'] } : {}),
 } }])
 await collect(); await collect(); await sync.pump()
 const page = await sync.command({ action: 'page', page: 2 })
 expect(page.seriesPreview).toMatchObject({ seriesId: 77, title: 'A & B', works: [{ workId: 101, position: 1 }, { workId: 102, position: 4 }] })
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
 const restarted = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await restarted.command({ action: 'page', page: 2 })).seriesPreview).toEqual(page.seriesPreview)
})

it('keeps filtered bookmark queries on every page of a ranged scan', async () => {
 const url = 'https://archiveofourown.org/bookmarks?bookmark_search%5Bbookmarkable_query%5D=blackkat&user_id=AlmiH'
 await sync.command({ action: 'start', url, mode: 'full', endPage: 2 })
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(1)], skipped: 0, hasNext: true } }])
 await collect(); await collect()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 2 })
 for (const request of [chrome.tabs.create.mock.calls[0][0].url, chrome.tabs.update.mock.calls[0][1].url]) {
  const parsed = new URL(request)
  expect(parsed.pathname).toBe('/bookmarks')
  expect(parsed.searchParams.get('bookmark_search[bookmarkable_query]')).toBe('blackkat')
  expect(parsed.searchParams.get('user_id')).toBe('AlmiH')
 }
})
it.each(['listing', 'sources', 'navigation'])('exposes a saved batch at the safety boundary without navigating ahead: %s', async stage => {
 await start(); await collect()
 Object.assign(local.librarySync, { status: 'running', pages: 500, page: 500, nextAt: 0, captured: stage !== 'listing', done: stage === 'sources', sources: stage === 'sources' ? [{ url: 'https://archiveofourown.org/series/9', kind: 'series_works' }] : [] })
 if (stage === 'listing') {
  local.librarySync.pages = 499
  chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(2)], skipped: 0, hasNext: true } }])
 }
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 500, hasMore: true })
 expect(local[local.librarySync.baselineKey]).toBeUndefined()
 const navigations = chrome.tabs.update.mock.calls.length
 await expect(sync.command({ action: 'finish' })).rejects.toThrow('unavailable')
 await sync.pump()
 expect(chrome.tabs.update).toHaveBeenCalledTimes(navigations)
})
it('rejects resuming a safety-limit checkpoint from an older companion', async () => {
 await start(); await collect()
 Object.assign(local.librarySync, { status: 'paused', attention: 'page_error', error: 'Reached the 500-page safety limit. The scan is incomplete; nothing has been imported.' })
 await expect(sync.command({ action: 'resume' })).rejects.toThrow('Prepare the saved batch')
})
it('allows a complete list ending exactly at the safety boundary to be imported', async () => {
 await start(); await collect()
 Object.assign(local.librarySync, { status: 'running', pages: 499, page: 500, captured: false, done: false })
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 500, error: '' })
})

it('imports three durable batches across page 500 and 1000 without replaying checkpoints or committing an early baseline', async () => {
 user.expiresAt += 86400
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(local.librarySync.page)], skipped: 0, hasNext: local.librarySync.page < 1001 } }])
 await start()
 const id = local.librarySync.id, baseline = local.librarySync.baselineKey
 local[baseline] = ['previous']; local.librarySync.baseline = ['previous']
 for (let batchStart = 0; batchStart < 1001; batchStart += 500) {
  const end = Math.min(batchStart + 500, 1001)
  for (let page = batchStart + 1; page <= end; page++) await collect()
  expect(local.librarySync).toMatchObject({ id, status: 'ready', pages: end, batchStart, hasMore: end < 1001 })
  const rows = []
  for (let page = batchStart + 1; page <= end; page++) rows.push(...(await sync.command({ action: 'page', page })).rows)
  expect(rows.map(item => Number(item['bookmark id']))).toEqual(Array.from({ length: end - batchStart }, (_, index) => batchStart + index + 1))
  expect(local[baseline]).toEqual(['previous'])
  if (end < 1001) {
   const acknowledgment = { action: 'finish-batch', scanId: id, batchStart, batchEnd: end }
   await sync.command(acknowledgment)
   expect(local[`librarySync:${id}:${end}`]).toBeUndefined()
   expect(local.librarySync).toMatchObject({ status: 'running', batchStart: end })
   sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
   await expect(sync.command(acknowledgment)).rejects.toThrow('saved batch changed')
  } else await sync.command({ action: 'finish', scanId: id })
 }
 expect(local.librarySync.status).toBe('complete')
 expect(local[baseline]).toEqual(['previous', ...Array.from({ length: 1001 }, (_, i) => String(i + 1))])
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 expect(chrome.tabs.update).toHaveBeenCalledTimes(1000)
})

it('recovers an old limit checkpoint and retains pending series and collection assignment across import', async () => {
 await start(); await collect()
 const id = local.librarySync.id
 const seriesUrl = 'https://archiveofourown.org/series/99'
 Object.assign(local.librarySync, { status: 'paused', error: 'Reached the 500-page safety limit. Discard this incomplete scan.', attention: 'page_error', done: true, pages: 500, sources: [{ url: seriesUrl, kind: 'series_works' }], seenSeries: [seriesUrl], importToCollection: true, collectionId: '12345678-1234-1234-1234-123456789012' })
 expect((await sync.command({ action: 'status' })).state.batchVersion).toBe(1)
 const prepared = await sync.command({ action: 'prepare-batch', scanId: id })
 expect(prepared.state).toMatchObject({ id, status: 'ready', hasMore: true, error: '' })
 expect((await sync.command({ action: 'page', page: 1 })).rows).toEqual([row(1)])
 await sync.command({ action: 'finish-batch', scanId: id, batchStart: 0, batchEnd: 500 })
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 await collect()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 501, batchStart: 500, hasMore: false, currentUrl: seriesUrl, collectionId: '12345678-1234-1234-1234-123456789012', seenSeries: [seriesUrl], sources: [] })
 expect((await sync.command({ action: 'page', page: 501 })).seriesUrl).toBe(seriesUrl)
 await expect(sync.command({ action: 'page', page: 1 })).rejects.toThrow('No completed page')
})

it('retains all checkpoint pages if acknowledging an imported batch fails', async () => {
 await start(); await collect()
 const id = local.librarySync.id
 Object.assign(local.librarySync, { hasMore: true })
 chrome.storage.local.set.mockRejectedValueOnce(new Error('Storage unavailable'))
 const acknowledgment = { action: 'finish-batch', batchStart: 0, batchEnd: 1 }
 await expect(sync.command(acknowledgment)).rejects.toThrow('Storage unavailable')
 expect(local.librarySync).toMatchObject({ status: 'ready', batchStart: 0 })
 expect(local[`librarySync:${id}:1`]).toBeDefined()
 await sync.command(acknowledgment)
 expect(local.librarySync).toMatchObject({ status: 'running', batchStart: 1 })
 expect(local[`librarySync:${id}:1`]).toBeUndefined()
})

it.each([false, true])('finishes final-page chapter checks before exposing a new or recovered batch (legacy: %s)', async legacy => {
 await start(); await collect()
 const id = local.librarySync.id
 const key = `librarySync:${id}:500`
 local[key] = { rows: [row(1)] }
 Object.assign(local.librarySync, { status: legacy ? 'paused' : 'running', pages: 500, captured: true, done: false, error: legacy ? 'Reached the 500-page safety limit. Discard this incomplete scan.' : '', chapterQueue: [{ workId: 1, published: 1, page: 500, row: 0 }], nextAt: 0 })
 if (legacy) expect((await sync.command({ action: 'prepare-batch' })).state.status).toBe('running')
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, notFound: true } }])
 await sync.pump()
 expect(local.librarySync.status).toBe('running')
 expect(local.librarySync.chapterRequest.workId).toBe(1)
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'running', chapterDatesChecked: 1, chapterQueue: [] })
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', hasMore: true, pages: 500 })
})

it('accepts ranges beyond the first batch and preserves their partial-scan baseline behavior', async () => {
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', startPage: 501, endPage: 502 })
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(local.librarySync.page)], skipped: 0, hasNext: true } }])
 await collect(); await collect()
 expect(local.librarySync).toMatchObject({ status: 'ready', pages: 2, hasMore: false, limited: true, partial: true, page: 502 })
 await sync.command({ action: 'finish' })
 expect(local[local.librarySync.baselineKey]).toBeUndefined()
})

it('continues a series split across batches before visiting the next queued series', async () => {
 await start(); await collect()
 const seriesUrl = 'https://archiveofourown.org/series/99', pendingUrl = 'https://archiveofourown.org/series/100'
 Object.assign(local.librarySync, { status: 'running', pages: 499, page: 9, captured: false, done: false, kind: 'series_works', currentUrl: seriesUrl, sources: [{ url: pendingUrl, kind: 'series_works' }], seenSeries: [seriesUrl, pendingUrl] })
 chrome.scripting.executeScript.mockImplementation(async ({ func }) => [{ result: func.name === 'captureMetadataPage' ? {} : { url: local.librarySync.requestUrl, rows: [row(local.librarySync.page)], skipped: 0, hasNext: local.librarySync.currentUrl === seriesUrl && local.librarySync.page === 9 } }])
 await sync.pump()
 expect(local.librarySync).toMatchObject({ status: 'ready', hasMore: true, page: 9, pages: 500 })
 expect((await sync.command({ action: 'page', page: 500 })).seriesUrl).toBe(seriesUrl)
 await sync.command({ action: 'finish-batch', batchStart: 0, batchEnd: 500 })
 await collect()
 expect(local.librarySync).toMatchObject({ status: 'running', page: 10, pages: 501, currentUrl: seriesUrl, sources: [{ url: pendingUrl, kind: 'series_works' }] })
 await collect()
 expect(local.librarySync).toMatchObject({ status: 'ready', hasMore: false, pages: 502, currentUrl: pendingUrl, sources: [] })
 expect((await sync.command({ action: 'page', page: 501 })).seriesUrl).toBe(seriesUrl)
 expect((await sync.command({ action: 'page', page: 502 })).seriesUrl).toBe(pendingUrl)
 await expect(sync.command({ action: 'finish-batch', batchStart: 0, batchEnd: 500 })).rejects.toThrow('saved batch changed')
})

it('persists explicit series bookmarks across restarts and upgrades a previously discovered membership', async () => {
 const related = 'https://archiveofourown.org/series/99', explicit = 'https://archiveofourown.org/series/100'
 await start()
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: {
  url: local.librarySync.requestUrl, rows: [], skipped: 0, hasNext: local.librarySync.kind === 'bookmarks' && local.librarySync.page === 1,
  ...(local.librarySync.kind === 'bookmarks' ? { seriesUrls: [related, explicit], bookmarkedSeriesUrls: local.librarySync.page === 1 ? [explicit] : [related, explicit] } : {}),
 } }])
 await collect()
 expect(local.librarySync.bookmarkedSeries).toEqual([explicit])
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 expect((await sync.command({ action: 'status' })).state.bookmarkedSeries).toEqual([explicit])
 for (let index = 0; index < 6; index++) await collect()
 expect((await sync.command({ action: 'status' })).state).toMatchObject({ status: 'ready', seenSeries: [related, explicit], bookmarkedSeries: [explicit, related] })
})

it('does not guess bookmark provenance for older saved scans', async () => {
 await start()
 delete local.librarySync.bookmarkedSeries
 const url = 'https://archiveofourown.org/series/99'
 chrome.scripting.executeScript.mockResolvedValue([{ result: { rows: [], seriesUrls: [url], bookmarkedSeriesUrls: [url], skipped: 0, hasNext: false } }])
 await collect()
 expect((await sync.command({ action: 'status' })).state.bookmarkedSeries).toBeUndefined()
})

it.each([
 { label: 'chapter checks off', cutoff: '10 Oct 2026', checkChapterDates: false, expectedStatus: 'reading', progress: 0, checks: 0 },
 { label: 'chapter checks on', cutoff: '10 Oct 2026', checkChapterDates: true, expectedStatus: 'reading', progress: 2, checks: 1 },
 { label: 'explicit Reading override', cutoff: '10 Oct 2026', checkChapterDates: true, readingStatus: 'reading', expectedStatus: 'reading', progress: 2, checks: 1 },
 { label: 'manual Paused override', cutoff: '10 Oct 2026', checkChapterDates: true, readingStatus: 'paused_reading', expectedStatus: 'reading', progress: 0, checks: 0 },
 { label: 'bookmark after the latest update', cutoff: '25 Oct 2026', checkChapterDates: true, expectedStatus: 'finished', progress: 3, checks: 0 },
 { label: 'individual bookmark uses its own earlier cutoff', cutoff: '25 Oct 2026', ownCutoff: '2026-10-10', ownStatus: 'reading', ownProgress: 2, checkedWork: 2, checkChapterDates: true, expectedStatus: 'finished', progress: 3, checks: 1 },
 { label: 'individual bookmark with no date stays unconfirmed', cutoff: '10 Oct 2026', ownCutoff: '', ownStatus: 'reading', ownProgress: 0, checkChapterDates: true, expectedStatus: 'reading', progress: 2, checks: 1 },
 { label: 'missing bookmark date', cutoff: '', checkChapterDates: true, expectedStatus: 'reading', progress: 0, checks: 0 },
 { label: 'membership without a series bookmark', checkChapterDates: true, expectedStatus: 'to_read', progress: 0, checks: 0 },
])('inherits series bookmark reading dates and respects individual bookmarks: $label', async ({ cutoff, checkChapterDates, readingStatus, expectedStatus, progress, checks, ownCutoff = '2026-10-25', ownStatus = 'finished', ownProgress = 3, checkedWork = 1 }) => {
 const seriesUrl = 'https://archiveofourown.org/series/77'
 await sync.command({ action: 'start', url: 'https://archiveofourown.org/users/alice/bookmarks', mode: 'full', checkChapterDates, readingStatus, delaySeconds: 5 })
 const individual = { ...datedRow(2), 'bookmark date': ownCutoff }
 const seriesRows = [1, 2].map(id => ({ title: `Work ${id}`, link: `https://archiveofourown.org/works/${id}`, source_list: 'marked_for_later', chapters: '3/3', date: '2026-10-20' }))
 chrome.scripting.executeScript.mockImplementation(async ({ func }) => {
  const url = local.librarySync.requestUrl
  if (func.name === 'captureMetadataPage') return [{ result: { url, html: url.endsWith('/navigate') ? chapterIndex.replaceAll('/works/1/', `/works/${url.match(/works\/(\d+)/)[1]}/`) : '' } }]
  return [{ result: { url, rows: local.librarySync.kind === 'bookmarks' ? [individual] : seriesRows, skipped: 0, hasNext: false,
   ...(local.librarySync.kind === 'bookmarks' ? { seriesUrls: [seriesUrl], ...(cutoff === undefined ? {} : { bookmarkedSeriesUrls: [seriesUrl], seriesBookmarkDates: { [seriesUrl]: cutoff } }) } : {}),
  } }]
 })
 await collect()
 // Bookmark observations and cutoffs must survive the background worker restarting.
 sync = createLibrarySync({ auth: async () => user, available: async () => true, changed: vi.fn() })
 for (let step = 0; step < 12 && local.librarySync.status === 'running'; step++) await collect()
 expect(local.librarySync).toMatchObject({ status: 'ready', chapterDatesChecked: checks })
 const direct = readAo3Rows((await sync.command({ action: 'page', page: 1 })).rows)[0]
 expect(bookmarkReadingState(direct)).toMatchObject({ status: ownStatus, progress: ownProgress })
 expect(direct).toMatchObject({ bookmarkId: 2, bookmarkDate: ownCutoff || null })
 const savedRows = (await sync.command({ action: 'page', page: 2 })).rows
 const [inherited, alsoBookmarked] = readAo3Rows(savedRows)
 expect(bookmarkReadingState(inherited)).toMatchObject({ status: expectedStatus, progress })
 expect(inherited.bookmarkId).toBeUndefined()
 expect(inherited.notes).toBe('')
 expect(inherited.tags).toEqual([])
 expect(alsoBookmarked.source).toBe('marked_for_later')
 expect(alsoBookmarked.bookmarkDate).toBeNull()
 expect(savedRows[1]['chapter dates']).toBeUndefined()
 const requests = chrome.tabs.update.mock.calls.map(([, options]) => options.url).filter(url => url.endsWith('/navigate'))
 expect(requests).toEqual(checks ? [`https://archiveofourown.org/works/${checkedWork}/navigate`] : [])
})
