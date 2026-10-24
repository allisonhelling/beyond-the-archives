// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installBarBridge } from './bar-background.js'

const backend = 'https://backend.example', connectionKey = `connection:${backend}`
let listener, storage, fetcher
const sender = { id: 'own-extension', url: 'https://archiveofourown.org/works/123', frameId: 0, tab: { id: 7 } }
const input = { p_action: 'get', p_work: 123, p_secret: 'paired-device-secret', p_input: {} }
async function send(message, source = sender) {
 const reply = vi.fn()
 const pending = listener({ type: 'AO3_LIBRARY_BAR', ...message }, source, reply)
 if (pending) await vi.waitFor(() => expect(reply).toHaveBeenCalled())
 return reply.mock.calls[0]?.[0]
}
beforeEach(() => {
 storage = new Map()
 vi.stubGlobal('__SUPABASE_URL__', backend)
 vi.stubGlobal('__APP_ORIGIN__', 'https://library.example')
 vi.stubGlobal('__SUPABASE_KEY__', 'sb_publishable_test')
 vi.stubGlobal('chrome', { runtime: { id: 'own-extension', onMessage: { addListener: handler => { listener = handler } } }, storage: { local: {
  get: async key => ({ [key]: storage.get(key) }),
  set: async values => { Object.entries(values).forEach(([key, value]) => storage.set(key, value)) },
  remove: async key => { storage.delete(key) },
 } } })
 fetcher = vi.fn(async () => Response.json({ entry: null, collections: [] }))
 vi.stubGlobal('fetch', fetcher)
 installBarBridge()
})
afterEach(() => vi.unstubAllGlobals())

it('isolates persistent bar storage from import sessions and scan checkpoints', async () => {
 expect(await send({ action: 'get', key: connectionKey })).toEqual({ ok: true, value: null })
 await send({ action: 'set', key: connectionKey, value: { userId: 'alice', secret: 'private' } })
 expect(storage.get(`ao3-bar:${connectionKey}`)).toEqual({ userId: 'alice', secret: 'private' })
 expect((await send({ action: 'get', key: connectionKey })).value.secret).toBe('private')
 for (const key of ['auth', 'active', 'library-sync', 'connection:https://other.example']) {
  expect(await send({ action: 'get', key })).toMatchObject({ ok: false })
 }
 await send({ action: 'set', key: `draft:${backend}:alice:123`, value: { notes: 'Private draft' } })
 expect(storage.size).toBe(2)
 await send({ action: 'delete', key: connectionKey })
 expect(storage.size).toBe(1)
 expect(fetcher).not.toHaveBeenCalled()
})

it('binds RPCs to the selected environment and preserves only drafts from stale tabs', async () => {
 const hosted = { id: 'hosted', label: 'Hosted', backend, appOrigin: 'https://library.example', publicKey: 'hosted-public' }
 const local = { id: 'local', label: 'Local', backend: 'http://127.0.0.1:54321', appOrigin: 'http://127.0.0.1:5173', publicKey: 'local-public' }
 installBarBridge({ ready: Promise.resolve(), current: local, list: () => [hosted, local] })
 expect((await send({ action: 'configuration' })).value).toEqual(local)
 const rejected = await send({ action: 'rpc', environment: 'hosted', input })
 expect(rejected).toMatchObject({ ok: false, code: 'ENVIRONMENT_CHANGED' })
 expect(fetcher).not.toHaveBeenCalled()
 const draftKey = `draft:${backend}:alice:123`
 expect(await send({ action: 'set', environment: 'hosted', key: draftKey, value: { notes: 'Hosted unsaved notes' } })).toMatchObject({ ok: true })
 expect(storage.get(`ao3-bar:${draftKey}`).notes).toBe('Hosted unsaved notes')
 expect(await send({ action: 'get', environment: 'local', key: connectionKey })).toMatchObject({ ok: false })
 expect(await send({ action: 'rpc', environment: 'local', input })).toMatchObject({ ok: true })
 expect(fetcher).toHaveBeenCalledWith(`${local.backend}/rest/v1/rpc/userscript_library`, expect.objectContaining({ headers: expect.objectContaining({ apikey: 'local-public' }) }))
})

it('rejects messages from other sites, extensions, frames, and unsupported AO3 pages', async () => {
 for (const patch of [{ id: 'other' }, { frameId: 1 }, { tab: undefined }, { url: 'https://evil.example/works/123' }, { url: 'https://archiveofourown.org/users/alice/bookmarks' }]) {
  expect(await send({ action: 'rpc', input }, { ...sender, ...patch })).toBeUndefined()
 }
 expect(fetcher).not.toHaveBeenCalled()
})

it('uses a fixed RPC and forwards conflicts without losing their status or body', async () => {
 fetcher.mockResolvedValueOnce(Response.json({ code: '40001', details: 'conflict review' }, { status: 409 }))
 const result = await send({ action: 'rpc', input, url: 'https://evil.example', headers: { Authorization: 'do not use' } })
 expect(result).toMatchObject({ ok: true, value: { status: 409 } })
 expect(JSON.parse(result.value.responseText)).toMatchObject({ code: '40001' })
 expect(fetcher).toHaveBeenCalledWith(`${backend}/rest/v1/rpc/userscript_library`, expect.objectContaining({
  method: 'POST', credentials: 'omit', redirect: 'error',
  headers: { apikey: 'sb_publishable_test', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
 }))
 for (const patch of [{ p_action: 'manage_userscript_device' }, { p_action: 'series_get' }, { p_work: 456 }, { p_work: 0 }]) {
  expect(await send({ action: 'rpc', input: { ...input, ...patch } })).toMatchObject({ ok: false })
 }
 expect(fetcher).toHaveBeenCalledTimes(1)
})

it('supports series controls and individual work controls on the same series page', async () => {
 const source = { ...sender, url: 'https://archiveofourown.org/series/77' }
 for (const request of [{ ...input, p_work: 77, p_action: 'series_get' }, input, { ...input, p_action: 'save' }]) {
  expect(await send({ action: 'rpc', input: request }, source)).toMatchObject({ ok: true })
 }
 expect(await send({ action: 'rpc', input: { ...input, p_action: 'series_save' } }, source)).toMatchObject({ ok: false })
 expect(fetcher).toHaveBeenCalledTimes(3)
})
