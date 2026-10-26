import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitFor, within } from '@testing-library/dom'
import { fireEvent } from '@testing-library/react'
import { mountLibrary as mountSharedLibrary } from './bar'
import { statuses } from '../../src/features/library/model'

const mountLibrary = (doc, href, options = {}) => mountSharedLibrary(doc, href, { api: GM, ...options })

let root, bottomRoot, storage, network, entry, accountRatingInfo
beforeEach(() => {
 document.body.innerHTML = '<main id="main"><div id="workskin"><h2 class="title">Test</h2><div class="summary module"><blockquote><p>Work summary.</p></blockquote></div><dl class="work meta"><dd class="chapters">10/10</dd></dl><ul class="work navigation actions"><li class="chapter"><select id="selected_id"><option value="101">1. First</option><option value="102">2. Second</option><option value="103">3. Third</option><option value="104">4. Fourth</option></select></li></ul></div><div id="kudos">Kudos list</div></main>'
 const attach = Element.prototype.attachShadow
 vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (options) { const surface = attach.call(this, options); if (this.id === 'ao3-library-companion') root = surface; else bottomRoot = surface; return surface })
 vi.stubGlobal('__SUPABASE_URL__', 'https://backend.test')
 vi.stubGlobal('__SUPABASE_KEY__', 'sb_publishable_test')
 vi.stubGlobal('__APP_ORIGIN__', 'https://library.test')
 vi.stubGlobal('__SCRIPT_VERSION__', '0.1.0')
 vi.stubGlobal('__BRAND_ICON__', '<svg aria-hidden="true" viewBox="0 0 24 24"></svg>')
 storage = new Map([['connection:https://backend.test', { secret: 'device-secret', userId: 'alice' }]])
 entry = null; accountRatingInfo = null
 network = vi.fn(async ({ data }) => {
  const request = JSON.parse(data)
  if (request.p_action === 'rating_save') accountRatingInfo = request.p_input.text
  return { status: 200, responseText: JSON.stringify({ entry, collections: [], ratingInfo: accountRatingInfo }) }
 })
 vi.stubGlobal('GM', { getValue: async (key, fallback) => storage.get(key) ?? fallback, setValue: async (key, value) => storage.set(key, structuredClone(value)), deleteValue: async key => storage.delete(key), xmlHttpRequest: network })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const mount = () => mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104')
const findButton = name => within(root).getByRole('button', { name })
it.each(['safari', 'chrome'].flatMap(browser => Object.keys(statuses).map(status => ({ browser, status }))))('selects, saves and displays $status on both $browser bars', async ({ browser, status }) => {
 entry = { version: 'v1', status: 'reading', progress: 3, notes: 'Keep notes', rating: 4, tags: ['Mine'], collections: [] }
 network.mockImplementation(async ({ data }) => {
  const request = JSON.parse(data)
  if (request.p_action === 'save') entry = { ...entry, ...request.p_input, version: 'v2' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 await toggle('Edit', true)
 const picker = within(root).getByLabelText('Reading Status')
 expect([...picker.options].map(option => option.value)).toEqual(Object.keys(statuses))
 fireEvent.change(picker, { target: { value: status } })
 fireEvent.submit(picker.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 const progress = status === 'to_read' ? 0 : status === 'finished' ? 10 : 3
 expect(entry).toMatchObject({ status, progress, notes: 'Keep notes', rating: 4, tags: ['Mine'] })
 for (const surface of [root, bottomRoot]) {
  expect(surface.querySelector('.reading-summary strong')).toHaveTextContent(status === 'reading' && browser === 'chrome' ? 'Currently Reading' : statuses[status])
  expect(surface.querySelector('.status-bullet')).toHaveAttribute('data-status', status)
  expect(surface.querySelector('.chapter-progress')).toHaveTextContent(`Ch. ${progress} / 10`)
 }
 await toggle('Edit', true)
 expect(within(root).getByLabelText('Reading Status')).toHaveValue(status)
 await waitFor(() => expect(findButton('Cancel')).toBeEnabled())
})
it.each(['safari', 'chrome'].flatMap(browser => [false, true].map(fromBottom => ({ browser, fromBottom }))))('sends only the loaded chapter count on $browser Mark Read (bottom: $fromBottom)', async ({ browser, fromBottom }) => {
 document.querySelector('#workskin').insertAdjacentHTML('beforeend', '<div id="chapters"><div id="chapter-4" class="chapter"><div class="summary">Private summary</div><div class="userstuff"><p>Only three words.</p></div><div class="notes">Private note</div></div></div>')
 entry = { version: 'v1', status: 're_reading', progress: 3, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 for (const surface of [root, bottomRoot]) {
  expect(surface.querySelector('button.chapter-progress')).toHaveTextContent('Ch. 3 / 10')
  expect(surface.querySelector('.chapter-progress')).not.toHaveAttribute('title')
  expect(within(surface).queryByLabelText('About chapters read')).not.toBeInTheDocument()
 }
 fireEvent.click(within(fromBottom ? bottomRoot : root).getByRole('button', { name: 'Read' }))
 await waitFor(() => expect(network).toHaveBeenCalledTimes(2))
 const request = JSON.parse(network.mock.lastCall[0].data)
 expect(request.p_input).toMatchObject({ status: 're_reading', progress: 4, chapter_read: { chapter: 4, chapter_id: '104', word_count: 3 } })
 expect(network.mock.lastCall[0].data).not.toMatch(/Only three|Private summary|Private note/)
 await waitFor(() => expect(findButton('Read')).toBeEnabled())
})
it.each(['safari', 'chrome'])('captures an explicit chapter-finished editor save on %s', async browser => {
 entry = { version: 'v1', status: 'reading', progress: 3, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 await toggle('Edit', true)
 const finished = within(root).getByLabelText('This Chapter Is Finished')
 fireEvent.click(finished)
 fireEvent.submit(finished.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 const input = JSON.parse(network.mock.lastCall[0].data).p_input
 expect(input).toMatchObject({ progress: 4, chapter_read: { chapter: 4, chapter_id: '104', word_count: null } })
})
it.each(['safari', 'chrome'].flatMap(browser => [false, true].map(fromBottom => ({ browser, fromBottom }))))('prefills the mid-story chapter on $browser (bottom bar: $fromBottom)', async ({ browser, fromBottom }) => {
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 fireEvent.click(within(fromBottom ? bottomRoot : root).getByRole('button', { name: 'Add to Library' }))
 const chapter = await within(root).findByLabelText('Current Chapter')
 expect(chapter).toBeVisible()
 expect(chapter).toHaveValue(4)
 expect(within(root).getByLabelText('Reading Status')).toHaveValue('reading')
 expect(within(root).getByLabelText('This Chapter Is Finished')).not.toBeChecked()
 await waitFor(() => expect(findButton('Cancel')).toBeEnabled())
})

it.each(['safari', 'chrome'].flatMap(browser => (browser === 'chrome' ? ['finished', 'waiting_for_updates'] : ['finished']).flatMap(status => [1, 4, 10].flatMap(chapter => [false, true].map(fromBottom => ({ browser, status, chapter, fromBottom }))))))('starts a reread from $status at chapter $chapter on $browser (bottom bar: $fromBottom)', async ({ browser, status, chapter, fromBottom }) => {
 document.getElementById('selected_id').innerHTML = Array.from({ length: 10 }, (_, index) => `<option value="${101 + index}">${index + 1}. Chapter</option>`).join('')
 entry = { version: 'v1', status, progress: 10, notes: 'Keep My Notes', rating: 5, tags: ['Mine'], collections: [] }
 network.mockImplementation(async ({ data }) => {
  const { p_action, p_input } = JSON.parse(data)
  if (p_action === 'progress') entry = { ...entry, ...p_input, version: 'v2' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 await mountLibrary(document, `https://archiveofourown.org/works/123/chapters/${100 + chapter}`, { browser })
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByRole('button', { name: 'Re-Read' }).querySelector('svg')).not.toBeNull()
 }
 await toggle('Edit', true)
 fireEvent.input(within(root).getByLabelText('Private Notes'), { target: { value: 'Unsaved Notes' } })
 fireEvent.click(within(fromBottom ? bottomRoot : root).getByRole('button', { name: 'Re-Read' }))
 await waitFor(() => expect(within(root).getByLabelText('Reading Status')).toHaveValue('re_reading'))
 expect(within(root).getByLabelText('Current Chapter')).toHaveValue(chapter)
 expect(within(root).getByLabelText('This Chapter Is Finished')).not.toBeChecked()
 expect(within(root).getByLabelText('Private Notes')).toHaveValue('Unsaved Notes')
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toEqual({ version: 'v1', base: { status, progress: 10 }, status: 're_reading', progress: chapter - 1 })
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByRole('button', { name: chapter === 10 ? 'Finish Fic' : 'Read' })).toBeVisible()
 }
 await waitFor(() => expect(findButton('Cancel')).toBeEnabled())
})

it.each([{ browser: 'safari', status: 'finished' }, { browser: 'chrome', status: 'finished' }, { browser: 'chrome', status: 'waiting_for_updates' }])('restores $status and Re-Read in both $browser bars after a failed reread save', async ({ browser, status }) => {
 entry = { version: 'v1', status, progress: 10, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 network.mockResolvedValueOnce({ status: 503, responseText: '{}' })
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Re-Read' }))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save'))
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText(statuses[status], { exact: true })).toBeVisible()
  expect(within(surface).getByText('Ch. 10 / 10')).toBeVisible()
  expect(within(surface).getByRole('button', { name: 'Re-Read' })).toBeEnabled()
 }
})

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
 fireEvent.click(findButton('Read'))
 await waitFor(() => expect(network).toHaveBeenCalledTimes(2))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toEqual({ version: 'v1', base: { status: 'reading', progress: 1 }, progress: 4, status: 'reading', chapter_read: { chapter: 4, chapter_id: '104', word_count: null } })

})
it('offers reconnection on expired authorization without showing a false save confirmation', async () => {
 network.mockResolvedValue({ status: 401, responseText: JSON.stringify({ code: '28000' }) })
 await mount()
 expect(within(root).getByRole('status')).toHaveTextContent('authorization was revoked')
 fireEvent.click(findButton('Connection'))
 expect(await within(root).findByLabelText('One-Time Pairing Code')).toHaveAttribute('type', 'password')
})

it.each(['safari', 'chrome'])('identifies the target library after rejected pairing on %s and keeps the code and draft', async browser => {
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 await toggle('Add to Library', true)
 fireEvent.input(within(root).getByLabelText('Private Notes'), { target: { value: 'Keep My Draft' } })
 await toggle('Connection', true)
 expect(within(root).getByRole('link', { name: 'Library Settings (https://library.test)' })).toHaveAttribute('href', 'https://library.test/settings#ao3-browser-bar')
 const code = within(root).getByLabelText('One-Time Pairing Code')
 fireEvent.input(code, { target: { value: 'fresh-pairing-code' } })
 network.mockResolvedValueOnce({ status: 401, responseText: JSON.stringify({ code: '28000' }) })
 fireEvent.click(findButton('Connect'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Pairing code not accepted by https://library.test'))
 if (browser === 'chrome') expect(within(root).getByRole('status')).toHaveTextContent('Check the selected Hosted / Local environment')
 expect(code).toHaveValue('fresh-pairing-code')
 expect(storage.get('connection:https://backend.test')).toEqual({ secret: 'device-secret', userId: 'alice' })
 expect(storage.get('draft:https://backend.test:alice:123').notes).toBe('Keep My Draft')
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
 fireEvent.change(fields.getByLabelText('Current Chapter'), { target: { value: '7' } })
 fireEvent.click(fields.getByLabelText('This Chapter Is Finished'))
 fireEvent.input(fields.getByLabelText('Private Notes'), { target: { value: 'Keep my notes' } })
 for (const tag of ['Comfort', 'Weekend']) {
  fireEvent.change(fields.getByLabelText('Personal Tags'), { target: { value: tag } })
  fireEvent.keyDown(fields.getByLabelText('Personal Tags'), { key: 'Enter' })
 }
 fireEvent.click(fields.getByRole('radio', { name: '4 Out of 5 Stars' }))
 fireEvent.click(within(root).getByRole('button', { name: 'Add to Collection' }))
 fireEvent.click(fields.getByLabelText('Weekend reads'))
 await toggle('Add to Library', false)
 expect(fields.getByLabelText('Private Notes')).not.toBeVisible()
 await toggle('Add to Library', true)
 expect(fields.getByLabelText('Private Notes')).toBeVisible()
 await toggle('Connection', true)
 expect(fields.getByLabelText('Private Notes')).not.toBeVisible()
 fireEvent.input(fields.getByLabelText('One-Time Pairing Code'), { target: { value: 'unfinished-code' } })
 await toggle('Connection', false)
 expect(fields.getByLabelText('One-Time Pairing Code')).not.toBeVisible()
 await toggle('Connection', true)
 expect(fields.getByLabelText('One-Time Pairing Code')).toHaveValue('unfinished-code')
 await toggle('Add to Library', true)
 expect(fields.getByLabelText('One-Time Pairing Code')).not.toBeVisible()
 expect(fields.getByLabelText('Reading Status')).toHaveValue('to_read')
 expect(fields.getByLabelText('Current Chapter')).toHaveValue(7)
 expect(fields.getByLabelText('This Chapter Is Finished')).toBeChecked()
 expect(fields.getByLabelText('Private Notes')).toHaveValue('Keep my notes')
 expect(fields.getByRole('button', { name: 'Delete Personal Tag Comfort' })).toBeVisible()
 expect(fields.getByRole('button', { name: 'Delete Personal Tag Weekend' })).toBeVisible()
 expect(fields.getByRole('radio', { name: '4 Out of 5 Stars' })).toBeChecked()
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
 fireEvent.click(findButton('Reload Saved Entry'))
 const review = await within(root).findByRole('region', { name: 'Review Conflicting Edits' })
 expect(within(review).getByText('My unsaved draft')).toBeInTheDocument()
 expect(within(review).getByText('Changed elsewhere')).toBeInTheDocument()
 expect(notes).toHaveValue('My unsaved draft')
 expect(storage.get('draft:https://backend.test:alice:123').version).toBe('v1')
 expect(findButton('Save')).toBeDisabled()
 expect(within(root).getByRole('radio', { name: '5 Out of 5 Stars' })).toBeChecked()
 expect(within(review).getByRole('button', { name: 'Save Resolved Changes' })).toBeDisabled()
 fireEvent.click(within(review).getByLabelText('Edit or Combine Notes'))
 fireEvent.change(within(review).getByLabelText('Notes to Save'), { target: { value: 'Both notes combined' } })
 fireEvent.click(within(review).getByRole('button', { name: 'Save Resolved Changes' }))
 await waitFor(() => expect(JSON.parse(network.mock.lastCall[0].data).p_action).toBe('save'))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ base: { notes: 'Changed elsewhere' }, notes: 'Both notes combined', rating: 5 })
 await waitFor(() => expect(storage.has('draft:https://backend.test:alice:123')).toBe(false))
})
it('reloads remote notes into an untouched editor without losing a local rating', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: 'Original', rating: null, tags: [], collections: [] }
 await mount(); await toggle('Edit', true)
 fireEvent.click(within(root).getByRole('radio', { name: '4 Out of 5 Stars' }))
 entry = { ...entry, version: 'v2', notes: 'Desktop notes', tags: ['Desktop tag'], progress: 3 }
 fireEvent.click(findButton('Reload Saved Entry'))
 await waitFor(() => expect(within(root).getByLabelText('Private Notes')).toHaveValue('Desktop notes'))
 expect(within(root).getByRole('radio', { name: '4 Out of 5 Stars' })).toBeChecked()
 expect(within(root).getByRole('button', { name: 'Delete Personal Tag Desktop tag' })).toBeVisible()
 expect(within(root).getByLabelText('Current Chapter')).toHaveValue(4)
 expect(storage.get('draft:https://backend.test:alice:123')).toMatchObject({ version: 'v2', base: { notes: 'Desktop notes' }, notes: 'Desktop notes', rating: 4 })
 expect(within(root).queryByRole('region', { name: 'Review Conflicting Edits' })).not.toBeInTheDocument()
})
it('clears cached panels when changing accounts even if the following load fails', async () => {
 await mount()
 await toggle('Add to Library', true)
 fireEvent.input(within(root).getByLabelText('Private Notes'), { target: { value: 'Alice draft' } })
 await toggle('Connection', true)
 fireEvent.input(within(root).getByLabelText('One-Time Pairing Code'), { target: { value: 'new-account-code' } })
 network.mockResolvedValueOnce({ status: 200, responseText: JSON.stringify({ userId: 'bob', secret: 'bob-device' }) })
 network.mockResolvedValueOnce({ status: 503, responseText: '{}' })
 fireEvent.click(findButton('Connect'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save or load'))
 expect(within(root).queryByLabelText('Private Notes')).not.toBeInTheDocument()
 expect(within(root).queryByLabelText('One-Time Pairing Code')).not.toBeInTheDocument()
 fireEvent.click(findButton('Load Saved Entry'))
 await waitFor(() => expect(findButton('Add to Library')).toBeEnabled())
 await toggle('Add to Library', true)
 expect(within(root).getByLabelText('Private Notes')).toHaveValue('')
 expect(storage.get('draft:https://backend.test:alice:123').notes).toBe('Alice draft')
})

it.each(['to_read', 'reading', 'paused_reading', 're_reading', 'finished'])('shows chapter fields and saves the correct chapter count for %s', async status => {
 await mount()
 await toggle('Add to Library', true)
 const fields = within(root)
 expect(fields.queryByRole('button', { name: 'Reload Saved Entry' })).not.toBeInTheDocument()
 fireEvent.change(fields.getByLabelText('Current Chapter'), { target: { value: '6' } })
 fireEvent.change(fields.getByLabelText('Reading Status'), { target: { value: status } })
 const chapter = fields.getByLabelText('Current Chapter')
 expect(chapter.disabled).toBe(['to_read', 'finished'].includes(status))
 expect(chapter.closest('label').hidden).toBe(['to_read', 'finished'].includes(status))
 expect(fields.getByLabelText('This Chapter Is Finished').closest('label').hidden).toBe(['to_read', 'finished'].includes(status))
 fireEvent.submit(chapter.closest('form'))
 await waitFor(() => expect(JSON.parse(network.mock.lastCall[0].data).p_action).toBe('save'))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ status, progress: status === 'to_read' ? 0 : status === 'finished' ? 10 : 5 })
})
it('searches custom collections without clearing selected or hidden memberships', async () => {
 network.mockResolvedValue({ status: 200, responseText: JSON.stringify({ entry: null, collections: [{ id: 'weekend', name: 'Weekend reads' }, { id: 'night', name: 'Night reads' }] }) })
 await mount()
 await toggle('Add to Library', true)
 const fields = within(root)
 const picker = fields.getByRole('button', { name: 'Add to Collection' })
 expect(picker).toHaveAttribute('aria-expanded', 'false')
 fireEvent.click(fields.getByRole('button', { name: 'Add to Collection' }))
 fireEvent.click(fields.getByLabelText('Weekend reads'))
 fireEvent.input(fields.getByLabelText('Search Custom Collections'), { target: { value: 'NIGHT' } })
 expect(fields.getByLabelText('Weekend reads').closest('label').hidden).toBe(true)
 expect(fields.getByLabelText('Night reads').closest('label').hidden).toBe(false)
 fireEvent.click(fields.getByLabelText('Night reads'))
 fireEvent.input(fields.getByLabelText('Search Custom Collections'), { target: { value: 'missing' } })
 expect(fields.getByText('No matching collections.').hidden).toBe(false)
 expect(storage.get('draft:https://backend.test:alice:123').collections).toEqual(['weekend', 'night'])
 fireEvent.input(fields.getByLabelText('Search Custom Collections'), { target: { value: '' } })
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
 fireEvent.input(fields.getByLabelText('Private Notes'), { target: { value: 'Keep My Draft' } })
 await toggle('Connection', true)
 const pairing = root.getElementById('library-connection')
 expect(within(pairing).getAllByRole('button').map(button => button.textContent)).toEqual(['Dark Mode', 'Rating Info', 'Connect', 'Disconnect Device', 'Close'])
 expect(within(pairing).queryByLabelText('Adjust reading progress')).not.toBeInTheDocument()
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Read' }))
 await waitFor(() => expect(fields.getByText('Ch. 4 / 10')).toBeInTheDocument())
 await toggle('Edit', true)
 expect(fields.getByLabelText('Current Chapter')).toHaveValue(5)
 expect(fields.getByLabelText('Private Notes')).toHaveValue('Keep My Draft')
 expect(storage.get('draft:https://backend.test:alice:123')).toMatchObject({ chapter: 5, chapterFinished: false, version: 'v2', notes: 'Keep My Draft' })
})
it.each(['to_read', 'reading', 're_reading'])('offers Finish Fic on the actual final AO3 chapter with earlier progress and status %s', async status => {
 document.getElementById('selected_id').innerHTML = Array.from({ length: 10 }, (_, index) => `<option value="${101 + index}">${index + 1}. Chapter</option>`).join('')
 entry = { version: 'v1', status, progress: 1, notes: '', rating: null, tags: [], collections: [] }
 network.mockImplementation(async request => {
  const { p_action, p_input } = JSON.parse(request.data)
  if (p_action === 'progress') entry = { ...entry, ...p_input, version: 'v2' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/110')
 expect(within(root).getByText('Ch. 1 / 10')).toBeInTheDocument()
 fireEvent.click(within(bottomRoot).getByRole('button', { name: status === 'to_read' ? 'Mark Read' : 'Finish Fic' }))
 await waitFor(() => expect(entry).toMatchObject({ status: 'finished', progress: 10 }))
 expect(entry.chapter_read).toEqual({ chapter: 10, chapter_id: '110', word_count: null })
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByRole('button', { name: 'Re-Read' })).toBeInTheDocument()
  expect(within(surface).getByText('Finished', { exact: true })).toBeInTheDocument()
  expect(within(surface).queryByRole('button', { name: 'Finish Fic' })).not.toBeInTheDocument()
 }
})
it.each([false, true])('keeps one logo in the main bar when panels open (saved entry: %s)', async saved => {
 if (saved) entry = { id: 'fic-entry', version: 'v1', status: 'reading', progress: 1, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 const footer = within(root).getByText(/AO3 Library v/)
 expect(footer.querySelector('a')).toHaveAttribute('href', 'https://library.test/settings#ios-safari-userscript')
 expect(footer.hidden).toBe(true)
 expect(within(root).getByRole('link', { name: 'View in Between Chapters Library' })).toHaveAttribute('href', saved ? 'https://library.test/stories/fic-entry' : 'https://library.test/library')
 const toolbar = root.querySelector('.library-link').parentElement
 if (saved) {
  const summary = root.querySelector('.reading-summary')
  expect([...summary.children].map(element => element.textContent)).toEqual(['Reading', '•', 'Ch. 1 / 10'])
  expect([...bottomRoot.querySelector('.reading-summary').children].map(element => element.textContent)).toEqual(['Reading', '•', 'Ch. 1 / 10'])
  for (const surface of [root, bottomRoot]) {
   expect(surface.querySelector('button.chapter-progress')).not.toHaveAttribute('title')
   expect(surface.querySelector('.chapter-progress')).toHaveAttribute('aria-label', 'Edit Chapters Read')
   expect(within(surface).queryByLabelText('About chapters read')).not.toBeInTheDocument()
  }
  expect(summary.querySelector('.status-bullet')).toHaveAttribute('aria-hidden', 'true')
  expect(root.querySelector('.toolbar-actions')).toContainElement(findButton('Read'))
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
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Read' }))
 await waitFor(() => expect(entry).toMatchObject({ status: 'waiting_for_updates', progress: 10 }))
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
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Read' }))
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText('Ch. 4 / 10')).toBeInTheDocument()
  expect(within(surface).getByText('Read')).toBeInTheDocument()
 }
 finish({ status: 503, responseText: '{}' })
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save'))
 for (const surface of [root, bottomRoot]) {
  expect(within(surface).getByText('Ch. 2 / 10')).toBeInTheDocument()
  expect(within(surface).getByRole('button', { name: 'Read' })).toBeEnabled()
 }
 expect(within(bottomRoot).getByText(/Could not save/)).toBeInTheDocument()
})

it.each(['safari', 'chrome'].flatMap(browser => [4, 10].map(chapter => ({ browser, chapter }))))('positions chapter completion actions on $browser at chapter $chapter', async ({ browser, chapter }) => {
 document.getElementById('selected_id').innerHTML = Array.from({ length: 10 }, (_, index) => `<option value="${101 + index}">${index + 1}. Chapter</option>`).join('')
 entry = { version: 'v1', status: 'reading', progress: chapter - 1, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, `https://archiveofourown.org/works/123/chapters/${100 + chapter}`, { browser })
 for (const surface of [root, bottomRoot]) {
  const action = within(surface).getByRole('button', { name: chapter === 10 ? 'Finish Fic' : 'Read' })
  if (browser === 'chrome') {
   expect(action.previousElementSibling).toHaveClass('chapter-progress')
   expect(surface.querySelector('.reading-summary')).toContainElement(action)
  } else expect(surface.querySelector('.reading-summary')).not.toContainElement(action)
 }
})

it.each(['safari', 'chrome'].flatMap(browser => [4, 7].map(progress => ({ browser, progress }))))('shows a non-clickable completion indicator beside the chapter count on $browser when saved progress is $progress', async ({ browser, progress }) => {
 entry = { version: 'v1', status: 'reading', progress, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 for (const surface of [root, bottomRoot]) {
  const indicator = surface.querySelector('.completion-indicator')
  expect(indicator).toHaveTextContent(/^Read$/)
  expect(indicator.previousElementSibling).toHaveClass('chapter-progress')
  expect(surface.querySelector('.reading-summary')).toContainElement(indicator)
  expect(within(surface).queryByRole('button', { name: /^Read$/ })).not.toBeInTheDocument()
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
  expect(within(surface).queryByRole('button', { name: /^(Read|Finish Fic)$/ })).not.toBeInTheDocument()
 }
})

it.each(['reading', 'finished'])('shows only connection actions in pairing for %s fics', async status => {
 entry = { version: 'v1', status, progress: status === 'finished' ? 10 : 9, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 await toggle('Connection', true)
 const pairing = root.getElementById('library-connection')
 expect(within(pairing).getAllByRole('button').map(button => button.textContent)).toEqual(['Dark Mode', 'Rating Info', 'Connect', 'Disconnect Device', 'Close'])
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
 fireEvent.click(within(root).getByRole('button', { name: 'Collect Metadata' }))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Metadata recollected'))
 const request = JSON.parse(network.mock.lastCall[0].data)
 expect(request).toMatchObject({ p_action: 'refresh_metadata', p_input: { version: 'v1', metadata: { title: 'New title', published_chapters: 12, total_chapters: 12 }, chapters: { '4': '104' } } })
 expect(request.p_input).not.toHaveProperty('notes')
 expect(request.p_input).not.toHaveProperty('progress')
 expect(notes.value).toBe('Unsaved note')
 expect(storage.get('draft:https://backend.test:alice:123').notes).toBe('Unsaved note')
 expect(within(root).getByLabelText('Current Chapter')).toHaveAttribute('max', '12')
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
 fireEvent.click(within(root).getByRole('button', { name: 'Collect Metadata' }))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save or load'))
 expect(within(root).getByText('Ch. 1 / 10')).toBeInTheDocument()
 expect(notes.value).toBe('Keep draft')
 expect(within(root).getByRole('button', { name: 'Collect Metadata' })).toBeEnabled()
 fireEvent.click(within(root).getByRole('button', { name: 'Collect Metadata' }))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Metadata recollected'))
 expect(within(root).getByText('Ch. 1 / 12')).toBeInTheDocument()
})

it('requires review for restored legacy drafts without a baseline instead of trusting their version', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: 'Saved notes', rating: null, tags: ['New tag'], collections: [] }
 storage.set('draft:https://backend.test:alice:123', { version: 'v1', status: 'reading', chapter: 2, chapterFinished: false, notes: 'Saved notes', rating: '', tags: 'Old tag', collections: [] })
 await mount(); await toggle('Edit', true)
 fireEvent.click(findButton('Reload Saved Entry'))
 const review = await within(root).findByRole('region', { name: 'Review Conflicting Edits' })
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
 fireEvent.click(findButton('Load Saved Entry'))
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
 fireEvent.click(within(root).getByRole('radio', { name: '4 Out of 5 Stars' }))
 fireEvent.change(within(root).getByRole('textbox', { name: 'Personal Tags', exact: true }), { target: { value: 'Unfinished tag' } })
 expect(root.querySelector('.rating-info > span')).toHaveTextContent(defaultRatingInfo)
 expect(root.querySelector('.rating-info').previousElementSibling).toHaveTextContent('Clear Rating')
 await toggle('Connection', true)
 const settings = root.querySelector('.connection-settings')
 expect(within(settings).getByRole('button', { name: 'Dark Mode' })).toBeVisible()
 expect(within(settings).getByRole('button', { name: 'Rating Info' })).toBeVisible()
 expect(within(root).queryByRole('textbox', { name: 'Rating Info Text' })).not.toBeInTheDocument()
 await waitFor(() => expect(findButton('Rating Info')).toBeEnabled())
 fireEvent.click(findButton('Rating Info'))
 await waitFor(() => expect(root.getElementById('library-rating-info').hidden).toBe(false))
 const input = await within(root).findByLabelText('Rating Info Text')
 expect(input).toHaveValue(defaultRatingInfo)
 expect(root.activeElement).toBe(input)
 const custom = '1 star: Not for me\n5 stars: A favorite <3'
 fireEvent.input(input, { target: { value: custom } })
 await waitFor(() => expect(ratingInfoSave()).toBeEnabled())
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(accountRatingInfo).toBe(custom))
 await toggle('Add to Library', true)
 expect(root.querySelector('.rating-info > span').textContent).toBe(custom)
 expect(within(root).getByRole('radio', { name: '4 Out of 5 Stars' })).toBeChecked()
 expect(within(root).getByRole('textbox', { name: 'Personal Tags', exact: true })).toHaveValue('Unfinished tag')
 expect(network.mock.calls.some(([request]) => JSON.parse(request.data).p_action === 'rating_save')).toBe(true)
 document.getElementById('ao3-library-companion').remove()
 await mount(); await toggle('Add to Library', true)
 expect(root.querySelector('.rating-info > span').textContent).toBe(custom)
})

