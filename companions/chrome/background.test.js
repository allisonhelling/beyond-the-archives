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
  runtime: { onMessageExternal: event(), onMessage: event() },
  storage: { local: { get: vi.fn(async () => ({})) }, session: {
   get: vi.fn(async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, state[key]]))),
   set: vi.fn(async values => { Object.assign(state, structuredClone(values)) }),
   remove: vi.fn(async key => { delete state[key] }),
   clear: vi.fn(async () => { state = {} }),
  } },
  action: { setBadgeText: vi.fn().mockResolvedValue(undefined), onClicked: event() },
  alarms: { create: vi.fn().mockResolvedValue(undefined), onAlarm: event() },
  webNavigation: { onDOMContentLoaded: event() },
  tabs: { query: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 7, status: 'loading', url: '' }), get: vi.fn().mockResolvedValue({ id: 7, status: 'complete', url: workUrl }), onUpdated: event() },
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
afterEach(async () => {
 for (const [listener] of chrome.runtime.onMessageExternal.addListener.mock.calls) {
  await new Promise(resolve => listener({ type: 'AO3_LIBRARY_DISCONNECT' }, { url: globalThis.__APP_ORIGIN__ }, resolve))
 }
 vi.useRealTimers()
 vi.unstubAllGlobals()
})
it('does not read ordinary AO3 tabs or accept connection messages from other sites', async () => {
 chrome.tabs.onUpdated.addListener.mock.calls[0][0](7, { status: 'complete' })
 chrome.webNavigation.onDOMContentLoaded.addListener.mock.calls[0][0]({ tabId: 7, frameId: 0 })
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
 await vi.waitFor(() => expect(finishAuthentication).toBeTypeOf('function'))
 listener({ type: 'AO3_LIBRARY_DISCONNECT' }, { url: origin }, disconnectReply)
 finishAuthentication(Response.json({ id: 'alice' }))
 await vi.waitFor(() => expect(connectReply).toHaveBeenCalledWith({ ok: false }))
 expect(state.auth).toBeUndefined()
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
})

it('opens the next queued work after three seconds without waiting for the alarm', async () => {
 await connect(); await tick()
 const next = { ...job, id: 'next-job', workId: 456 }
 fetcher.mockImplementation(async url => {
  if (url.endsWith('/claim_extension_job')) return Response.json(next)
  if (url.includes('/metadata_jobs?')) return Response.json([{ status: 'processing', lease_token: job.token }])
  return Response.json({ committed: true })
 })
 vi.useFakeTimers()
 chrome.tabs.onUpdated.addListener.mock.calls[0][0](7, { status: 'complete' })
 await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: 'OK' }))
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(3000)
 expect(chrome.tabs.create).toHaveBeenCalledTimes(2)
 expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: 'https://archiveofourown.org/works/456', active: false })
 expect(state.active.id).toBe('next-job')
})

it('cancels the next queued open when the library disconnects', async () => {
 await connect(); await tick()
 vi.useFakeTimers()
 chrome.tabs.onUpdated.addListener.mock.calls[0][0](7, { status: 'complete' })
 await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: 'OK' }))
 chrome.runtime.onMessageExternal.addListener.mock.calls[0][0]({ type: 'AO3_LIBRARY_DISCONNECT' }, { url: origin }, vi.fn())
 await vi.advanceTimersByTimeAsync(3000)
 expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
 expect(state.auth).toBeUndefined()
})

it('captures a loading requested tab once even when full-load and alarm events overlap', async () => {
 await connect(); await tick()
 chrome.tabs.get.mockResolvedValue({ id: 7, status: 'loading', url: workUrl })
 let finishCapture
 chrome.scripting.executeScript.mockImplementation(() => new Promise(resolve => { finishCapture = resolve }))
 const updated = chrome.tabs.onUpdated.addListener.mock.calls[0][0]
 chrome.webNavigation.onDOMContentLoaded.addListener.mock.calls[0][0]({ tabId: 7, frameId: 0 })
 await vi.waitFor(() => expect(finishCapture).toBeTypeOf('function'))
 expect(chrome.scripting.executeScript).toHaveBeenLastCalledWith(expect.objectContaining({ args: [true], injectImmediately: true }))
 updated(7, { status: 'complete' })
 chrome.alarms.onAlarm.addListener.mock.calls[0][0]({ name: 'requested-imports' })
 finishCapture([{ result: { url: workUrl, html: '<h2 class="title">Ready</h2>' } }])
 await vi.waitFor(() => expect(state.active).toBeUndefined())
 expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
 expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/functions/v1/extension-metadata'))).toHaveLength(1)
})

