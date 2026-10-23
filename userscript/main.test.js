import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitFor, within } from '@testing-library/dom'
import { fireEvent } from '@testing-library/react'
import { mountLibrary } from './main'

let root, bottomRoot, storage, network, entry
beforeEach(() => {
 document.body.innerHTML = '<main id="main"><div id="workskin"><h2 class="title">Test</h2><dl class="work meta"><dd class="chapters">10/10</dd></dl><select id="selected_id"><option value="101">1. First</option><option value="102">2. Second</option><option value="103">3. Third</option><option value="104">4. Fourth</option></select></div><div id="kudos">Kudos list</div></main>'
 const attach = Element.prototype.attachShadow
 vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (options) { const surface = attach.call(this, options); if (this.id === 'ao3-library-companion') root = surface; else bottomRoot = surface; return surface })
 vi.stubGlobal('__SUPABASE_URL__', 'https://backend.test')
 vi.stubGlobal('__SUPABASE_KEY__', 'sb_publishable_test')
 vi.stubGlobal('__APP_ORIGIN__', 'https://library.test')
 vi.stubGlobal('__SCRIPT_VERSION__', '0.1.0')
 vi.stubGlobal('__BRAND_ICON__', '<svg aria-hidden="true" viewBox="0 0 24 24"></svg>')
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
 const notes = await within(root).findByLabelText('Private Notes')
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
 const restored = await within(root).findByLabelText('Private Notes')
 expect(restored.value).toBe('Keep these notes')
 entry = { version: 'v1', status: 'reading', progress: 3, notes: 'Keep these notes', rating: null, tags: [], collections: [] }
 fireEvent.submit(restored.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 const body = JSON.parse(network.mock.lastCall[0].data)
 expect(body.p_input).toMatchObject({ status: 'reading', progress: 3, notes: 'Keep these notes' })
 expect(storage.has('draft:https://backend.test:alice:123')).toBe(false)
})
it('marks this chapter finished without transmitting or replacing personal fields', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: 'Private', rating: 4, tags: ['Tag'], collections: [] }
 await mount()
 fireEvent.click(findButton('Through Ch. 4'))
 await waitFor(() => expect(network).toHaveBeenCalledTimes(2))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toEqual({ version: 'v1', base: { status: 'reading', progress: 1 }, progress: 4, status: 'reading' })

})
it('offers reconnection on expired authorization without showing a false save confirmation', async () => {
 network.mockResolvedValue({ status: 401, responseText: JSON.stringify({ code: '28000' }) })
 await mount()
 expect(within(root).getByRole('status')).toHaveTextContent('authorization expired or was revoked')
 fireEvent.click(findButton('Connection'))
 expect(await within(root).findByLabelText('One-time pairing code')).toHaveAttribute('type', 'password')
})