it.each(['', ' \n '])('hides rating info when saved text is blank (%j), including after remount', async blank => {
 await mount(); await toggle('Add to Library', true)
 expect(within(root).getByRole('button', { name: 'Personal Rating Info' })).toBeVisible()
 await toggle('Connection', true)
 await waitFor(() => expect(findButton('Rating Info')).toBeEnabled())
 fireEvent.click(findButton('Rating Info'))
 await waitFor(() => expect(root.getElementById('library-rating-info').hidden).toBe(false))
 const input = await within(root).findByLabelText('Rating Info Text')
 fireEvent.input(input, { target: { value: blank } })
 await waitFor(() => expect(ratingInfoSave()).toBeEnabled())
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(accountRatingInfo).toBe(blank))
 await toggle('Add to Library', true)
 expect(within(root).queryByRole('button', { name: 'Personal Rating Info' })).not.toBeInTheDocument()
 document.getElementById('ao3-library-companion').remove()
 await mount(); await toggle('Connection', true)
 await waitFor(() => expect(findButton('Rating Info')).toBeEnabled())
 fireEvent.click(findButton('Rating Info'))
 expect(await within(root).findByLabelText('Rating Info Text')).toHaveValue(blank)
 await toggle('Add to Library', true)
 expect(within(root).queryByRole('button', { name: 'Personal Rating Info' })).not.toBeInTheDocument()
})

