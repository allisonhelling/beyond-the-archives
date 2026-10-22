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
 expect(local.librarySync).toMatchObject({ status: 'ready', count: 0 })
})
it('uses a single tab, paces requests, and stops Quick Sync on overlap while retaining all new rows on that page', async () => {
 await start(); await collect(); await sync.command({ action: 'finish' }); await start('quick')
 chrome.scripting.executeScript.mockImplementation(async () => [{ result: { url: local.librarySync.requestUrl, rows: [row(2), row(1), row(3)], skipped: 0, hasNext: true } }])
 await collect()
 expect(local.librarySync.status).toBe('ready')
 expect((await sync.command({ action: 'page', page: 1 })).rows).toEqual([row(2), row(3)])
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
})
it('fences account switches and never exposes another user’s scan', async () => {
 await start(); await collect(); user = { ...user, userId: 'bob' }
 expect((await sync.command({ action: 'status' })).state).toBeNull()
 expect((await sync.command({ action: 'page', page: 1 })).rows).toBeUndefined()
 expect(await sync.blocksImports()).toBe(false)
})