async function toggle(name, expanded) {
 await waitFor(() => expect(findButton(name)).toBeEnabled())
 fireEvent.click(findButton(name))
 await waitFor(() => expect(findButton(name)).toHaveAttribute('aria-expanded', String(expanded)))
}
it('collapses and switches panels without losing editor fields or a pairing code', async () => {
 network.mockResolvedValue({ status: 200, responseText: JSON.stringify({ entry: null, collections: [{ id: 'weekend', name: 'Weekend reads' }] }) })
 await mount()
 await toggle('Add to Library', true)
 const fields = within(root)
 fireEvent.change(fields.getByLabelText('Reading Status'), { target: { value: 'to_read' } })
 fireEvent.change(fields.getByLabelText('Current chapter'), { target: { value: '7' } })
 fireEvent.click(fields.getByLabelText('This chapter is finished'))
 fireEvent.input(fields.getByLabelText('Private Notes'), { target: { value: 'Keep my notes' } })
 for (const tag of ['Comfort', 'Weekend']) {
  fireEvent.change(fields.getByLabelText('Personal tags'), { target: { value: tag } })
  fireEvent.keyDown(fields.getByLabelText('Personal tags'), { key: 'Enter' })
 }
 fireEvent.click(fields.getByRole('radio', { name: '4 out of 5 stars' }))
 fireEvent.click(within(root).getByText('Add to custom collection'))
 fireEvent.click(fields.getByLabelText('Weekend reads'))
 await toggle('Add to Library', false)
 expect(fields.getByLabelText('Private Notes')).not.toBeVisible()
 await toggle('Add to Library', true)
 expect(fields.getByLabelText('Private Notes')).toBeVisible()
 await toggle('Connection', true)
 expect(fields.getByLabelText('Private Notes')).not.toBeVisible()
 fireEvent.input(fields.getByLabelText('One-time pairing code'), { target: { value: 'unfinished-code' } })
 await toggle('Connection', false)
 expect(fields.getByLabelText('One-time pairing code')).not.toBeVisible()
 await toggle('Connection', true)
 expect(fields.getByLabelText('One-time pairing code')).toHaveValue('unfinished-code')
 await toggle('Add to Library', true)
 expect(fields.getByLabelText('One-time pairing code')).not.toBeVisible()
 expect(fields.getByLabelText('Reading Status')).toHaveValue('to_read')
 expect(fields.getByLabelText('Current chapter')).toHaveValue(7)
 expect(fields.getByLabelText('This chapter is finished')).toBeChecked()
 expect(fields.getByLabelText('Private Notes')).toHaveValue('Keep my notes')
 expect(fields.getByRole('button', { name: 'Delete personal tag Comfort' })).toBeVisible()
 expect(fields.getByRole('button', { name: 'Delete personal tag Weekend' })).toBeVisible()
 expect(fields.getByRole('radio', { name: '4 out of 5 stars' })).toBeChecked()
 expect(fields.getByLabelText('Weekend reads')).toBeChecked()
 expect(network).toHaveBeenCalledTimes(1)
 fireEvent.click(findButton('Cancel'))
 await waitFor(() => expect(storage.has('draft:https://backend.test:alice:123')).toBe(false))
 await toggle('Add to Library', true)
 expect(fields.getByLabelText('Private Notes')).toHaveValue('')
})
it('reloads unchanged fields, retains local edits, and blocks conflicting notes until resolved', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: 'Original', rating: null, tags: [], collections: [] }
 await mount()
 await toggle('Edit', true)
 const notes = within(root).getByLabelText('Private Notes')
 fireEvent.input(notes, { target: { value: 'My unsaved draft' } })
 entry = { ...entry, version: 'v2', notes: 'Changed elsewhere', rating: 5 }
 fireEvent.click(findButton('Reload saved entry'))
 const review = await within(root).findByRole('region', { name: 'Review conflicting edits' })
 expect(within(review).getByText('My unsaved draft')).toBeInTheDocument()
 expect(within(review).getByText('Changed elsewhere')).toBeInTheDocument()
 expect(notes).toHaveValue('My unsaved draft')
 expect(storage.get('draft:https://backend.test:alice:123').version).toBe('v1')
 expect(findButton('Save')).toBeDisabled()
 expect(within(root).getByRole('radio', { name: '5 out of 5 stars' })).toBeChecked()
 expect(within(review).getByRole('button', { name: 'Save resolved changes' })).toBeDisabled()
 fireEvent.click(within(review).getByLabelText('Edit or combine notes'))
 fireEvent.change(within(review).getByLabelText('Notes to save'), { target: { value: 'Both notes combined' } })
 fireEvent.click(within(review).getByRole('button', { name: 'Save resolved changes' }))
 await waitFor(() => expect(JSON.parse(network.mock.lastCall[0].data).p_action).toBe('save'))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ base: { notes: 'Changed elsewhere' }, notes: 'Both notes combined', rating: 5 })
 await waitFor(() => expect(storage.has('draft:https://backend.test:alice:123')).toBe(false))
})
it('reloads remote notes into an untouched editor without losing a local rating', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: 'Original', rating: null, tags: [], collections: [] }
 await mount(); await toggle('Edit', true)
 fireEvent.click(within(root).getByRole('radio', { name: '4 out of 5 stars' }))
 entry = { ...entry, version: 'v2', notes: 'Desktop notes', tags: ['Desktop tag'], progress: 3 }
 fireEvent.click(findButton('Reload saved entry'))
 await waitFor(() => expect(within(root).getByLabelText('Private Notes')).toHaveValue('Desktop notes'))
 expect(within(root).getByRole('radio', { name: '4 out of 5 stars' })).toBeChecked()
 expect(within(root).getByRole('button', { name: 'Delete personal tag Desktop tag' })).toBeVisible()
 expect(within(root).getByLabelText('Current chapter')).toHaveValue(4)
 expect(storage.get('draft:https://backend.test:alice:123')).toMatchObject({ version: 'v2', base: { notes: 'Desktop notes' }, notes: 'Desktop notes', rating: 4 })
 expect(within(root).queryByRole('region', { name: 'Review conflicting edits' })).not.toBeInTheDocument()
})
it('clears cached panels when changing accounts even if the following load fails', async () => {
 await mount()
 await toggle('Add to Library', true)
 fireEvent.input(within(root).getByLabelText('Private Notes'), { target: { value: 'Alice draft' } })
 await toggle('Connection', true)
 fireEvent.input(within(root).getByLabelText('One-time pairing code'), { target: { value: 'new-account-code' } })
 network.mockResolvedValueOnce({ status: 200, responseText: JSON.stringify({ userId: 'bob', secret: 'bob-device' }) })
 network.mockResolvedValueOnce({ status: 503, responseText: '{}' })
 fireEvent.click(findButton('Connect'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save or load'))
 expect(within(root).queryByLabelText('Private Notes')).not.toBeInTheDocument()
 expect(within(root).queryByLabelText('One-time pairing code')).not.toBeInTheDocument()
 fireEvent.click(findButton('Load saved entry'))
 await waitFor(() => expect(findButton('Add to Library')).toBeEnabled())
 await toggle('Add to Library', true)
 expect(within(root).getByLabelText('Private Notes')).toHaveValue('')
 expect(storage.get('draft:https://backend.test:alice:123').notes).toBe('Alice draft')
})

it.each(['to_read', 'reading', 'paused_reading', 're_reading', 'finished'])('shows chapter fields and saves the correct chapter count for %s', async status => {
 await mount()
 await toggle('Add to Library', true)
 const fields = within(root)
 expect(fields.queryByRole('button', { name: 'Reload saved entry' })).not.toBeInTheDocument()
 fireEvent.change(fields.getByLabelText('Current chapter'), { target: { value: '6' } })
 fireEvent.change(fields.getByLabelText('Reading Status'), { target: { value: status } })
 const chapter = fields.getByLabelText('Current chapter')
 expect(chapter.disabled).toBe(['to_read', 'finished'].includes(status))
 expect(chapter.closest('label').hidden).toBe(['to_read', 'finished'].includes(status))
 expect(fields.getByLabelText('This chapter is finished').closest('label').hidden).toBe(['to_read', 'finished'].includes(status))
 fireEvent.submit(chapter.closest('form'))
 await waitFor(() => expect(JSON.parse(network.mock.lastCall[0].data).p_action).toBe('save'))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ status, progress: status === 'to_read' ? 0 : status === 'finished' ? 10 : 5 })
})
it('searches custom collections without clearing selected or hidden memberships', async () => {
 network.mockResolvedValue({ status: 200, responseText: JSON.stringify({ entry: null, collections: [{ id: 'weekend', name: 'Weekend reads' }, { id: 'night', name: 'Night reads' }] }) })
 await mount()
 await toggle('Add to Library', true)
 const fields = within(root)
 const picker = fields.getByText('Add to custom collection').closest('details')
 expect(picker.open).toBe(false)
 fireEvent.click(fields.getByText('Add to custom collection'))
 fireEvent.click(fields.getByLabelText('Weekend reads'))
 fireEvent.input(fields.getByLabelText('Search custom collections'), { target: { value: 'NIGHT' } })
 expect(fields.getByLabelText('Weekend reads').closest('label').hidden).toBe(true)
 expect(fields.getByLabelText('Night reads').closest('label').hidden).toBe(false)
 fireEvent.click(fields.getByLabelText('Night reads'))
 fireEvent.input(fields.getByLabelText('Search custom collections'), { target: { value: 'missing' } })
 expect(fields.getByText('No matching collections.').hidden).toBe(false)
 expect(storage.get('draft:https://backend.test:alice:123').collections).toEqual(['weekend', 'night'])
 fireEvent.input(fields.getByLabelText('Search custom collections'), { target: { value: '' } })
 expect(fields.getByLabelText('Weekend reads')).toBeChecked()
 expect(fields.getByLabelText('Night reads')).toBeChecked()
})
it('synchronizes an editor draft from the reading bar and keeps progress controls out of pairing', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: '', rating: null, tags: [], collections: [] }
 network.mockImplementation(async request => {
  const { p_action, p_input } = JSON.parse(request.data)
  if (p_action === 'progress') entry = { ...entry, ...p_input, version: 'v2' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 await mount()
 await toggle('Edit', true)
 const fields = within(root)
 fireEvent.input(fields.getByLabelText('Private Notes'), { target: { value: 'Keep my draft' } })
 await toggle('Connection', true)
 const pairing = root.getElementById('library-connection')
 expect(within(pairing).getAllByRole('button').map(button => button.textContent)).toEqual(['Dark Mode', 'Rating Info', 'Connect', 'Disconnect device', 'Close'])
 expect(within(pairing).queryByLabelText('Adjust reading progress')).not.toBeInTheDocument()
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Through Ch. 4' }))
 await waitFor(() => expect(fields.getByText('Ch. 4 / 10')).toBeInTheDocument())
 await toggle('Edit', true)
 expect(fields.getByLabelText('Current chapter')).toHaveValue(5)
 expect(fields.getByLabelText('Private Notes')).toHaveValue('Keep my draft')
 expect(storage.get('draft:https://backend.test:alice:123')).toMatchObject({ chapter: 5, chapterFinished: false, version: 'v2', notes: 'Keep my draft' })
})
it('offers Finish Fic on the actual final AO3 chapter even when tracked progress is earlier', async () => {
 document.getElementById('selected_id').innerHTML = Array.from({ length: 10 }, (_, index) => `<option value="${101 + index}">${index + 1}. Chapter</option>`).join('')
 entry = { version: 'v1', status: 'reading', progress: 1, notes: '', rating: null, tags: [], collections: [] }
 network.mockImplementation(async request => {
  const { p_action, p_input } = JSON.parse(request.data)
  if (p_action === 'progress') entry = { ...entry, ...p_input, version: 'v2' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/110')
 expect(within(root).getByText('Ch. 1 / 10')).toBeInTheDocument()
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Finished' }))
 await waitFor(() => expect(entry).toMatchObject({ status: 'finished', progress: 10 }))
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText('Read')).toBeInTheDocument()
  expect(within(surface).getByText('Finished', { exact: true })).toBeInTheDocument()
  expect(within(surface).queryByRole('button', { name: 'Finished' })).not.toBeInTheDocument()
 }
})
it.each([false, true])('keeps one logo in the main bar when panels open (saved entry: %s)', async saved => {
 if (saved) entry = { id: 'fic-entry', version: 'v1', status: 'reading', progress: 1, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 const footer = within(root).getByText(/AO3 Library v/)
 expect(footer.querySelector('a')).toHaveAttribute('href', 'https://library.test/settings#ios-safari-userscript')
 expect(footer.hidden).toBe(true)
 expect(within(root).getByRole('link', { name: 'View in between chapters library' })).toHaveAttribute('href', saved ? 'https://library.test/stories/fic-entry' : 'https://library.test/library')
 const toolbar = root.querySelector('.library-link').parentElement
 if (saved) {
  const summary = root.querySelector('.reading-summary')
  expect([...summary.children].map(element => element.textContent)).toEqual(['Currently Reading', '•', 'Ch. 1 / 10chapters read'])
  expect([...bottomRoot.querySelector('.reading-summary').children].map(element => element.textContent)).toEqual(['Currently Reading', '•', 'Ch. 1 / 10chapters read'])
  expect(summary.querySelector('.status-bullet')).toHaveAttribute('aria-hidden', 'true')
  expect(root.querySelector('.toolbar-actions')).toContainElement(findButton('Through Ch. 4'))
  expect(root.querySelector('.toolbar-actions')).toContainElement(findButton('Edit'))
  expect(root.querySelector('.toolbar-actions')).toContainElement(findButton('Connection'))
 }
 await toggle('Connection', true)
 expect(root.querySelectorAll('.brand-icon')).toHaveLength(1)
 expect(root.querySelector('.library-link').parentElement).toBe(toolbar)
 expect(footer.hidden).toBe(false)
 await toggle('Connection', false)
 expect(footer.hidden).toBe(true)
})
it('marks the latest WIP chapter read without finishing the fic', async () => {
 document.querySelector('dd.chapters').textContent = '10/?'
 document.getElementById('selected_id').innerHTML = Array.from({ length: 10 }, (_, index) => `<option value="${101 + index}">${index + 1}. Chapter</option>`).join('')
 entry = { version: 'v1', status: 'reading', progress: 9, notes: '', rating: null, tags: [], collections: [] }
 network.mockImplementation(async request => {
  const { p_action, p_input } = JSON.parse(request.data)
  if (p_action === 'progress') entry = { ...entry, ...p_input, version: 'v2' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/110')
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Through Ch. 10' }))
 await waitFor(() => expect(entry).toMatchObject({ status: 'reading', progress: 10 }))
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText('Ch. 10 / 10')).toBeInTheDocument()
  expect(within(surface).getByText('Read')).toBeInTheDocument()
 }
})

it('places only progress controls before kudos and immediately updates both bars, rolling back on failure', async () => {
 entry = { version: 'v1', status: 'reading', progress: 2, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 expect(document.getElementById('kudos').previousElementSibling).toHaveAttribute('id', 'ao3-library-progress')
 expect(within(bottomRoot).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
 expect(within(bottomRoot).queryByRole('button', { name: 'Connection' })).not.toBeInTheDocument()
 let finish
 network.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Through Ch. 4' }))
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText('Ch. 4 / 10')).toBeInTheDocument()
  expect(within(surface).getByText('Read')).toBeInTheDocument()
 }
 finish({ status: 503, responseText: '{}' })
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save'))
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText('Ch. 2 / 10')).toBeInTheDocument()
  expect(within(surface).getByRole('button', { name: 'Through Ch. 4' })).toBeEnabled()
 }
 expect(within(bottomRoot).getByText(/Could not save/)).toBeInTheDocument()
})

it.each([4, 7])('shows a non-clickable completion indicator on a revisited chapter when saved progress is %s', async progress => {
 entry = { version: 'v1', status: 'reading', progress, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText('Read')).toBeInTheDocument()
  expect(within(surface).queryByRole('button', { name: /Through Ch/ })).not.toBeInTheDocument()
 }
 expect(network).toHaveBeenCalledTimes(1)
})

it('mirrors the top bar for unsaved works and omits completion actions for ambiguous full-work pages', async () => {
 await mount()
 expect(document.getElementById('ao3-library-progress')).not.toHaveAttribute('hidden')
 expect(bottomRoot.querySelector('.toolbar').textContent).toBe(root.querySelector('.toolbar').textContent)
 fireEvent.click(within(bottomRoot).getByRole('button',{name:'Add to Library'}))
 await within(root).findByLabelText('Private Notes')
 await waitFor(()=>expect(within(bottomRoot).getByRole('button',{name:'Add to Library'})).toHaveAttribute('aria-expanded','true'))
 document.getElementById('ao3-library-companion').remove()
 entry = { version: 'v1', status: 'reading', progress: 2, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, 'https://archiveofourown.org/works/123?view_full_work=true')
 expect(document.querySelectorAll('#ao3-library-progress')).toHaveLength(1)
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).queryByRole('button', { name: /Through Ch|Finish Fic/ })).not.toBeInTheDocument()
 }
})