it('keeps saved rating info on network failure and allows retry', async () => {
 accountRatingInfo = 'Original explanation'
 await mount(); await toggle('Add to Library', true); await toggle('Connection', true)
 await waitFor(() => expect(findButton('Rating Info')).toBeEnabled())
 fireEvent.click(findButton('Rating Info'))
 await waitFor(() => expect(root.getElementById('library-rating-info').hidden).toBe(false))
 const input = await within(root).findByLabelText('Rating Info Text')
 fireEvent.input(input, { target: { value: 'New explanation' } })
 await waitFor(() => expect(ratingInfoSave()).toBeEnabled())
 network.mockResolvedValueOnce({ status: 503, responseText: '{}' })
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save your rating info'))
 expect(accountRatingInfo).toBe('Original explanation')
 expect(root.querySelector('.rating-info > span')).toHaveTextContent('Original explanation')
 expect(input).toHaveValue('New explanation')
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(accountRatingInfo).toBe('New explanation'))
 expect(root.querySelector('.rating-info > span')).toHaveTextContent('New explanation')
})

it('offers series selection and individual work details using the existing connected toolbar', async () => {
 document.body.innerHTML = (await import('../../server/ao3/fixtures/series.html?raw')).default
 await mountLibrary(document, 'https://archiveofourown.org/series/77')
 expect(JSON.parse(network.mock.calls[0][0].data).p_action).toBe('series_get')
 fireEvent.click(findButton('Add to Library'))
 const notes = await within(root).findByLabelText('Series Private Notes')
 fireEvent.change(notes, { target: { value: 'Read on vacation' } })
 const checkbox = root.querySelector('input[data-work-choice]')
 const workId = Number(checkbox.dataset.workChoice)
 fireEvent.click(checkbox)
 const details = checkbox.closest('label').nextElementSibling; details.open = true
 const workNotes = within(details).getByLabelText(/^Private Notes:/)
 fireEvent.change(workNotes, { target: { value: 'Individual reminder' } })
 const status = within(details).getByLabelText(/^Reading Status:/)
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
 document.body.innerHTML = (await import('../../server/ao3/fixtures/series.html?raw')).default
 document.querySelector('.series.work.index li.work dl.stats').insertAdjacentHTML('beforeend', '<dd class="kudos">42</dd>')
 await mountLibrary(document, 'https://archiveofourown.org/series/77')
 expect(document.getElementById('series-stats').nextElementSibling.id).toBe('ao3-library-companion')
 expect(document.querySelector('.series.work.index').previousElementSibling.id).toBe('ao3-library-companion')
 expect(document.getElementById('ao3-library-progress')).toBeNull()
 for (const id of [101, 102]) {
  const host = document.getElementById(`ao3-library-work-${id}`)
  expect(host).not.toBeNull()
  expect(host.parentElement.lastElementChild).toBe(host)
  expect(host.parentElement.querySelectorAll('[id^="ao3-library-"]')).toHaveLength(1)
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

it('centers the disconnected Chrome instructions in the collapsed row and reuses them when expanded', async () => {
 storage.clear()
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser: 'chrome' })
 const footer = within(root).getByText(/AO3 Library v/)
 expect(root.querySelector('.toolbar-progress')).toContainElement(footer)
 expect(footer).toHaveClass('inline-instructions')
 fireEvent.click(findButton('Connect Library'))
 await waitFor(() => expect(footer.parentElement).toBe(root.querySelector('section')))
 expect(footer).not.toHaveClass('inline-instructions')
 fireEvent.click(findButton('Close'))
 await waitFor(() => expect(root.querySelector('.toolbar-progress')).toContainElement(footer))
 expect(root.querySelectorAll('small')).toHaveLength(1)
})


it('recaptures complete metadata at save time instead of storing the initial page snapshot', async () => {
 await mount()
 fireEvent.click(findButton('Add to Library'))
 const notes = await within(root).findByLabelText('Private Notes')
 document.querySelector('.summary blockquote').innerHTML = '<p>Updated <em>work summary</em>.</p>'
 document.querySelector('dl.work.meta').insertAdjacentHTML('beforeend', '<dd class="category tags"><a class="tag">M/M</a></dd><dd class="language">English</dd><dd class="kudos">42</dd><dd class="bookmarks">0</dd><dd class="comments">12</dd><dd class="hits">1,234</dd>')
 fireEvent.submit(notes.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 const payload = JSON.parse(network.mock.lastCall[0].data)
 expect(payload.p_input.metadata).toMatchObject({ summary: 'Updated work summary.', summary_html: '<p>Updated <em>work summary</em>.</p>', categories: ['M/M'], language: 'English', kudos: 42, bookmark_count: 0, comment_count: 12, hits: 1234 })
})

it('saves the fetched work summary from a later chapter without changing the selected progress', async () => {
 document.querySelector('.summary blockquote').textContent = ''
 document.querySelector('#workskin').insertAdjacentHTML('beforeend', '<div id="chapters"><div class="chapter"><div class="summary module"><blockquote>Chapter summary only</blockquote></div>PRIVATE CHAPTER TEXT</div></div>')
 const fetcher = vi.fn().mockResolvedValue({ ok: true, url: 'https://archiveofourown.org/works/123?view_adult=true', text: async () => '<h2 class="title">Test</h2><div class="summary module"><blockquote><p>Work <em>summary</em>.</p><p>Second<br>line.</p></blockquote></div><dl class="work meta"><dd class="chapters">6/?</dd></dl>' })
 vi.stubGlobal('fetch', fetcher)
 await mount()
 fireEvent.click(findButton('Add to Library'))
 const notes = await within(root).findByLabelText('Private Notes')
 fireEvent.input(notes, { target: { value: 'My notes' } })
 fireEvent.submit(notes.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 const payload = JSON.parse(network.mock.lastCall[0].data)
 expect(payload.p_input).toMatchObject({ status: 'reading', progress: 3, notes: 'My notes', metadata: { summary: 'Work summary.\n\nSecond\nline.', summary_html: '<p>Work <em>summary</em>.</p><p>Second<br>line.</p>', published_chapters: 10, total_chapters: 10 } })
 expect(fetcher).toHaveBeenCalledTimes(1)
 expect(JSON.stringify(payload)).not.toMatch(/Chapter summary only|PRIVATE CHAPTER TEXT/)
})

it('preserves a later-chapter draft and does not save when the work summary request fails', async () => {
 document.querySelector('.summary').remove()
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
 await mount()
 fireEvent.click(findButton('Add to Library'))
 const notes = await within(root).findByLabelText('Private Notes')
 fireEvent.input(notes, { target: { value: 'Keep this draft' } })
 fireEvent.submit(notes.closest('form'))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not collect the work metadata'))
 expect(notes).toHaveValue('Keep this draft')
 expect(network.mock.calls.map(([request]) => JSON.parse(request.data).p_action)).toEqual(['get'])
 expect(findButton('Save')).toBeEnabled()
})

it.each(['safari', 'chrome'])('uses Add/Edit Collection controls without an Add heading in %s', async browser => {
 network.mockResolvedValue({ status: 200, responseText: JSON.stringify({ entry: null, collections: [{ id: 'weekend', name: 'Weekend reads' }] }) })
 await mountLibrary(document, 'https://archiveofourown.org/works/123', { browser })
 await toggle('Add to Library', true)
 expect(root.querySelector('#library-editor h3')).toBeNull()
 const add = findButton('Add to Collection')
 await waitFor(() => expect(add).toBeEnabled())
 fireEvent.click(add)
 await waitFor(() => expect(add).toHaveAttribute('aria-expanded', 'true'))
 fireEvent.click(within(root).getByLabelText('Weekend reads'))
 expect(findButton('Edit Collections')).toBe(add)
 expect(root.querySelector('.collection-names')).toHaveTextContent('Weekend reads')
 await waitFor(() => expect(within(root).getByText('Done')).toBeEnabled())
 fireEvent.click(within(root).getByText('Done'))
 expect(add).toHaveAttribute('aria-expanded', 'false')
 await waitFor(() => expect(add).toBeEnabled())
 fireEvent.click(add)
 expect(within(root).getByLabelText('Weekend reads')).toBeChecked()
 fireEvent.click(within(root).getByLabelText('Weekend reads'))
 expect(findButton('Add to Collection')).toBe(add)
})
it.each(['safari', 'chrome'])('places series work disclosures below names and explains Reload Saved Series in %s', async browser => {
 document.body.innerHTML = (await import('../../server/ao3/fixtures/series.html?raw')).default
 entry = { version: 'v1', notes: '', favorite: false, collections: [] }
 await mountLibrary(document, 'https://archiveofourown.org/series/77', { browser })
 fireEvent.click(findButton('Edit'))
 await within(root).findByLabelText('Series Private Notes')
 expect(root.querySelector('#library-editor h3')).toBeNull()
 const choice = root.querySelector('[data-work-choice]').closest('label')
 expect(choice.nextElementSibling.tagName).toBe('DETAILS')
 expect(choice.nextElementSibling.querySelector('summary')).toHaveTextContent('Details Below Apply Only to This Work When Selected.')
 const help = within(root).getByLabelText('About Reload Saved Series')
 fireEvent.click(help)
 expect(help.closest('details')).toHaveTextContent('Reloading does not save your draft or refresh AO3 metadata.')
 expect(findButton('Save Series and Selected Works')).toBeVisible()
})

it.each(['safari', 'chrome'])('marks To Read and Paused chapters as read in both bars on %s', async browser => {
 for (const status of ['reading', 'paused_reading', 'to_read']) {
  document.getElementById('ao3-library-companion')?.remove()
  entry = { version: 'v1', status, progress: 1, notes: 'Keep', rating: 3, tags: [], collections: [] }
  await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
  const label = status === 'reading' ? 'Read' : 'Mark Read'
  expect(within(root).getByRole('button', { name: label })).toBeVisible()
  const complete = within(bottomRoot).getByRole('button', { name: label })
  network.mockImplementationOnce(async ({ data }) => {
   const request = JSON.parse(data)
   expect(request.p_input).toMatchObject({ status: 'reading', progress: 4 })
   entry = { ...entry, ...request.p_input, version: 'v2' }
   return { status: 200, responseText: JSON.stringify({ entry, collections: [], ratingInfo: null }) }
  })
  fireEvent.click(complete)
  await waitFor(() => expect(root.querySelector('.completion-indicator')).toHaveTextContent('Read'))
  expect(bottomRoot.querySelector('.completion-indicator')).toHaveTextContent('Read')
  expect(within(root).queryByRole('button', { name: label })).not.toBeInTheDocument()
 }
})
it.each(['safari', 'chrome'])('finishes a To Read one-shot when its chapter is marked read on %s', async browser => {
 document.querySelector('dd.chapters').textContent = '1/1'
 document.querySelector('#selected_id').remove()
 entry = { version: 'v1', status: 'to_read', progress: 0, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, 'https://archiveofourown.org/works/123', { browser })
 expect(findButton('Start Reading')).toBeVisible()
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Mark Read' }))
 await waitFor(() => expect(network).toHaveBeenCalledTimes(2))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ status: 'finished', progress: 1 })
})
it.each(['safari', 'chrome'].flatMap(browser => ['reading', 're_reading', 'waiting_for_updates'].map(status => ({ browser, status }))))('pauses and resumes $status in $browser without changing chapters or personal fields', async ({ browser, status }) => {
 entry = { version: 'v1', status, progress: 3, notes: 'Keep', rating: 5, tags: ['mine'], collections: [] }
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 network.mockImplementation(async ({ data }) => {
  const request = JSON.parse(data)
  expect(Object.keys(request.p_input).sort()).toEqual(['base', 'progress', 'status', 'version'])
  const previous = entry.status
  entry = { ...entry, ...request.p_input, version: 'v2', readingHistory: [{ action: 'paused_reading', previous_status: previous === 'paused_reading' ? status : previous }] }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 for (const surface of [root, bottomRoot]) {
  const pause = within(surface).getByRole('button', { name: 'Pause Reading' })
  expect(pause.textContent).toBe('Pause')
  expect(pause.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
 }
 expect(findButton('Pause Reading').nextElementSibling).toBe(findButton('Edit'))
 fireEvent.click(findButton('Pause Reading'))
 await waitFor(() => expect(findButton('Resume Reading')).toBeEnabled())
 expect(entry).toMatchObject({ status: 'paused_reading', progress: 3, notes: 'Keep', rating: 5 })
 expect(within(bottomRoot).queryByRole('button', { name: 'Resume Reading' })).not.toBeInTheDocument()
 fireEvent.click(findButton('Resume Reading'))
 await waitFor(() => expect(entry.status).toBe(status === 're_reading' ? 're_reading' : 'reading'))
 expect(entry.progress).toBe(3)
})
it.each(['to_read', 'finished'])('keeps pause controls out of Safari bars for %s', async status => {
 entry = { version: 'v1', status, progress: 2, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 for (const surface of [root, bottomRoot]) expect(within(surface).queryByRole('button', { name: 'Pause Reading' })).not.toBeInTheDocument()
})
it('loads account rating text on focus and never replaces unsaved story fields', async () => {
 await mount(); await toggle('Add to Library', true)
 const notes = within(root).getByLabelText('Private Notes')
 fireEvent.input(notes, { target: { value: 'My draft' } })
 accountRatingInfo = 'Changed in the app'
 window.dispatchEvent(new Event('focus'))
 await waitFor(() => expect(root.querySelector('.rating-info > span')).toHaveTextContent(accountRatingInfo))
 expect(notes).toHaveValue('My draft')
})
it('can explicitly copy an older device-only explanation into the shared account setting', async () => {
 storage.set('rating-info:https://backend.test', 'My previous stars')
 await mount(); await toggle('Connection', true)
 fireEvent.click(findButton('Rating Info'))
 await waitFor(() => expect(root.getElementById('library-rating-info').hidden).toBe(false))
 fireEvent.click(within(root).getByText('Use This Device’s Previous Explanation', { selector: 'button' }))
 expect(within(root).getByLabelText('Rating Info Text')).toHaveValue('My previous stars')
 expect(accountRatingInfo).toBeNull()
 await waitFor(() => expect(ratingInfoSave()).toBeEnabled())
 fireEvent.click(ratingInfoSave())
 await waitFor(() => expect(accountRatingInfo).toBe('My previous stars'))
})

it.each(['safari', 'chrome'].flatMap(browser => [false, true].map(fromBottom => ({ browser, fromBottom }))))('edits chapters read from the $browser count (bottom: $fromBottom) without saving personal edits', async ({ browser, fromBottom }) => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: 'Saved notes', rating: 4, tags: ['Mine'], collections: [] }
 network.mockImplementation(async ({ data }) => {
  const request = JSON.parse(data)
  if (request.p_action === 'progress') entry = { ...entry, ...request.p_input, version: 'v2' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 fireEvent.click(findButton('Edit'))
 const notes = await within(root).findByLabelText('Private Notes')
 fireEvent.input(notes, { target: { value: 'Unsaved notes' } })
 await waitFor(() => expect(findButton('Edit')).toBeEnabled())
 fireEvent.click(within(fromBottom ? bottomRoot : root).getByRole('button', { name: 'Edit Chapters Read' }))
 const dialog = await within(root).findByRole('dialog', { name: 'Edit Chapter Progress' })
 const chapters = within(dialog).getByRole('spinbutton', { name: 'Chapters Read' })
 expect(chapters).toHaveValue(1)
 expect(chapters).toHaveAttribute('min', '0')
 expect(chapters).toHaveAttribute('max', '10')
 await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save Progress' })).toBeEnabled())
 fireEvent.input(chapters, { target: { value: '4' } })
 fireEvent.submit(chapters.closest('form'))
 await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
 expect(JSON.parse(network.mock.lastCall[0].data)).toMatchObject({ p_action: 'progress', p_input: { version: 'v1', base: { status: 'reading', progress: 1 }, progress: 4, status: 'reading' } })
 expect(Object.keys(JSON.parse(network.mock.lastCall[0].data).p_input).sort()).toEqual(['base', 'progress', 'status', 'version'])
 for (const surface of [root, bottomRoot]) {
  expect(surface.querySelector('.chapter-progress')).toHaveTextContent('Ch. 4 / 10')
  expect(surface.querySelector('.completion-indicator')).toHaveTextContent('Read')
 }
 expect(notes).toHaveValue('Unsaved notes')
 expect(within(root).getByLabelText('Current Chapter')).toHaveValue(5)
 expect(entry.notes).toBe('Saved notes')
})

it('keeps invalid and failed progress edits open for correction and retry', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 fireEvent.click(findButton('Edit Chapters Read'))
 const dialog = await within(root).findByRole('dialog', { name: 'Edit Chapter Progress' })
 const chapters = within(dialog).getByRole('spinbutton', { name: 'Chapters Read' })
 await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save Progress' })).toBeEnabled())
 for (const value of ['', '-1', '2.5', '11']) {
  fireEvent.input(chapters, { target: { value } })
  fireEvent.submit(chapters.closest('form'))
  await waitFor(() => expect(within(dialog).getByRole('alert')).not.toBeEmptyDOMElement())
  expect(dialog).toHaveAttribute('open')
  expect(network).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save Progress' })).toBeEnabled())
 }
 network.mockResolvedValueOnce({ status: 503, responseText: '{}' })
 fireEvent.input(chapters, { target: { value: '4' } })
 fireEvent.submit(chapters.closest('form'))
 await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Could not save'))
 expect(dialog).toHaveAttribute('open')
 expect(chapters).toHaveValue(4)
 expect(root.querySelector('.chapter-progress')).toHaveTextContent('Ch. 1 / 10')
 network.mockImplementationOnce(async ({ data }) => ({ status: 200, responseText: JSON.stringify({ entry: { ...entry, ...JSON.parse(data).p_input, version: 'v2' }, collections: [] }) }))
 await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save Progress' })).toBeEnabled())
 fireEvent.submit(chapters.closest('form'))
 await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
 expect(root.querySelector('.chapter-progress')).toHaveTextContent('Ch. 4 / 10')
})

it.each(['Cancel', 'Escape'])('dismisses the chapter editor with %s without saving', async dismissal => {
 entry = { version: 'v1', status: 'reading', progress: 2, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 fireEvent.click(findButton('Edit Chapters Read'))
 const dialog = await within(root).findByRole('dialog', { name: 'Edit Chapter Progress' })
 await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled())
 fireEvent.input(within(dialog).getByRole('spinbutton'), { target: { value: '5' } })
 if (dismissal === 'Cancel') fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
 else fireEvent(dialog, new Event('cancel', { cancelable: true }))
 await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
 expect(network).toHaveBeenCalledTimes(1)
 expect(root.querySelector('.chapter-progress')).toHaveTextContent('Ch. 2 / 10')
})

it.each([{ status: 'to_read', progress: 0, value: '3', expected: 'reading' }, { status: 'finished', progress: 10, value: '3', expected: 'reading' }, { status: 'paused_reading', progress: 2, value: '3', expected: 'paused_reading' }, { status: 're_reading', progress: 2, value: '0', expected: 're_reading' }])('keeps a consistent reading status when changing $status progress to $value', async ({ status, progress, value, expected }) => {
 entry = { version: 'v1', status, progress, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 fireEvent.click(findButton('Edit Chapters Read'))
 const dialog = await within(root).findByRole('dialog', { name: 'Edit Chapter Progress' })
 await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save Progress' })).toBeEnabled())
 const input = within(dialog).getByRole('spinbutton')
 fireEvent.input(input, { target: { value } })
 fireEvent.submit(input.closest('form'))
 await waitFor(() => expect(network).toHaveBeenCalledTimes(2))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ progress: Number(value), status: expected })
})

it('closes the progress popup so conflicting edits can be reviewed', async () => {
 entry = { version: 'v1', status: 'reading', progress: 1, notes: '', rating: null, tags: [], collections: [] }
 await mount()
 fireEvent.click(findButton('Edit Chapters Read'))
 const dialog = await within(root).findByRole('dialog', { name: 'Edit Chapter Progress' })
 await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save Progress' })).toBeEnabled())
 const base = { status: 'reading', progress: 2 }, local = { status: 'reading', progress: 4 }
 network.mockResolvedValueOnce({ status: 409, responseText: JSON.stringify({ code: '40001', details: JSON.stringify({ base, merged: local, conflicts: [{ field: 'reading', base: { status: 'reading', progress: 1 }, saved: base, local }] }) }) })
 const input = within(dialog).getByRole('spinbutton')
 fireEvent.input(input, { target: { value: '4' } })
 fireEvent.submit(input.closest('form'))
 const review = await within(root).findByRole('region', { name: 'Review Conflicting Edits' })
 expect(dialog).not.toHaveAttribute('open')
 expect(review).toBeVisible()
 expect(findButton('Edit Chapters Read')).toBeDisabled()
 expect(input).toHaveValue(4)
})

it.each(['safari', 'chrome'].flatMap(browser => [false, true].map(fromBottom => ({ browser, fromBottom }))))('quick-saves an unsaved work as To Read on $browser (bottom: $fromBottom)', async ({ browser, fromBottom }) => {
 network.mockImplementation(async ({ data }) => {
  const request = JSON.parse(data)
  if (request.p_action === 'save') entry = { ...request.p_input, id: 'quick-entry', version: 'v1' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 const surface = fromBottom ? bottomRoot : root
 const add = within(surface).getByRole('button', { name: 'Add to Library' })
 const toRead = within(surface).getByRole('button', { name: 'To Read', exact: true })
 expect(add.nextElementSibling).toBe(toRead)
 fireEvent.click(toRead)
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 expect(entry).toMatchObject({ status: 'to_read', progress: 0, notes: '', tags: [], collections: [], metadata: { title: 'Test' } })
 for (const bar of [root, bottomRoot]) expect(within(bar).queryByRole('button', { name: 'To Read', exact: true })).not.toBeInTheDocument()
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).not.toHaveProperty('chapter_read')
})

it.each(['safari', 'chrome'].flatMap(browser => ['/tags/Naruto/works', '/users/Reader/pseuds/Reader', '/works/search', '/users/Reader/bookmarks'].map(path => ({ browser, path }))))('mounts reusable work tile bars on $browser $path without duplicates', async ({ browser, path }) => {
 document.body.innerHTML = (await import('../../server/ao3/fixtures/series.html?raw')).default
 document.querySelector('.series.work.index').className = 'work index'
 const first = document.querySelector('li.work.blurb')
 first.after(first.cloneNode(true))
 const surfaces = new Map()
 const attach = vi.mocked(Element.prototype.attachShadow).getMockImplementation()
 vi.mocked(Element.prototype.attachShadow).mockImplementation(function (options) { const surface = attach.call(this, options); surfaces.set(this.id, surface); return surface })
 await mountLibrary(document, `https://archiveofourown.org${path}`, { browser })
 const hosts = [...document.querySelectorAll('[data-work-tile]')]
 expect(hosts).toHaveLength(3)
 expect(new Set(hosts.map(host => host.id)).size).toBe(3)
 expect(document.getElementById('ao3-library-companion')).toBeNull()
 for (const host of hosts) {
  expect(within(surfaces.get(host.id)).getByRole('button', { name: 'Add to Library' })).toBeVisible()
  expect(within(surfaces.get(host.id)).getByRole('button', { name: 'To Read', exact: true })).toBeVisible()
 }
 await mountLibrary(document, `https://archiveofourown.org${path}`, { browser })
 expect(document.querySelectorAll('[data-work-tile]')).toHaveLength(3)
 expect(network).toHaveBeenCalledTimes(3)
})

function entireWork(complete = true) {
 document.querySelector('dd.chapters').textContent = `3/${complete ? 3 : '?'}`
 document.querySelector('#selected_id').remove()
 document.querySelector('#workskin').insertAdjacentHTML('beforeend', `<div id="chapters">${[1, 2, 3].map(current => `<div class="chapter" id="chapter-${current}"><h3 class="title"><a href="/works/123/chapters/${100 + current}">Chapter ${current}</a></h3><div class="userstuff"><p>${'Word '.repeat(current)}</p></div><div class="notes">Private notes</div></div>`).join('')}</div>`)
 network.mockImplementation(async ({ data }) => {
  const { p_action, p_input } = JSON.parse(data)
  if (p_action === 'progress') entry = { ...entry, ...p_input, version: 'v2' }
  return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
 })
}
const entireWorkUrl = 'https://archiveofourown.org/works/123?view_full_work=true'
const chapterSurfaces = () => Element.prototype.attachShadow.mock.results.slice(1).map(result => result.value)

it.each(['safari', 'chrome'])('synchronizes full-work chapter bars and records only the chosen chapter on %s', async browser => {
 entireWork()
 entry = { version: 'v1', status: 'reading', progress: 0, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, entireWorkUrl, { browser })
 const bars = chapterSurfaces()
 expect(bars).toHaveLength(3)
 for (const [index, surface] of bars.entries()) {
  expect(surface.host.previousElementSibling.id).toBe(`chapter-${index + 1}`)
  expect(within(surface).getByRole('region', { name: `Chapter ${index + 1} Reading Progress` })).toBeVisible()
 }
 expect(within(root).getByRole('button', { name: 'Read' })).toBeVisible()
 fireEvent.click(within(bars[1]).getByRole('button', { name: 'Read' }))
 await waitFor(() => expect(within(bars[1]).getByText('Read', { exact: true })).toBeVisible())
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ progress: 2, status: 'reading', chapter_read: { chapter: 2, chapter_id: '102', word_count: 2 } })
 expect(network.mock.lastCall[0].data).not.toContain('Private notes')
 for (const surface of [root, ...bars]) expect(surface.querySelector('.chapter-progress')).toHaveTextContent('Ch. 2 / 3')
 expect(within(bars[0]).getByText('Read', { exact: true })).toBeVisible()
 fireEvent.click(within(bars[2]).getByRole('button', { name: 'Finish Fic' }))
 await waitFor(() => expect(within(bars[0]).getByRole('button', { name: 'Re-Read' })).toBeEnabled())
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ status: 'finished', chapter_read: { chapter: 3, chapter_id: '103', word_count: 3 } })
 fireEvent.click(within(bars[1]).getByRole('button', { name: 'Re-Read' }))
 await waitFor(() => expect(within(bars[1]).getByRole('button', { name: 'Read' })).toBeEnabled())
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ status: 're_reading', progress: 1 })
 // Remount attempts must not duplicate bars or reload the saved entry.
 const requests = network.mock.calls.length
 await mountLibrary(document, entireWorkUrl, { browser })
 expect(chapterSurfaces()).toHaveLength(3)
 expect(network).toHaveBeenCalledTimes(requests)
})