it('retries at full load after an early miss and rejects a redirected snapshot', async () => {
 await connect(); await tick()
 chrome.tabs.get.mockResolvedValue({ id: 7, status: 'loading', url: workUrl })
 chrome.scripting.executeScript.mockResolvedValueOnce([{ result: null }])
 const updated = chrome.tabs.onUpdated.addListener.mock.calls[0][0]
 chrome.webNavigation.onDOMContentLoaded.addListener.mock.calls[0][0]({ tabId: 7, frameId: 0 })
 await vi.waitFor(() => expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1))
 await tick()
 expect(state.active.id).toBe('job')
 chrome.tabs.get.mockResolvedValue({ id: 7, status: 'complete', url: workUrl })
 chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { url: 'https://archiveofourown.org/works/456', html: '<h2 class="title">Wrong work</h2>' } }])
 updated(7, { status: 'complete' })
 await vi.waitFor(() => expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2))
 await tick()
 expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/functions/v1/extension-metadata'))).toHaveLength(0)
 updated(7, { status: 'complete' })
 await vi.waitFor(() => expect(state.active).toBeUndefined())
 expect(chrome.scripting.executeScript).toHaveBeenLastCalledWith(expect.objectContaining({ args: [false] }))
})

it('ignores DOM-ready events from unrelated tabs and child frames', async () => {
 await connect(); await tick()
 const ready = chrome.webNavigation.onDOMContentLoaded.addListener.mock.calls[0][0]
 ready({ tabId: 99, frameId: 0 })
 ready({ tabId: 7, frameId: 1 })
 await tick()
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
})

it('previews only a specifically requested series from the trusted library without claiming works', async () => {
 state.auth = { token: 'session', userId: 'alice', expiresAt: Math.floor(Date.now() / 1000) + 3600 }
 const url = 'https://archiveofourown.org/series/77'
 chrome.tabs.query.mockResolvedValue([{ id: 8, status: 'complete', url }])
 chrome.tabs.get.mockResolvedValue({ id: 8, status: 'complete', url })
 chrome.scripting.executeScript.mockResolvedValue([{ result: { url, html: '<h2 class="heading">Series</h2>' } }])
 const respond = vi.fn()
 chrome.runtime.onMessageExternal.addListener.mock.calls[0][0]({ type: 'AO3_LIBRARY_PREVIEW_SERIES', url }, { url: origin }, respond)
 await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, page: { url, html: '<h2 class="heading">Series</h2>' } }))
 expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 8 }, args: [false, 'series'] }))
 expect(chrome.tabs.create).not.toHaveBeenCalled()
 expect(fetcher).not.toHaveBeenCalled()
})
it('rejects series previews from unrelated sites, invalid URLs and disconnected sessions', async () => {
 const listener = chrome.runtime.onMessageExternal.addListener.mock.calls[0][0]
 const respond = vi.fn()
 listener({ type: 'AO3_LIBRARY_PREVIEW_SERIES', url: 'https://archiveofourown.org/series/77' }, { url: 'https://evil.example' }, respond)
 expect(respond).not.toHaveBeenCalled()
 listener({ type: 'AO3_LIBRARY_PREVIEW_SERIES', url: 'https://evil.example/series/77' }, { url: origin }, respond)
 await vi.waitFor(() => expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false })))
 respond.mockClear()
 listener({ type: 'AO3_LIBRARY_PREVIEW_SERIES', url: 'https://archiveofourown.org/series/77' }, { url: origin }, respond)
 await vi.waitFor(() => expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false })))
 expect(chrome.tabs.query).not.toHaveBeenCalled()
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
})

it('opens the requested next page instead of reusing another page of the series', async () => {
 state.auth = { token: 'session', userId: 'alice', expiresAt: Math.floor(Date.now() / 1000) + 3600 }
 const url = 'https://archiveofourown.org/series/77', next = url + '?page=2'
 chrome.tabs.query.mockResolvedValue([{ id: 8, status: 'complete', url }])
 chrome.tabs.create.mockResolvedValue({ id: 9, status: 'complete', url: next })
 chrome.tabs.get.mockResolvedValue({ id: 9, status: 'complete', url: next })
 chrome.scripting.executeScript.mockResolvedValue([{ result: { url: next, html: '<h2 class="heading">Series page two</h2>' } }])
 const respond = vi.fn()
 chrome.runtime.onMessageExternal.addListener.mock.calls[0][0]({ type: 'AO3_LIBRARY_PREVIEW_SERIES', url: next }, { url: origin }, respond)
 await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, page: { url: next, html: '<h2 class="heading">Series page two</h2>' } }))
 expect(chrome.tabs.create).toHaveBeenCalledWith({ url: next, active: false })
 expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 9 } }))
})

