import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, waitFor, within } from '@testing-library/dom'
import { mountLibrary } from './main'

let root, storage, network, entry
beforeEach(() => {
 document.body.innerHTML = '<main id="main"><div id="workskin"><h2 class="title">Test</h2><dl class="work meta"><dd class="chapters">10/10</dd></dl><select id="selected_id"><option value="101">1. First</option><option value="102">2. Second</option><option value="103">3. Third</option><option value="104">4. Fourth</option></select></div></main>'
 const attach = Element.prototype.attachShadow
 vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (options) { root = attach.call(this, options); return root })
 vi.stubGlobal('__SUPABASE_URL__', 'https://backend.test')
 vi.stubGlobal('__SUPABASE_KEY__', 'sb_publishable_test')
 vi.stubGlobal('__APP_ORIGIN__', 'https://library.test')
 vi.stubGlobal('__SCRIPT_VERSION__', '0.1.0')
 storage = new Map([['connection:https://backend.test', { secret: 'device-secret', userId: 'alice' }]])
 entry = null
 network = vi.fn(async () => ({ status: 200, responseText: JSON.stringify({ entry, collections: [] }) }))
 vi.stubGlobal('GM', { getValue: async (key, fallback) => storage.get(key) ?? fallback, setValue: async (key, value) => storage.set(key, structuredClone(value)), deleteValue: async key => storage.delete(key), xmlHttpRequest: network })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const mount = () => mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104')
const findButton = name => within(root).getByRole('button', { name })
it('keeps failed notes across reload, confirms only after success, and stores no auth in page storage', async () => {
 await mount()
 fireEvent.click(findButton('Add to Library'))
 const notes = await within(root).findByLabelText('Private notes')
 fireEvent.input(notes, { target: { value: 'Keep these notes' } })
 network.mockResolvedValueOnce({ status: 503, responseText: '{}' })
 fireEvent.submit(notes.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save'))
 expect(notes.value).toBe('Keep these notes')
 expect(storage.get('draft:https://backend.test:alice:123').notes).toBe('Keep these notes')
 expect(document.getElementById('ao3-library-companion').shadowRoot).toBeNull()
 expect(document.body.textContent).not.toContain('Keep these notes')
 document.getElementById('ao3-library-companion').remove()
 await mount()
 fireEvent.click(findButton('Add to Library'))
 const restored = await within(root).findByLabelText('Private notes')
 expect(restored.value).toBe('Keep these notes')
 entry = { version: 'v1', status: 'reading', progress: 3, notes: 'Keep these notes', rating: null, tags: [], collections: [] }
 fireEvent.submit(restored.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 const body = JSON.parse(network.mock.lastCall[0].data)
 expect(body.p_input).toMatchObject({ status: 'reading', progress: 3, notes: 'Keep these notes' })
 expect(storage.has('draft:https://backend.test:alice:123')).toBe(false)
})
it('marks this chapter finished and rereads without transmitting or replacing personal fields', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: 'Private', rating: 4, tags: ['Tag'], collections: [] }
 await mount()
 fireEvent.click(findButton('Mark this chapter finished'))
 await waitFor(() => expect(network).toHaveBeenCalledTimes(2))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toEqual({ version: 'v1', progress: 4, status: 'reading' })
 document.getElementById('ao3-library-companion').remove()
 entry = { ...entry, status: 'finished', progress: 10 }
 await mount()
 fireEvent.click(findButton('Reread?'))
 await waitFor(() => expect(JSON.parse(network.mock.lastCall[0].data).p_action).toBe('progress'))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toEqual({ version: 'v1', progress: 0, status: 're_reading' })
})
it('offers reconnection on expired authorization without showing a false save confirmation', async () => {
 network.mockResolvedValue({ status: 401, responseText: JSON.stringify({ code: '28000' }) })
 await mount()
 expect(within(root).getByRole('status')).toHaveTextContent('authorization expired or was revoked')
 fireEvent.click(findButton('Connection'))
 expect(await within(root).findByLabelText('One-time pairing code')).toHaveAttribute('type', 'password')
})