it.each(['safari', 'chrome'])('keeps all full-work bars consistent after a failed save and leaves a WIP unfinished on %s', async browser => {
 entireWork(false)
 entry = { version: 'v1', status: 'reading', progress: 0, notes: '', rating: null, tags: [], collections: [] }
 await mountLibrary(document, entireWorkUrl, { browser })
 const bars = chapterSurfaces()
 network.mockResolvedValueOnce({ status: 503, responseText: '{}' })
 fireEvent.click(within(bars[2]).getByRole('button', { name: 'Read' }))
 await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Could not save'))
 for (const surface of bars) {
  expect(surface.querySelector('.chapter-progress')).toHaveTextContent('Ch. 0 / 3')
  expect(within(surface).getByRole('button', { name: 'Read' })).toBeEnabled()
  expect(surface.querySelector('p')).toHaveTextContent('Could not save')
 }
 fireEvent.click(within(bars[2]).getByRole('button', { name: 'Read' }))
 await waitFor(() => expect(within(bars[2]).getByText('Read', { exact: true })).toBeVisible())
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ status: 'waiting_for_updates', progress: 3 })
 for (const surface of [root, ...bars]) expect(surface.querySelector('.reading-summary strong')).toHaveTextContent('Waiting for Updates')
})

it.each(['safari', 'chrome'])('opens the shared add editor at the selected full-work chapter on %s', async browser => {
 entireWork()
 await mountLibrary(document, entireWorkUrl, { browser })
 fireEvent.click(within(chapterSurfaces()[1]).getByRole('button', { name: 'Add to Library' }))
 expect(await within(root).findByLabelText('Current Chapter')).toHaveValue(2)
 expect(within(root).getByLabelText('Reading Status')).toHaveValue('reading')
 expect(within(root).getByLabelText('This Chapter Is Finished')).not.toBeChecked()
 await waitFor(() => expect(findButton('Cancel')).toBeEnabled())
})

