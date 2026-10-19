import { parseLines, statuses, validateProgress } from '../src/features/library/model'
import { readPage } from './page'
import styles from './styles.css?inline'
import { mountPersonalControls } from './personal-controls'

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
 doc.getElementById('ao3-library-progress')?.remove()
 const bottomHost = doc.createElement('div'); bottomHost.id = 'ao3-library-progress'
 const bottomRoot = bottomHost.attachShadow({ mode: 'closed' }); bottomRoot.append(style.cloneNode(true))
 const bottomSection = doc.createElement('section'); bottomSection.setAttribute('aria-label', 'Reading progress'); bottomRoot.append(bottomSection)
 const bottomBar = doc.createElement('div'); bottomBar.className = 'row'; bottomBar.setAttribute('aria-live', 'polite'); bottomSection.append(bottomBar)
 const bottomMessage = doc.createElement('p'); bottomMessage.setAttribute('aria-live', 'polite'); bottomSection.append(bottomMessage)
 const bottomAnchor = doc.querySelector('#kudos') ?? doc.querySelector('.kudos') ?? doc.querySelector('#feedback')
 if (bottomAnchor) bottomAnchor.before(bottomHost)
 else doc.querySelector('#workskin')?.after(bottomHost)
 bottomHost.hidden = true
 const storageKey = `connection:${__SUPABASE_URL__}`
 let connection = await GM.getValue(storageKey, null)
 let entry = null, collections = [], loaded = false, busy = false, draft = null, activePanel = null, syncEditorProgress = null, disposePersonalControls = null, adjustmentControls = null
 const toolbar = doc.createElement('div'); toolbar.className = 'row'; section.append(toolbar)
 const message = doc.createElement('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite')
 const panel = doc.createElement('div'); section.append(message, panel)
 const editorPanel = doc.createElement('div'), connectionPanel = doc.createElement('div')
 editorPanel.id = 'library-editor'; connectionPanel.id = 'library-connection'
 panel.append(editorPanel, connectionPanel)
 const footer = doc.createElement('small'); footer.textContent = `AO3 Library v${__SCRIPT_VERSION__} · `
 const update = doc.createElement('a'); update.href = `${__APP_ORIGIN__}/settings`; update.target = '_blank'; update.rel = 'noopener noreferrer'; update.textContent = 'Connection & update instructions'
 footer.append(update); section.append(footer)
 showPanel(null)
 const draftKey = () => `draft:${__SUPABASE_URL__}:${connection.userId}:${page.work}`
 function node(tag, text, parent) { const element = doc.createElement(tag); if (text) element.textContent = text; parent?.append(element); return element }
 function button(label, action, parent = toolbar) {
  const element = node('button', label, parent); element.type = 'button'; element.disabled = busy
  element.addEventListener('click', () => { void run(action) }); return element
 }
 function showPanel(name) {
  activePanel = name
  editorPanel.hidden = name !== 'editor'; connectionPanel.hidden = name !== 'connection'
  footer.hidden = Boolean(connection && !name)
  if (name === 'editor') requestAnimationFrame(() => editorPanel.querySelectorAll('textarea').forEach(input => input.dispatchEvent(new Event('resize-text'))))
 }
 function icon(paths, parent) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) { const path = doc.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path) }
  parent.append(svg); return svg
 }
 function clearEditor() { disposePersonalControls?.(); disposePersonalControls = null; syncEditorProgress = null; editorPanel.replaceChildren() }
 function resetPanels() { showPanel(null); clearEditor(); connectionPanel.replaceChildren(); adjustmentControls = null }
 function panelButton(label, name, action) {
  const element = button(label, action)
  element.setAttribute('aria-expanded', String(activePanel === name))
  element.setAttribute('aria-controls', name === 'editor' ? editorPanel.id : connectionPanel.id)
  return element
 }
 async function run(action) {
  if (busy) return
  busy = true; message.textContent = ''; [root, bottomRoot].forEach(surface => surface.querySelectorAll('button').forEach(button => { button.disabled = true }))
  try { await action() }
  catch (error) { message.textContent = error instanceof Error ? error.message : 'Connection failed. Your draft is preserved.' }
  finally { busy = false; renderToolbar(); root.querySelectorAll('button').forEach(button => { button.disabled = button.dataset.atBoundary === 'true' }); bottomMessage.textContent = message.textContent === 'Saved' ? '' : message.textContent }
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
 function entryPosition() {
  const chapter = Math.min(entry.progress + 1, page.metadata.published_chapters || entry.progress + 1)
  return { chapter, chapterFinished: entry.progress >= chapter }
 }
 function preserveDraft() {
  return GM.setValue(draftKey(), draft).catch(() => { message.textContent = 'Could not preserve the draft on this device. Keep this panel open.' })
 }
 async function load() { accept(await rpc('get')); renderToolbar() }
 async function progress(value, status) {
  validateProgress(value, page.metadata)
  const previous = entry
  entry = { ...entry, progress: value, status }; renderToolbar()
  try { accept(await rpc('progress', { version: previous.version, progress: value, status })) }
  catch (error) { entry = previous; renderToolbar(); throw error }
  renderToolbar()
  draft = draft ?? await GM.getValue(draftKey(), null)
  if (draft) {
   Object.assign(draft, entryPosition(), { version: entry.version, status: entry.status })
   syncEditorProgress?.()
   await preserveDraft()
  }
  message.textContent = 'Saved'
  renderToolbar()
 }
 function renderProgress(parent) {
  node('span', `Ch. ${entry.progress} / ${page.metadata.total_chapters ?? '?'}`, parent).className = 'chapter-progress'
  if (!page.current) return
  const read = entry.progress >= page.current
  if (read) {
   const indicator = node('span', '', parent); indicator.className = 'completion-indicator'
   icon(['M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0', 'm8 12 3 3 5-6'], indicator)
   node('span', `Read through Ch. ${page.current}`, indicator)
  } else {
   const final = page.current === page.metadata.total_chapters && page.metadata.published_chapters === page.metadata.total_chapters
   button(final ? '✓ Finish Fic' : `✓ Through Ch. ${page.current}`, () => progress(Math.max(entry.progress, page.current), final ? 'finished' : entry.status === 're_reading' ? 're_reading' : 'reading'), parent).className = 'complete-chapter'
  }
 }
 function renderAdjustments() {
  if (!adjustmentControls) return
  adjustmentControls.replaceChildren()
  if (!entry) return
  if (entry.status === 'finished') {
   button('Reread?', () => progress(0, 're_reading'), adjustmentControls)
  } else {
   const { chapter } = entryPosition()
   const previous = button('−', () => progress(Math.max(0, chapter - 2), entry.status), adjustmentControls)
   previous.setAttribute('aria-label', 'Previous chapter'); previous.dataset.atBoundary = String(chapter <= 1); previous.disabled ||= chapter <= 1
   const atLast = page.metadata.total_chapters !== null && page.metadata.published_chapters === page.metadata.total_chapters && chapter === page.metadata.total_chapters
   const next = button(atLast ? '✓ Finish Fic' : '+', () => progress(atLast ? page.metadata.total_chapters : chapter, atLast ? 'finished' : entry.status === 'to_read' ? 'reading' : entry.status), adjustmentControls)
   next.setAttribute('aria-label', atLast ? 'Mark all chapters read and finish work' : 'Next chapter')
   next.dataset.atBoundary = String(!atLast && page.metadata.published_chapters !== null && entry.progress >= page.metadata.published_chapters); next.disabled ||= next.dataset.atBoundary === 'true'
  }
 }
 function libraryLink(parent) {
  const logo = node('a', '', parent); logo.className = 'brand-icon'; logo.href = __APP_ORIGIN__; logo.target = '_blank'; logo.rel = 'noopener noreferrer'; logo.setAttribute('aria-label', 'between chapters library')
  // Trusted, build-time Lucide logo markup; no page or user content is injected.
  logo.innerHTML = __BRAND_ICON__
 }
 function renderToolbar() {
  toolbar.replaceChildren(); bottomBar.replaceChildren()
  bottomHost.hidden = !connection || !loaded || !entry
  footer.hidden = Boolean(connection && !activePanel)
  renderAdjustments()
  if (!entry) libraryLink(toolbar)
  if (!connection) { panelButton('Connect Library', 'connection', showConnection); return }
  if (!loaded) button('Load saved entry', load)
  else if (!entry) panelButton('Add to Library', 'editor', openEditor)
  else {
   node('strong', entry.status === 'reading' ? 'Currently Reading' : statuses[entry.status], toolbar)
   renderProgress(toolbar); renderProgress(bottomBar)
   panelButton('Edit', 'editor', openEditor)
  }
  const settings = panelButton('', 'connection', showConnection)
  settings.className = 'settings-button'; settings.setAttribute('aria-label', 'Connection'); settings.title = 'Reading controls and connection settings'
  icon(['M3 6h4m4 0h10M3 12h10m4 0h4M3 18h6m4 0h8M7 3v6m10 0v6M9 15v6'], settings)
 }
 function showConnection() {
  if (activePanel === 'connection') { showPanel(null); return }
  showPanel('connection')
  if (connectionPanel.childNodes.length) return
  libraryLink(connectionPanel)
  adjustmentControls = node('div', '', connectionPanel); adjustmentControls.className = 'row'; adjustmentControls.setAttribute('aria-label', 'Adjust reading progress'); renderAdjustments()
  node('p', 'In Library Settings → iOS Safari userscript, create a pairing code. Paste it here within 5 minutes. This grants library access for 90 days.', connectionPanel)
  const label = node('label', 'One-time pairing code', connectionPanel), input = node('input', '', label)
  input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false
  button('Connect', async () => {
   const next = await rpc('claim', {}, input.value.trim())
   await GM.setValue(storageKey, next); connection = next; input.value = ''; loaded = false; draft = null; resetPanels()
   await load(); message.textContent = 'Library connected'
  }, connectionPanel)
  if (connection) button('Disconnect device', async () => {
   await rpc('disconnect'); await GM.deleteValue(storageKey); connection = null; entry = null; loaded = false; draft = null; resetPanels(); message.textContent = 'Device disconnected. Local unsaved drafts are retained for this account.'
  }, connectionPanel)
  button('Close', () => showPanel(null), connectionPanel)
 }
 async function openEditor() {
  if (activePanel === 'editor') { showPanel(null); return }
  if (editorPanel.childNodes.length) { showPanel('editor'); return }
  if (!loaded) await load()
  const stored = await GM.getValue(draftKey(), null)
  draft = draft ?? stored ?? (entry ? { version: entry.version, status: entry.status, ...entryPosition(), notes: entry.notes, rating: entry.rating ?? '', tags: entry.tags.join('\n'), collections: entry.collections } : { ...page.defaults, version: null, notes: '', rating: '', tags: '', collections: [] })
  if (stored) message.textContent = 'Unsaved draft restored. Review it before saving.'
  showPanel('editor')
  node('h3', entry ? 'Edit library entry' : 'Add to Library', editorPanel)
  const form = node('form', '', editorPanel)
  const fieldset = node('fieldset', '', form)
  const field = (title, tag, key) => {
   const label = node('label', title, fieldset), input = node(tag, '', label)
   input.setAttribute('aria-label', title)
   input.addEventListener('change', () => {
    draft[key] = key === 'chapterFinished' ? input.checked : input.value
    void preserveDraft()
   })
   return input
  }
  const help = (input, title, description) => {
   const label = input.parentElement, text = label.firstChild
   const heading = node('span', '', label); heading.className = 'field-heading'; heading.append(text); label.prepend(heading)
   const info = node('details', '', heading); info.className = 'field-info'
   const summary = node('summary', 'ⓘ', info); summary.setAttribute('aria-label', `About ${title}`)
   node('span', description, info)
  }
  const status = field('Reading status', 'select', 'status')
  for (const key of [...new Set(['to_read', 'reading', 'finished', 're_reading', ...(entry ? [entry.status] : [])])]) { const option = node('option', key === 'reading' ? 'Currently Reading' : statuses[key], status); option.value = key }
  status.value = draft.status
  help(status, 'reading status', 'To Read marks no chapters as read. Finished status marks every published chapter read. Re-reading marks the fic as previously read (Finished) and still tracks your chapter.')
  const chapter = field('Current chapter', 'input', 'chapter'); chapter.type = 'number'; chapter.min = '1'; chapter.step = '1'; chapter.value = draft.chapter
  if (page.metadata.published_chapters) chapter.max = String(page.metadata.published_chapters)
  help(chapter, 'current chapter', 'Current chapter − 1 counts as completed; check finished to include this chapter.')
  const finished = field('This chapter is finished', 'input', 'chapterFinished'); finished.type = 'checkbox'; finished.checked = draft.chapterFinished
  function showChapterFields() {
   const tracking = !['to_read', 'finished'].includes(status.value)
   chapter.parentElement.hidden = finished.parentElement.hidden = !tracking
   chapter.disabled = finished.disabled = !tracking; chapter.required = tracking
  }
  status.addEventListener('change', showChapterFields)
  showChapterFields()
  syncEditorProgress = () => {
   status.value = draft.status; chapter.value = draft.chapter; finished.checked = draft.chapterFinished
   showChapterFields()
  }
  const growingField = (title, key, rows) => {
   const input = field(title, 'textarea', key); input.rows = rows; input.value = draft[key]
   let collapsed = false
   const toggle = node('button', 'Collapse', input.parentElement); toggle.type = 'button'; toggle.className = 'text-toggle'; toggle.setAttribute('aria-label', `Collapse ${title}`)
   const resize = () => {
    input.style.height = 'auto'
    const minimum = (parseFloat(getComputedStyle(input).lineHeight) || 25) * rows + 22
    const full = Math.max(minimum, input.scrollHeight + 2)
    input.style.height = `${collapsed ? minimum : full}px`
    input.classList.toggle('collapsed', collapsed)
    toggle.hidden = full <= minimum + 2
    toggle.textContent = collapsed ? 'Expand' : 'Collapse'
    toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title}`)
    toggle.setAttribute('aria-expanded', String(!collapsed))
   }
   input.addEventListener('input', () => { input.dispatchEvent(new Event('change')); resize() })
   input.addEventListener('resize-text', resize)
   toggle.addEventListener('click', () => { collapsed = !collapsed; resize() })
   requestAnimationFrame(resize)
   return input
  }
  growingField('Private notes', 'notes', 3)
  disposePersonalControls = mountPersonalControls(node('div', '', fieldset), draft, () => { void preserveDraft() })
  const choices = node('details', '', fieldset); choices.className = 'collection-picker'
  node('summary', 'Add to custom collection', choices)
  const searchLabel = node('label', 'Search custom collections', choices), search = node('input', '', searchLabel); search.type = 'search'
  const collectionList = node('fieldset', '', choices); node('legend', 'Custom collections', collectionList)
  const empty = node('p', collections.length ? 'No matching collections.' : 'Create custom collections in your library to add this fic.', choices)
  for (const collection of collections) {
   const label = node('label', collection.name, collectionList), checkbox = node('input', '', label); checkbox.type = 'checkbox'; checkbox.checked = draft.collections.includes(collection.id)
   label.dataset.name = collection.name.toLocaleLowerCase()
   checkbox.addEventListener('change', () => {
    draft.collections = checkbox.checked ? [...draft.collections, collection.id] : draft.collections.filter(id => id !== collection.id)
    void preserveDraft()
   })
  }
  const filterCollections = () => {
   const query = search.value.trim().toLocaleLowerCase()
   const labels = [...collectionList.querySelectorAll('label')]
   labels.forEach(label => { label.hidden = !label.dataset.name.includes(query) })
   empty.hidden = labels.some(label => !label.hidden)
  }
  search.addEventListener('input', filterCollections); filterCollections()
  const actions = node('div', '', form); actions.className = 'row editor-actions'
  const save = node('button', 'Save', actions); save.type = 'submit'
  form.addEventListener('submit', event => { event.preventDefault(); void run(async () => {
   fieldset.disabled = true
   try {
    const chapterNumber = Number(draft.chapter)
    if (!['to_read', 'finished'].includes(draft.status) && (!Number.isInteger(chapterNumber) || chapterNumber < 1)) throw new Error('Enter a valid current chapter.')
    const value = draft.status === 'to_read' ? 0 : draft.status === 'finished' ? page.metadata.published_chapters : chapterNumber - (draft.chapterFinished ? 0 : 1)
    if (value === null) throw new Error('The published chapter count is unavailable. Reload AO3 before finishing the work.')
    validateProgress(value, page.metadata)
    await GM.setValue(draftKey(), draft)
    accept(await rpc('save', { version: draft.version, metadata: page.metadata, status: draft.status, progress: value, notes: draft.notes, rating: draft.rating === '' ? null : Number(draft.rating), tags: parseLines(draft.tags), collections: draft.collections }))
    message.textContent = 'Saved'; clearEditor(); draft = null; showPanel(null)
    await GM.deleteValue(draftKey()).catch(() => { message.textContent = 'Saved. Could not clear the local draft.' })
   } finally { fieldset.disabled = false }
  }) })
  button('Cancel', async () => { await GM.deleteValue(draftKey()); clearEditor(); draft = null; showPanel(null) }, actions)
  if (entry) button('Reload saved entry', async () => { await load(); draft.version = entry?.version ?? null; await GM.setValue(draftKey(), draft); message.textContent = 'Saved entry reloaded. Your draft is retained; review it before saving.' }, actions).className = 'reload-entry'
  status.focus()
 }
 renderToolbar()
 if (connection) await run(load)
}

if (typeof GM !== 'undefined') void mountLibrary().catch(() => { /* Userscripts storage unavailable; no credential fallback to page storage. */ })
