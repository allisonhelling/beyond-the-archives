// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const origin = 'https://library.example.com'
const workUrl = 'https://archiveofourown.org/works/123'
let state, chrome, fetcher
const job = { id: 'job', token: 'lease', workId: 123, expiresAt: new Date(Date.now() + 300000).toISOString() }
const event = () => ({ addListener: vi.fn() })
const tick = async () => { await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenCalled()); await new Promise(resolve => setTimeout(resolve, 10)) }
async function connect(sender = { url: `${origin}/imports` }) {
 const respond = vi.fn()
 chrome.runtime.onMessageExternal.addListener.mock.calls[0][0]({ type: 'AO3_LIBRARY_CONNECT', token: 'session', expiresAt: Math.floor(Date.now() / 1000) + 3600 }, sender, respond)
 if (sender.url.startsWith(origin)) await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }))
 return respond
}
async function alarm() { chrome.alarms.onAlarm.addListener.mock.calls[0][0]({ name: 'requested-imports' }); await new Promise(resolve => setTimeout(resolve, 30)) }
beforeEach(async () => {
 vi.resetModules()
 state = {}
 chrome = {
  runtime: { onMessageExternal: event() },
  storage: { session: {
   get: vi.fn(async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, state[key]]))),
   set: vi.fn(async values => { Object.assign(state, structuredClone(values)) }),
   remove: vi.fn(async key => { delete state[key] }),
   clear: vi.fn(async () => { state = {} }),
  } },
  action: { setBadgeText: vi.fn().mockResolvedValue(undefined), onClicked: event() },
  alarms: { create: vi.fn().mockResolvedValue(undefined), onAlarm: event() },
  tabs: { query: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 7, status: 'loading', url: workUrl }), get: vi.fn().mockResolvedValue({ id: 7, status: 'complete', url: workUrl }), onUpdated: event() },
  scripting: { executeScript: vi.fn().mockResolvedValue([{ result: { url: workUrl, html: '<h2 class="title">Loaded</h2>' } }]) },
 }
 fetcher = vi.fn(async url => {
  if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'alice' })
  if (url.includes('/metadata_jobs?')) return Response.json([{ status: 'processing', lease_token: job.token }])
  if (url.endsWith('/claim_extension_job')) return Response.json(job)
  return Response.json({ committed: true })
 })
 vi.stubGlobal('chrome', chrome); vi.stubGlobal('fetch', fetcher)
 vi.stubGlobal('__APP_ORIGIN__', origin); vi.stubGlobal('__SUPABASE_URL__', 'https://project.supabase.co'); vi.stubGlobal('__SUPABASE_KEY__', 'sb_publishable_test')
 await import('./background.js')
})
afterEach(() => vi.unstubAllGlobals())
it('does not read ordinary AO3 tabs or accept connection messages from other sites', async () => {
 chrome.tabs.onUpdated.addListener.mock.calls[0][0](7, { status: 'complete' })
 await alarm()
 const respond = await connect({ url: 'https://evil.example/imports' })
 expect(respond).not.toHaveBeenCalled()
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
 expect(fetcher).not.toHaveBeenCalled()
})
it('opens only a claimed work, waits for load, and resumes from stored state after worker restart', async () => {
 await connect(); await tick()
 expect(chrome.tabs.create).toHaveBeenCalledWith({ url: workUrl, active: false })
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
 expect(state.active.tabId).toBe(7)
 vi.resetModules(); await import('./background.js')
 chrome.alarms.onAlarm.addListener.mock.calls.at(-1)[0]({ name: 'requested-imports' })
 await vi.waitFor(() => expect(state.active).toBeUndefined())
 expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }))
 expect(fetcher).toHaveBeenCalledWith('https://project.supabase.co/functions/v1/extension-metadata', expect.objectContaining({ body: expect.stringContaining('"jobId":"job"') }))
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
})
it('reuses a matching loaded tab and rejects unrelated or cancelled requests before capture', async () => {
 chrome.tabs.query.mockResolvedValue([{ id: 8, status: 'complete', url: workUrl }])
 await connect(); await vi.waitFor(() => expect(state.active).toBeUndefined())
 expect(chrome.tabs.create).not.toHaveBeenCalled()
 expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
 chrome.scripting.executeScript.mockClear()
 fetcher.mockImplementation(async url => url.endsWith('/auth/v1/user') ? Response.json({ id: 'alice' }) : url.endsWith('/claim_extension_job') ? Response.json(job) : Response.json([{ status: 'cancelled', lease_token: null }]))
 await alarm()
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
 expect(state.active).toBeUndefined()
})
it('waits on login pages, retries an upload outage, and clears credentials on authentication failure', async () => {
 await connect(); await tick()
 chrome.tabs.get.mockResolvedValue({ id: 7, status: 'complete', url: 'https://archiveofourown.org/users/login' })
 await alarm()
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
 chrome.tabs.get.mockResolvedValue({ id: 7, status: 'complete', url: workUrl })
 fetcher.mockImplementation(async url => url.includes('/metadata_jobs?') ? Response.json([{ status: 'processing', lease_token: job.token }]) : new Response('', { status: 503 }))
 await alarm(); expect(state.active.id).toBe('job')
 fetcher.mockResolvedValue(new Response('', { status: 401 }))
 await alarm(); expect(state.auth).toBeUndefined(); expect(state.active).toBeUndefined()
 expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: 'AUTH' })
})

it('finishes a waiting request before its server lease expires instead of capturing again', async () => {
 await connect(); await tick()
 state.active.expiresAt = new Date(Date.now() + 30000).toISOString()
 await alarm()
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/functions/v1/extension-metadata'), expect.objectContaining({ body: expect.stringContaining('"timedOut":true') }))
 expect(state.active).toBeUndefined()
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
})

it('does not reconnect after sign-out while an authentication request is in flight', async () => {
 let finishAuthentication
 fetcher.mockImplementation(() => new Promise(resolve => { finishAuthentication = resolve }))
 const listener = chrome.runtime.onMessageExternal.addListener.mock.calls[0][0]
 const connectReply = vi.fn(), disconnectReply = vi.fn()
 listener({ type: 'AO3_LIBRARY_CONNECT', token: 'session', expiresAt: Math.floor(Date.now() / 1000) + 3600 }, { url: origin }, connectReply)
 listener({ type: 'AO3_LIBRARY_DISCONNECT' }, { url: origin }, disconnectReply)
 finishAuthentication(Response.json({ id: 'alice' }))
 await vi.waitFor(() => expect(connectReply).toHaveBeenCalledWith({ ok: false }))
 expect(state.auth).toBeUndefined()
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
})