const readingActionCases = [
 { status: 'to_read', chapter: 1, progress: 0, top: ['Start Reading'], bottom: ['Mark Read'] },
 { status: 'to_read', chapter: 2, progress: 0, top: ['Mark Read'], bottom: ['Mark Read'] },
 { status: 'to_read', chapter: 4, progress: 0, top: ['Mark Read'], bottom: ['Mark Read'] },
 { status: 'to_read', chapter: 10, progress: 0, top: ['Mark Read'], bottom: ['Mark Read'] },
 { status: 'paused_reading', chapter: 4, progress: 3, top: ['Resume'], bottom: ['Mark Read'] },
 { status: 'paused_reading', chapter: 5, progress: 3, top: ['Mark Read'], bottom: ['Mark Read'] },
 { status: 'paused_reading', chapter: 10, progress: 3, top: ['Mark Read'], bottom: ['Mark Read'] },
 { status: 'reading', chapter: 4, progress: 3, top: ['Read', 'Pause'], bottom: ['Read', 'Pause'] },
 { status: 'reading', chapter: 10, progress: 9, top: ['Finish Fic', 'Pause'], bottom: ['Finish Fic', 'Pause'] },
]
it.each(['safari', 'chrome'].flatMap(browser => readingActionCases.flatMap(scenario => (scenario.chapter === 1 ? [false, true] : [false]).flatMap(workRoot => [false, true].map(fromBottom => ({ browser, ...scenario, workRoot, fromBottom }))))))(
 'uses chapter-specific controls for $status at chapter $chapter on $browser (work URL: $workRoot, bottom action: $fromBottom)',
 async ({ browser, status, chapter, progress, top, bottom, workRoot, fromBottom }) => {
  document.querySelector('#selected_id').innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${101 + i}">${i + 1}. Chapter</option>`).join('')
  entry = { version: 'v1', status, progress, notes: 'Keep My Notes', rating: 4, tags: ['Mine'], collections: [] }
  network.mockImplementation(async ({ data }) => {
   const { p_action, p_input } = JSON.parse(data)
   if (p_action === 'progress') entry = { ...entry, ...p_input, version: 'v2' }
   return { status: 200, responseText: JSON.stringify({ entry, collections: [] }) }
  })
  await mountLibrary(document, `https://archiveofourown.org/works/123${workRoot ? '' : `/chapters/${100 + chapter}`}`, { browser })
  const controls = surface => [...surface.querySelectorAll('.complete-chapter, .reading-toggle')].map(button => button.textContent)
  expect(controls(root)).toEqual(top)
  expect(controls(bottomRoot)).toEqual(bottom)
  if (status === 'to_read') for (const surface of [root, bottomRoot]) expect(within(surface).queryByRole('button', { name: 'Resume Reading' })).not.toBeInTheDocument()
  const action = (fromBottom ? bottomRoot : root).querySelector('.complete-chapter, .reading-toggle')
  const changesProgress = !['Start Reading', 'Resume'].includes(action.textContent)
  fireEvent.click(action)
  await waitFor(() => expect(within(root).getByRole('status')).toHaveTextContent('Saved'))
  const input = JSON.parse(network.mock.lastCall[0].data).p_input
  expect(input).toMatchObject({ progress: changesProgress ? chapter : progress, status: changesProgress && chapter === 10 ? 'finished' : 'reading' })
  if (changesProgress) expect(input.chapter_read).toMatchObject({ chapter, chapter_id: String(100 + chapter) })
  else expect(input).not.toHaveProperty('chapter_read')
  expect(input).not.toHaveProperty('notes')
  for (const surface of [root, bottomRoot]) expect(surface.querySelector('.chapter-progress')).toHaveTextContent(`Ch. ${entry.progress} / 10`)
 })