it('preserves a bookmark work snapshot while capturing its chapter release index', async () => {
 const navigationUrl = `${workUrl}/navigate`
 const originalFetch = fetcher.getMockImplementation()
 fetcher.mockImplementation((url, options) => url.endsWith('/claim_extension_job') ? Response.json({ ...job, chapterDates: true }) : originalFetch(url, options))
 chrome.tabs.query.mockResolvedValue([{ id: 7, status: 'complete', url: workUrl }])
 chrome.tabs.update = vi.fn().mockResolvedValue(undefined)
 await connect()
 await vi.waitFor(() => expect(chrome.tabs.update).toHaveBeenCalledWith(7, { url: navigationUrl }))
 expect(state.active.workPage.url).toBe(workUrl)
 expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/functions/v1/extension-metadata'))).toHaveLength(0)
 chrome.tabs.get.mockResolvedValue({ id: 7, status: 'complete', url: navigationUrl })
 chrome.scripting.executeScript.mockResolvedValue([{ result: { url: navigationUrl, html: '<ol class="chapter index">Release dates</ol>' } }])
 await alarm()
 await vi.waitFor(() => expect(state.active).toBeUndefined())
 expect(chrome.scripting.executeScript).toHaveBeenLastCalledWith(expect.objectContaining({ args: [false, 'navigation'] }))
 const upload = fetcher.mock.calls.find(([url]) => url.endsWith('/functions/v1/extension-metadata'))
 expect(JSON.parse(upload[1].body)).toMatchObject({ url: workUrl, navigationUrl, navigationHtml: '<ol class="chapter index">Release dates</ol>' })
})
it('reports an explicit 404 without navigating to a missing chapter index', async () => {
 const originalFetch = fetcher.getMockImplementation()
 fetcher.mockImplementation((url, options) => url.endsWith('/claim_extension_job') ? Response.json({ ...job, chapterDates: true }) : originalFetch(url, options))
 chrome.tabs.query.mockResolvedValue([{ id: 7, status: 'complete', url: workUrl }])
 chrome.tabs.update = vi.fn()
 chrome.scripting.executeScript.mockResolvedValue([{ result: { url: workUrl, html: '<div id="main"><h2>Error 404</h2><p>The page you were looking for doesn\'t exist.</p></div>', notFound: true } }])
 await connect()
 await vi.waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.endsWith('/functions/v1/extension-metadata'))).toBe(true))
 expect(chrome.tabs.update).not.toHaveBeenCalled()
 expect(state.active).toBeUndefined()
})

it('rejects tokenless sample connections on a hosted extension', async () => {
 const respond = vi.fn()
 chrome.runtime.onMessageExternal.addListener.mock.calls[0][0]({ type: 'AO3_LIBRARY_SAMPLE_CONNECT' }, { url: origin }, respond)
 await vi.waitFor(() => expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false })))
 expect(state.sampleAuth).toBeUndefined()
 expect(fetcher).not.toHaveBeenCalled()
})
it('connects local sample scanning without credentials and does not claim backend work', async () => {
 const localOrigin = 'http://127.0.0.1:5173'
 vi.stubGlobal('__APP_ORIGIN__', localOrigin)
 chrome.runtime.onMessageExternal.addListener.mockClear()
 vi.resetModules(); await import('./background.js')
 const respond = vi.fn()
 chrome.runtime.onMessageExternal.addListener.mock.calls.at(-1)[0]({ type: 'AO3_LIBRARY_SAMPLE_CONNECT' }, { url: localOrigin }, respond)
 await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }))
 expect(state.sampleAuth).toMatchObject({ sample: true, userId: 'local-sample-reader' })
 expect(state.auth).toBeUndefined()
 chrome.alarms.onAlarm.addListener.mock.calls.at(-1)[0]({ name: 'requested-imports' })
 await new Promise(resolve => setTimeout(resolve, 30))
 expect(fetcher).not.toHaveBeenCalled()
})

it('captures an explicit work or series for local sample imports using the shared capture controller', async () => {
 const localOrigin = 'http://127.0.0.1:5173'
 vi.stubGlobal('__APP_ORIGIN__', localOrigin)
 chrome.runtime.onMessageExternal.addListener.mockClear()
 vi.resetModules(); await import('./background.js')
 state.syncSample = true; state.sampleAuth = { userId: 'local-sample-reader', expiresAt: Date.now() / 1000 + 3600 }
 const listener = chrome.runtime.onMessageExternal.addListener.mock.calls.at(-1)[0]
 for (const [type, url, pageType] of [['AO3_LIBRARY_CAPTURE_WORK', workUrl, 'work'], ['AO3_LIBRARY_PREVIEW_SERIES', 'https://archiveofourown.org/series/77', 'series']]) {
  chrome.tabs.query.mockResolvedValue([{ id: 8, status: 'complete', url }])
  chrome.tabs.get.mockResolvedValue({ id: 8, status: 'complete', url })
  chrome.scripting.executeScript.mockResolvedValue([{ result: { url, html: '<h2>Metadata</h2>' } }])
  const respond = vi.fn(); listener({ type, url }, { url: localOrigin }, respond)
  await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, page: { url, html: '<h2>Metadata</h2>' } }))
  expect(chrome.scripting.executeScript).toHaveBeenLastCalledWith(expect.objectContaining({ args: [false, pageType] }))
 }
 expect(fetcher).not.toHaveBeenCalled()
})
it('does not allow the sample-only work capture path to replace authenticated work jobs', async () => {
 state.auth = { userId: 'alice', token: 'session', expiresAt: Date.now() / 1000 + 3600 }
 const respond = vi.fn()
 chrome.runtime.onMessageExternal.addListener.mock.calls[0][0]({ type: 'AO3_LIBRARY_CAPTURE_WORK', url: workUrl }, { url: origin }, respond)
 await vi.waitFor(() => expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false })))
 expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
})