it.each(['reading', 'finished'])('shows only connection actions in pairing for %s fics', async status => {
 entry = { version: 'v1', status, progress: status === 'finished' ? 10 : 9, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 await toggle('Connection', true)
 const pairing = root.getElementById('library-connection')
 expect(within(pairing).getAllByRole('button').map(button => button.textContent)).toEqual(['Dark Mode', 'Rating Info', 'Connect', 'Disconnect device', 'Close'])
})

it('recollects current page metadata without saving personal edits or discarding the editor draft', async () => {
 entry = { id: 'entry', version: 'v1', status: 'reading', progress: 1, notes: 'Saved note', rating: 4, tags: ['Saved tag'], collections: [] }
 await mount()
 fireEvent.click(findButton('Edit'))
 const notes = await within(root).findByLabelText('Private Notes')
 fireEvent.input(notes, { target: { value: 'Unsaved note' } })
 document.querySelector('h2.title').textContent = 'New title'
 document.querySelector('dd.chapters').textContent = '12/12'
 network.mockImplementation(async () => ({ status: 200, responseText: JSON.stringify({ entry, collections: [] }) }))
 fireEvent.click(within(root).getByRole('button', { name: 'Collect metadata' }))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Metadata recollected'))
 const request = JSON.parse(network.mock.lastCall[0].data)
 expect(request).toMatchObject({ p_action: 'refresh_metadata', p_input: { version: 'v1', metadata: { title: 'New title', published_chapters: 12, total_chapters: 12 }, chapters: { '4': '104' } } })
 expect(request.p_input).not.toHaveProperty('notes')
 expect(request.p_input).not.toHaveProperty('progress')
 expect(notes.value).toBe('Unsaved note')
 expect(storage.get('draft:https://backend.test:alice:123').notes).toBe('Unsaved note')
 expect(within(root).getByLabelText('Current chapter')).toHaveAttribute('max', '12')
 expect(within(root).getByText('Ch. 1 / 12')).toBeInTheDocument()
 expect(within(bottomRoot).getByText('Ch. 1 / 12')).toBeInTheDocument()
})

it('retains the previous metadata and draft when recollection fails and allows retry', async () => {
 entry = { id: 'entry', version: 'v1', status: 'reading', progress: 1, notes: 'Saved note', rating: null, tags: [], collections: [] }
 await mount()
 fireEvent.click(findButton('Edit'))
 const notes = await within(root).findByLabelText('Private Notes')
 fireEvent.input(notes, { target: { value: 'Keep draft' } })
 document.querySelector('dd.chapters').textContent = '12/12'
 network.mockResolvedValueOnce({ status: 503, responseText: '{}' })
 fireEvent.click(within(root).getByRole('button', { name: 'Collect metadata' }))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save or load'))
 expect(within(root).getByText('Ch. 1 / 10')).toBeInTheDocument()
 expect(notes.value).toBe('Keep draft')
 expect(within(root).getByRole('button', { name: 'Collect metadata' })).toBeEnabled()
 fireEvent.click(within(root).getByRole('button', { name: 'Collect metadata' }))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Metadata recollected'))
 expect(within(root).getByText('Ch. 1 / 12')).toBeInTheDocument()
})

it('requires review for restored legacy drafts without a baseline instead of trusting their version', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: 'Saved notes', rating: null, tags: ['New tag'], collections: [] }
 storage.set('draft:https://backend.test:alice:123', { version: 'v1', status: 'reading', chapter: 2, chapterFinished: false, notes: 'Saved notes', rating: '', tags: 'Old tag', collections: [] })
 await mount(); await toggle('Edit', true)
 fireEvent.click(findButton('Reload saved entry'))
 const review = await within(root).findByRole('region', { name: 'Review conflicting edits' })
 expect(within(review).getByText('Old tag')).toBeVisible()
 expect(within(review).getByText('New tag')).toBeVisible()
 expect(findButton('Save')).toBeDisabled()
 expect(network).toHaveBeenCalledTimes(2)
})