it.each(['safari', 'chrome'])('preserves a paused reread when Mark Read resumes it on %s', async browser => {
 entry = { version: 'v1', status: 'paused_reading', progress: 3, notes: '', rating: null, tags: [], collections: [], readingHistory: [{ action: 'paused_reading', previous_status: 're_reading' }] }
 await mountLibrary(document, 'https://archiveofourown.org/works/123/chapters/104', { browser })
 fireEvent.click(within(bottomRoot).getByRole('button', { name: 'Mark Read' }))
 await waitFor(() => expect(network).toHaveBeenCalledTimes(2))
 expect(JSON.parse(network.mock.lastCall[0].data).p_input).toMatchObject({ status: 're_reading', progress: 4 })
})

it('keeps the current waiting status and unread chapter action alongside Re-Read in Chrome', async () => {
 entry = { version:'v1',status:'waiting_for_updates',progress:3,notes:'',rating:null,tags:[],collections:[] }
 await mountLibrary(document,'https://archiveofourown.org/works/123/chapters/104',{browser:'chrome'})
 for (const surface of [root,bottomRoot]) {
  expect(surface.querySelectorAll('.reading-summary strong')).toHaveLength(1)
  expect(surface.querySelector('.reading-summary strong')).toHaveTextContent('Waiting for Updates')
  expect(within(surface).getByRole('button',{name:'Re-Read'})).toBeVisible()
  expect(within(surface).getByRole('button',{name:'Read',exact:true})).toBeVisible()
 }
})

