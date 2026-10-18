import { parseLines, statuses, validateProgress } from '../src/features/library/model'
import { readPage } from './page'
import styles from './styles.css?inline'

export async function mountLibrary(doc = document, href = location.href) {
 const page = readPage(doc, href)
 if (!page || doc.getElementById('ao3-library-companion')) return
 const host = doc.createElement('div')
 host.id = 'ao3-library-companion'
 const root = host.attachShadow({ mode: 'closed' })
 const style = doc.createElement('style'); style.textContent = styles; root.append(style)
 const section = doc.createElement('section'); section.setAttribute('aria-label', 'AO3 Library'); root.append(section)
 doc.querySelector('#workskin')?.before(host)
 if (!host.isConnected) doc.querySelector('#main')?.prepend(host)
 const storageKey = `connection:${__SUPABASE_URL__}`
 let connection = await GM.getValue(storageKey, null)
 let entry = null, collections = [], loaded = false, busy = false, draft = null
 const toolbar = doc.createElement('div'); toolbar.className = 'row'; section.append(toolbar)
 const message = doc.createElement('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite')
 const panel = doc.createElement('div'); section.append(message, panel)
 const footer = doc.createElement('small'); footer.textContent = `AO3 Library v${__SCRIPT_VERSION__} · `
 const update = doc.createElement('a'); update.href = `${__APP_ORIGIN__}/settings`; update.target = '_blank'; update.rel = 'noopener noreferrer'; update.textContent = 'Connection & update instructions'
 footer.append(update); section.append(footer)
 const draftKey = () => `draft:${__SUPABASE_URL__}:${connection.userId}:${page.work}`
 function node(tag, text, parent) { const element = doc.createElement(tag); if (text) element.textContent = text; parent?.append(element); return element }
 function button(label, action, parent = toolbar) {
  const element = node('button', label, parent); element.type = 'button'; element.disabled = busy
  element.addEventListener('click', () => { void run(action) }); return element
 }
 async function run(action) {
  if (busy) return
  busy = true; message.textContent = ''; root.querySelectorAll('button').forEach(button => { button.disabled = true })
  try { await action() }
  catch (error) { message.textContent = error instanceof Error ? error.message : 'Connection failed. Your draft is preserved.' }
  finally { busy = false; renderToolbar(); root.querySelectorAll('button').forEach(button => { button.disabled = false }) }
 }
 async function rpc(action, input = {}, secret = connection?.secret) {
  const response = await GM.xmlHttpRequest({
   method: 'POST', url: `${__SUPABASE_URL__}/rest/v1/rpc/userscript_library`, timeout: 20000,
   headers: { apikey: __SUPABASE_KEY__, 'Content-Type': 'application/json' },
   data: JSON.stringify({ p_secret: secret, p_action: action, p_work: page.work, p_input: input }),
  })
  let data
  try { data = JSON.parse(response.responseText) } catch { throw new Error('Backend unavailable. Your draft is preserved; try again.') }
  if (response.status < 200 || response.status >= 300) {
   if (data.code === '28000') throw new Error('Device authorization expired or was revoked. Reconnect below; your draft is preserved.')
   if (data.code === '40001') throw new Error('This entry changed elsewhere. Reload saved entry, review your draft, then save again.')
   throw new Error('Could not save or load. Check your connection and chapter count, then retry. Your draft is preserved.')
  }
  return data
 }
 function accept(data) { entry = data.entry; collections = data.collections; loaded = true }
 async function load() { accept(await rpc('get')); renderToolbar() }
 async function progress(value, status) {
  validateProgress(value, page.metadata)
  accept(await rpc('progress', { version: entry.version, progress: value, status }))
  message.textContent = 'Saved'
  renderToolbar()
 }
 function renderToolbar() {
  toolbar.replaceChildren()
  if (!connection) { button('Connect Library', showConnection); return }
  if (!loaded) button('Load saved entry', load)
  else if (!entry) button('Add to Library', openEditor)
  else {
   node('strong', statuses[entry.status], toolbar)
   if (entry.status === 'finished') {
    const reread = button('Reread?', () => progress(0, 're_reading'))
    // Clockwise open arrow around an open book. Static SVG contains no page data.
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true')
    for (const d of ['M20 8A9 9 0 1 0 21 14M20 3v5h-5', 'M7 10c2-1 3-1 5 0 2-1 3-1 5 0v6c-2-1-3-1-5 0-2-1-3-1-5 0zM12 10v6']) {
     const path = doc.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',d); svg.append(path)
    }
    reread.prepend(svg)
   } else {
    button('−', () => progress(Math.max(0, entry.progress - 1), entry.status)).setAttribute('aria-label', 'One fewer completed chapter')
    node('span', `Ch. ${entry.progress} / ${page.metadata.total_chapters ?? '?'}`, toolbar)
    const atLast = page.metadata.total_chapters !== null && page.metadata.published_chapters === page.metadata.total_chapters && Math.max(entry.progress + 1, page.current ?? 0) >= page.metadata.total_chapters
    button(atLast ? '✓' : '+', () => progress(atLast ? page.metadata.total_chapters : entry.progress + 1, atLast ? 'finished' : entry.status === 'to_read' ? 'reading' : entry.status)).setAttribute('aria-label', atLast ? 'Mark all chapters read and finish work' : 'One more completed chapter')
    if (page.current) button('Mark this chapter finished', () => progress(Math.max(entry.progress, page.current), page.current === page.metadata.total_chapters && page.metadata.published_chapters === page.metadata.total_chapters ? 'finished' : entry.status === 're_reading' ? 're_reading' : 'reading'))
   }
   button('Edit', openEditor)
   if (entry.rating !== null) node('span', `Rating: ${entry.rating}/5`, toolbar)
   if (entry.notes) node('p', entry.notes, toolbar).className = 'notes'
  }
  button('Connection', showConnection)
 }
 function showConnection() {
  panel.replaceChildren()
  node('p', 'In Library Settings → iOS Safari userscript, create a pairing code. Paste it here within 5 minutes. This grants library access for 90 days.', panel)
  const label = node('label', 'One-time pairing code', panel), input = node('input', '', label)
  input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false
  button('Connect', async () => {
   const next = await rpc('claim', {}, input.value.trim())
   await GM.setValue(storageKey, next); connection = next; input.value = ''; loaded = false; draft = null
   await load(); panel.replaceChildren(); message.textContent = 'Library connected'
  }, panel)
  if (connection) button('Disconnect device', async () => {
   await rpc('disconnect'); await GM.deleteValue(storageKey); connection = null; entry = null; loaded = false; draft = null; panel.replaceChildren(); message.textContent = 'Device disconnected. Local unsaved drafts are retained for this account.'
  }, panel)
  button('Close', () => panel.replaceChildren(), panel)
 }
 async function openEditor() {
  if (!loaded) await load()
  const stored = await GM.getValue(draftKey(), null)
  draft = draft ?? stored ?? (entry ? { version: entry.version, status: entry.status, chapter: entry.progress + 1, chapterFinished: false, notes: entry.notes, rating: entry.rating ?? '', tags: entry.tags.join('\n'), collections: entry.collections } : { ...page.defaults, version: null, notes: '', rating: '', tags: '', collections: [] })
  if (stored) message.textContent = 'Unsaved draft restored. Review it before saving.'
  panel.replaceChildren()
  node('h3', entry ? 'Edit library entry' : 'Add to Library', panel)
  const form = node('form', '', panel)
  const fieldset = node('fieldset', '', form)
  const field = (title, tag, key) => {
   const label = node('label', title, fieldset), input = node(tag, '', label)
   input.addEventListener('change', () => {
    draft[key] = key === 'chapterFinished' ? input.checked : input.value
    void GM.setValue(draftKey(), draft).catch(() => { message.textContent = 'Could not preserve the draft on this device. Keep this panel open.' })
   })
   return input
  }
  const status = field('Reading status', 'select', 'status')
  for (const key of [...new Set(['to_read', 'reading', 'finished', 're_reading', ...(entry ? [entry.status] : [])])]) { const option = node('option', key === 'reading' ? 'Currently Reading' : statuses[key], status); option.value = key }
  status.value = draft.status
  const chapter = field('Current chapter', 'input', 'chapter'); chapter.type = 'number'; chapter.min = '1'; chapter.step = '1'; chapter.required = true; chapter.value = draft.chapter
  if (page.metadata.published_chapters) chapter.max = String(page.metadata.published_chapters + 1)
  const finished = field('This chapter is finished', 'input', 'chapterFinished'); finished.type = 'checkbox'; finished.checked = draft.chapterFinished
  node('small', 'Current chapter − 1 counts as completed; check finished to include this chapter. Finished status marks every published chapter read.', fieldset)
  const notes = field('Private notes', 'textarea', 'notes'); notes.rows = 3; notes.value = draft.notes
  const tags = field('Personal tags (one per line)', 'textarea', 'tags'); tags.rows = 2; tags.value = draft.tags
  // Persist text while typing, including when Safari suspends a tab.
  for (const input of [notes, tags]) input.addEventListener('input', () => input.dispatchEvent(new Event('change')))
  const rating = field('Personal rating', 'select', 'rating')
  for (const value of ['', '1', '2', '3', '4', '5']) { const option = node('option', value ? `${value} / 5` : 'Unrated', rating); option.value = value }
  rating.value = String(draft.rating)
  const choices = node('fieldset', '', fieldset); node('legend', 'Custom collections', choices)
  for (const collection of collections) {
   const label = node('label', collection.name, choices), checkbox = node('input', '', label); checkbox.type = 'checkbox'; checkbox.checked = draft.collections.includes(collection.id)
   checkbox.addEventListener('change', () => {
    draft.collections = checkbox.checked ? [...draft.collections, collection.id] : draft.collections.filter(id => id !== collection.id)
    void GM.setValue(draftKey(), draft)
   })
  }
  const save = node('button', 'Save', form); save.type = 'submit'
  form.addEventListener('submit', event => { event.preventDefault(); void run(async () => {
   fieldset.disabled = true
   try {
    const chapterNumber = Number(draft.chapter)
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) throw new Error('Enter a valid current chapter.')
    const value = draft.status === 'finished' ? page.metadata.published_chapters : chapterNumber - (draft.chapterFinished ? 0 : 1)
    if (value === null) throw new Error('The published chapter count is unavailable. Reload AO3 before finishing the work.')
    validateProgress(value, page.metadata)
    await GM.setValue(draftKey(), draft)
    accept(await rpc('save', { version: draft.version, metadata: page.metadata, status: draft.status, progress: value, notes: draft.notes, rating: draft.rating === '' ? null : Number(draft.rating), tags: parseLines(draft.tags), collections: draft.collections }))
    message.textContent = 'Saved'; draft = null; panel.replaceChildren()
    await GM.deleteValue(draftKey()).catch(() => { message.textContent = 'Saved. Could not clear the local draft.' })
   } finally { fieldset.disabled = false }
  }) })
  button('Cancel', async () => { await GM.deleteValue(draftKey()); draft = null; panel.replaceChildren() }, form)
  button('Reload saved entry', async () => { await load(); draft.version = entry?.version ?? null; await GM.setValue(draftKey(), draft); message.textContent = 'Saved entry reloaded. Your draft is retained; review it before saving.' }, form)
  status.focus()
 }
 renderToolbar()
 if (connection) await run(load)
}

if (typeof GM !== 'undefined') void mountLibrary().catch(() => { /* Userscripts storage unavailable; no credential fallback to page storage. */ })