it('persists color mode for both bars across page remounts without saving a library entry', async () => {
 await mount(); await toggle('Connection', true)
 const mode = within(root).getByRole('button', { name: 'Dark Mode' })
 expect(mode.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
 fireEvent.click(mode)
 await waitFor(() => expect(document.getElementById('ao3-library-companion')).toHaveAttribute('data-theme', 'dark'))
 expect(document.getElementById('ao3-library-progress')).toHaveAttribute('data-theme', 'dark')
 expect(storage.get('theme:https://backend.test')).toBe('dark')
 expect(network).toHaveBeenCalledTimes(1)
 document.getElementById('ao3-library-companion').remove()
 await mount(); await toggle('Connection', true)
 expect(within(root).getByRole('button', { name: 'Light Mode' })).toBeEnabled()
 expect(document.getElementById('ao3-library-progress')).toHaveAttribute('data-theme', 'dark')
 fireEvent.click(within(root).getByRole('button', { name: 'Light Mode' }))
 await waitFor(() => expect(document.getElementById('ao3-library-companion')).toHaveAttribute('data-theme', 'light'))
 expect(document.getElementById('ao3-library-progress')).toHaveAttribute('data-theme', 'light')
})
it('keeps the current color mode and permits retry if device storage fails', async () => {
 await mount(); await toggle('Connection', true)
 const mode = within(root).getByRole('button', { name: 'Dark Mode' })
 vi.spyOn(GM, 'setValue').mockRejectedValueOnce(new Error('Unavailable'))
 fireEvent.click(mode)
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save your color mode'))
 expect(mode.querySelector('svg')).toHaveAttribute('aria-hidden', 'true'); expect(mode).toBeEnabled()
 expect(document.getElementById('ao3-library-companion')).toHaveAttribute('data-theme', 'light')
 fireEvent.click(mode)
 await waitFor(() => expect(document.getElementById('ao3-library-companion')).toHaveAttribute('data-theme', 'dark'))
})

it('explains a failed hosted connection without exposing network internals and permits retry', async () => {
 network.mockRejectedValueOnce(new Error('secret-should-not-leak'))
 await mount()
 expect(within(root).getByRole('status')).toHaveTextContent('Cannot reach the library backend')
 expect(within(root).getByRole('status')).toHaveTextContent('backend.test')
 expect(within(root).getByRole('status')).not.toHaveTextContent('secret-should-not-leak')
 fireEvent.click(findButton('Load saved entry'))
 await within(root).findByRole('button', { name: 'Add to Library' })
 expect(network).toHaveBeenCalledTimes(2)
})
it('recognizes status-zero network failures and points local builds at the hosted installation', async () => {
 vi.stubGlobal('__SUPABASE_URL__', 'http://127.0.0.1:54321')
 storage.set('connection:http://127.0.0.1:54321', { secret: 'local-device-secret', userId: 'alice' })
 network.mockResolvedValueOnce({ status: 0, responseText: '' })
 await mount()
 expect(within(root).getByRole('status')).toHaveTextContent('local development server')
 expect(within(root).getByRole('status')).toHaveTextContent('Install the hosted Safari userscript')
 expect(storage.get('connection:http://127.0.0.1:54321')).toEqual({ secret: 'local-device-secret', userId: 'alice' })
})


// jsdom caches descendant visibility when a hidden shadow-DOM panel is opened.
const ratingInfoSave = () => within(root).getByText('Save Rating Info', { selector: 'button' })
const defaultRatingInfo = 'Add how your personal rating system corresponds to the stars here! Edit this text in settings. To hide the info symbol, leave the box blank.'
it('edits rating info beside color mode, persists it, and preserves personal drafts', async () => {
 await mount(); await toggle('Add to Library', true)
 fireEvent.click(within(root).getByRole('radio', { name: '4 out of 5 stars' }))
 fireEvent.change(within(root).getByRole('textbox', { name: 'Personal tags', exact: true }), { target: { value: 'Unfinished tag' } })
 expect(root.querySelector('.rating-info > span')).toHaveTextContent(defaultRatingInfo)
 expect(root.querySelector('.rating-info').previousElementSibling).toHaveTextContent('Clear rating')
 await toggle('Connection', true)
 const settings = root.querySelector('.connection-settings')
 expect(within(settings).getByRole('button', { name: 'Dark Mode' })).toBeVisible()
 expect(within(settings).getByRole('button', { name: 'Rating Info' })).toBeVisible()
 expect(within(root).queryByRole('textbox', { name: 'Rating info text' })).not.toBeInTheDocument()
 await waitFor(() => expect(findButton('Rating Info')).toBeEnabled())
 fireEvent.click(findButton('Rating Info'))
 expect(root.getElementById('library-rating-info').hidden).toBe(false)
 const input = await within(root).findByLabelText('Rating info text')
 expect(input).toHaveValue(defaultRatingInfo)
 expect(root.activeElement).toBe(input)
 const custom = '1 star: Not for me\n5 stars: A favorite <3'
 fireEvent.input(input, { target: { value: custom } })
 await waitFor(() => expect(ratingInfoSave()).toBeEnabled())
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(storage.get('rating-info:https://backend.test')).toBe(custom))
 await toggle('Add to Library', true)
 expect(root.querySelector('.rating-info > span').textContent).toBe(custom)
 expect(within(root).getByRole('radio', { name: '4 out of 5 stars' })).toBeChecked()
 expect(within(root).getByRole('textbox', { name: 'Personal tags', exact: true })).toHaveValue('Unfinished tag')
 expect(network).toHaveBeenCalledTimes(1)
 document.getElementById('ao3-library-companion').remove()
 await mount(); await toggle('Add to Library', true)
 expect(root.querySelector('.rating-info > span').textContent).toBe(custom)
})