it.each(['safari', 'chrome'])('uses Start Reading only at the top and Mark Read after each chapter for To Read in Entire Work on %s', async browser => {
 entireWork()
 entry = { version:'v1',status:'to_read',progress:0,notes:'',rating:null,tags:[],collections:[] }
 await mountLibrary(document,entireWorkUrl,{browser})
 expect(within(root).getByRole('button',{name:'Start Reading',exact:true})).toBeVisible()
 expect(within(root).queryByRole('button',{name:'Mark Read',exact:true})).not.toBeInTheDocument()
 const bars=chapterSurfaces()
 expect(bars).toHaveLength(3)
 for (const surface of bars) {
  expect(within(surface).getByRole('button',{name:'Mark Read',exact:true})).toBeVisible()
  expect(within(surface).queryByRole('button',{name:'Start Reading',exact:true})).not.toBeInTheDocument()
 }
})

it.each(['safari', 'chrome'].flatMap(browser => ['10/?', '10/15'].flatMap(chapters => ['to_read', 'reading', 'waiting_for_updates', 're_reading', 'paused_reading'].flatMap(status => [false, true].map(fromBottom => ({browser, chapters, status, fromBottom}))))))('marks the latest $chapters chapter as waiting from $status on $browser (bottom: $fromBottom)', async ({browser, chapters, status, fromBottom}) => {
 document.querySelector('dd.chapters').textContent = chapters
 document.querySelector('#selected_id').innerHTML = '<option value="110">10. Latest</option>'
 entry = {version:'v1',status,progress:status==='to_read'?0:status==='paused_reading'?8:9,notes:'Keep notes',rating:4,tags:['Mine'],collections:[]}
 network.mockImplementation(async ({data}) => {
  const {p_action,p_input}=JSON.parse(data)
  if(p_action==='progress') entry={...entry,...p_input,version:'v2'}
  return {status:200,responseText:JSON.stringify({entry,collections:[]})}
 })
 await mountLibrary(document,'https://archiveofourown.org/works/123/chapters/110',{browser})
 const surface=fromBottom?bottomRoot:root
 fireEvent.click(within(surface).getByRole('button',{name:['to_read','paused_reading'].includes(status)?'Mark Read':'Read',exact:true}))
 await waitFor(()=>expect(within(root).getByRole('status')).toHaveTextContent(/^Saved$/))
 expect(entry).toMatchObject({status:'waiting_for_updates',progress:10,notes:'Keep notes',rating:4,tags:['Mine']})
 expect(JSON.parse(network.mock.lastCall[0].data).p_input.chapter_read).toMatchObject({chapter:10,chapter_id:'110'})
 for(const bar of [root,bottomRoot]) {
  expect(bar.querySelector('.reading-summary strong')).toHaveTextContent('Waiting for Updates')
  expect(bar.querySelector('.chapter-progress')).toHaveTextContent('Ch. 10 / 10')
 }
})
