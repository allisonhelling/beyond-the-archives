// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { createLibrarySync } from './library-sync.js'
import { listingUrl } from './listing.js'
let local, session, chrome, sync, user, clock
const row = id => ({ source_list: 'bookmarks', 'bookmark id': String(id), title: `Work ${id}`, link: `https://archiveofourown.org/works/${id}` })
const storage = state => ({
 get: vi.fn(async key => ({ [key]: structuredClone(state[key]) })),
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
 clock += 59000; await sync.pump(); expect(chrome.tabs.create).not.toHaveBeenCalled()
 clock += 1000; await sync.pump()
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