it.each(['', ' \n '])('hides rating info when saved text is blank (%j), including after remount', async blank => {
 await mount(); await toggle('Add to Library', true)
 expect(within(root).getByRole('button', { name: 'Personal rating info' })).toBeVisible()
 await toggle('Connection', true)
 await waitFor(() => expect(findButton('Rating Info')).toBeEnabled())
 fireEvent.click(findButton('Rating Info'))
 expect(root.getElementById('library-rating-info').hidden).toBe(false)
 const input = await within(root).findByLabelText('Rating info text')
 fireEvent.input(input, { target: { value: blank } })
 await waitFor(() => expect(ratingInfoSave()).toBeEnabled())
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(storage.get('rating-info:https://backend.test')).toBe(blank))
 await toggle('Add to Library', true)
 expect(within(root).queryByRole('button', { name: 'Personal rating info' })).not.toBeInTheDocument()
 document.getElementById('ao3-library-companion').remove()
 await mount(); await toggle('Connection', true)
 await waitFor(() => expect(findButton('Rating Info')).toBeEnabled())
 fireEvent.click(findButton('Rating Info'))
 expect(await within(root).findByLabelText('Rating info text')).toHaveValue(blank)
 await toggle('Add to Library', true)
 expect(within(root).queryByRole('button', { name: 'Personal rating info' })).not.toBeInTheDocument()
})

it('keeps saved rating info on storage failure and allows retry', async () => {
 storage.set('rating-info:https://backend.test', 'Original explanation')
 await mount(); await toggle('Add to Library', true); await toggle('Connection', true)
 await waitFor(() => expect(findButton('Rating Info')).toBeEnabled())
 fireEvent.click(findButton('Rating Info'))
 expect(root.getElementById('library-rating-info').hidden).toBe(false)
 const input = await within(root).findByLabelText('Rating info text')
 fireEvent.input(input, { target: { value: 'New explanation' } })
 await waitFor(() => expect(ratingInfoSave()).toBeEnabled())
 vi.spyOn(GM, 'setValue').mockRejectedValueOnce(new Error('Unavailable'))
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save your rating info'))
 expect(storage.get('rating-info:https://backend.test')).toBe('Original explanation')
 expect(root.querySelector('.rating-info > span')).toHaveTextContent('Original explanation')
 expect(input).toHaveValue('New explanation')
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(storage.get('rating-info:https://backend.test')).toBe('New explanation'))
 expect(root.querySelector('.rating-info > span')).toHaveTextContent('New explanation')
})

it('offers series selection and individual work details using the existing connected toolbar', async () => {
 document.body.innerHTML = (await import('../server/ao3/fixtures/series.html?raw')).default
 await mountLibrary(document, 'https://archiveofourown.org/series/77')
 expect(JSON.parse(network.mock.calls[0][0].data).p_action).toBe('series_get')
 fireEvent.click(findButton('Add to Library'))
 const notes = await within(root).findByLabelText('Series private notes')
 fireEvent.change(notes, { target: { value: 'Read on vacation' } })
 const checkbox = root.querySelector('input[data-work-choice]')
 const workId = Number(checkbox.dataset.workChoice)
 fireEvent.click(checkbox)
 const details = checkbox.closest('details'); details.open = true
 const workNotes = within(details).getByLabelText(/^Private notes:/)
 fireEvent.change(workNotes, { target: { value: 'Individual reminder' } })
 const status = within(details).getByLabelText(/^Reading status:/)
 fireEvent.change(status, { target: { value: 're_reading' } })
 fireEvent.submit(notes.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 const body = JSON.parse(network.mock.lastCall[0].data)
 expect(body.p_action).toBe('series_save')
 expect(body.p_work).toBe(77)
 expect(body.p_input).toMatchObject({ notes: 'Read on vacation', works: [{ workId, notes: 'Individual reminder', status: 're_reading' }] })
 expect(body.p_input.works).toHaveLength(1)
 expect(storage.has('draft:https://backend.test:alice:series:77')).toBe(false)
})

it('places series controls after the info box and work controls after all tile data', async () => {
 document.body.innerHTML = (await import('../server/ao3/fixtures/series.html?raw')).default
 await mountLibrary(document, 'https://archiveofourown.org/series/77')
 expect(document.querySelector('dl.series.meta').nextElementSibling.id).toBe('ao3-library-companion')
 for (const id of [101, 102]) {
  const host = document.getElementById(`ao3-library-work-${id}`)
  expect(host).not.toBeNull()
  expect(host.parentElement.lastElementChild).toBe(host)
  expect(host.previousElementSibling.matches('dl.stats')).toBe(true)
 }
 expect(network.mock.calls.map(([request]) => JSON.parse(request.data).p_work)).toEqual([77, 101, 102])
})

it('uses only the logo and counts published chapters when the planned total is higher', async () => {
 document.querySelector('dd.chapters').textContent = '10/20'
 entry = { id: 'saved-work', version: 'v1', status: 'reading', progress: 3, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 expect(root.querySelector('.library-link').textContent).toBe('')
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText('Ch. 3 / 10')).toBeInTheDocument()
 }
})
