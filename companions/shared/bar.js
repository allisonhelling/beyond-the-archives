import { defaultRatingInfo } from '../../src/features/library/rating-info'
import { resumeReadingStatus } from '../../src/features/library/reading-history'
import { seriesWorkMetadata } from '../../src/features/library/series/series'
import { blankMetadata, parseLines, statuses, validateProgress } from '../../src/features/library/model'
import { collectWorkPage, readPage } from './page'
import styles from './styles.css?inline'
import { conflictFromError, EditConflict, mergeEdits, resolveEdits } from '../../src/features/library/edit-merge'
import { mountPersonalControls, mountConflictReview } from './personal-controls'

export async function mountLibrary(doc = document, href = location.href, options = {}) {
 const { tile = null, api, browser = 'safari', config } = options
 const backendUrl = config?.backend ?? __SUPABASE_URL__, appOrigin = config?.appOrigin ?? __APP_ORIGIN__, publicKey = config?.publicKey ?? __SUPABASE_KEY__
 const page = tile?.page ?? readPage(doc, href)
 const hostId = tile ? `ao3-library-work-${page.work}` : 'ao3-library-companion'
 if (!page || doc.getElementById(hostId)) return
 const host = doc.createElement('div')
 host.id = hostId
 host.dataset.browser = browser
 if (tile) host.dataset.workTile = 'true'
 let ao3FontSize
 if (browser === 'chrome') {
  const scope = tile?.element ?? doc.querySelector('#workskin') ?? doc.querySelector('#main') ?? doc.body
  const summary = scope.querySelector('.summary p') ?? scope.querySelector('.summary blockquote') ?? scope.querySelector('.summary') ?? scope
  ao3FontSize = doc.defaultView.getComputedStyle(summary).fontSize
  host.style.setProperty('--ao3-font-size', ao3FontSize)
 }
 const root = host.attachShadow({ mode: 'closed' })
 const style = doc.createElement('style'); style.textContent = styles; root.append(style)
 const section = doc.createElement('section'); section.setAttribute('aria-label', 'AO3 Library'); root.append(section)
 if (tile) tile.element.append(host)
 else if (page.series) doc.querySelector('#main .series.work.index')?.before(host)
 else doc.querySelector('#workskin')?.before(host)
 if (!host.isConnected) doc.querySelector('#main')?.prepend(host)
 const bottomId = tile ? `${hostId}-progress` : 'ao3-library-progress'
 doc.getElementById(bottomId)?.remove()
 const bottomHost = doc.createElement('div'); bottomHost.id = bottomId
 bottomHost.dataset.browser = browser
 if (ao3FontSize) bottomHost.style.setProperty('--ao3-font-size', ao3FontSize)
 const bottomRoot = bottomHost.attachShadow({ mode: 'closed' }); bottomRoot.append(style.cloneNode(true))
 const bottomSection = doc.createElement('section'); bottomSection.className = 'bottom-section'; bottomSection.setAttribute('aria-label', 'Reading progress'); bottomRoot.append(bottomSection)
 const bottomBar = doc.createElement('div'); bottomBar.className = 'row bottom-bar'; bottomBar.setAttribute('aria-live', 'polite'); bottomSection.append(bottomBar)
 const bottomMessage = doc.createElement('p'); bottomMessage.setAttribute('aria-live', 'polite'); bottomSection.append(bottomMessage)
 if (!tile && !page.series) {
  const bottomAnchor = doc.querySelector('#kudos') ?? doc.querySelector('.kudos') ?? doc.querySelector('#feedback')
  if (bottomAnchor) bottomAnchor.before(bottomHost)
  else doc.querySelector('#workskin')?.after(bottomHost)
 }
 bottomHost.hidden = true
 const storageKey = `connection:${backendUrl}`, themeKey = `theme:${backendUrl}`
 const preferredTheme = doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
 let [connection, theme, previousRatingInfo] = await Promise.all([api.getValue(storageKey, null), api.getValue(themeKey, preferredTheme), api.getValue(`rating-info:${backendUrl}`, null)])
 let ratingInfo = defaultRatingInfo, savedRatingInfo = null
 theme = ['light', 'dark'].includes(theme) ? theme : preferredTheme
 const applyTheme = () => [host, bottomHost].forEach(surface => { surface.dataset.theme = theme })
 applyTheme()
 let entry = null, collections = [], loaded = false, busy = false, draft = null, activePanel = null, syncEditorProgress = null, personalControls = null, syncEditorDraft = null, disposeConflict = null, pendingConflict = null, savedWorks = [], seriesControls = []
 const toolbar = doc.createElement('div'); toolbar.className = 'toolbar'; section.append(toolbar)
 const message = doc.createElement('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite')
 const panel = doc.createElement('div'); section.append(message, panel)
 const editorPanel = doc.createElement('div'), connectionPanel = doc.createElement('div')
 editorPanel.id = 'library-editor'; connectionPanel.id = 'library-connection'
 panel.append(editorPanel, connectionPanel)
 const conflictPanel = doc.createElement('div'); section.append(conflictPanel)
 const footer = doc.createElement('small'); footer.textContent = `AO3 Library v${__SCRIPT_VERSION__} · `
 const update = doc.createElement('a'); update.href = `${appOrigin}/settings#${browser === 'chrome' ? 'ao3-browser-bar' : 'ios-safari-userscript'}`; update.target = '_blank'; update.rel = 'noopener noreferrer'; update.textContent = 'Connection & Update Instructions'
 footer.append(update); section.append(footer)
 showPanel(null)
 const draftKey = () => `draft:${backendUrl}:${connection.userId}:${page.series ? 'series:' : ''}${page.work}`
 function node(tag, text, parent) { const element = doc.createElement(tag); if (text) element.textContent = text; parent?.append(element); return element }
 function button(label, action, parent = toolbar) {
  const element = node('button', label, parent); element.type = 'button'; element.disabled = busy || Boolean(pendingConflict)
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
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round')
  for (const d of paths) { const path = doc.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path) }
  parent.append(svg); return svg
 }
 function infoHelp(parent, title, description, summaryText) {
  const info = node('details', '', parent); info.className = 'field-info'
  const summary = node('summary', '', info); summary.setAttribute('aria-label', `About ${title}`)
  if (summaryText) {
   summary.textContent = summaryText; summary.title = description; info.classList.add('chapter-progress')
  } else {
   const infoIcon = icon(['M12 11v6', 'M12 7h.01'], summary)
   const circle = doc.createElementNS(infoIcon.namespaceURI, 'circle'); circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '10'); infoIcon.prepend(circle)
  }
  node('span', description, info)
 }
 function clearConflict() {
  pendingConflict = null; disposeConflict?.(); disposeConflict = null; conflictPanel.replaceChildren()
  editorPanel.querySelector('form fieldset')?.removeAttribute('disabled')
  ;[root, bottomRoot].forEach(surface => surface.querySelectorAll('button').forEach(button => { button.disabled = busy || button.dataset.atBoundary === 'true' }))
 }
 function showConflict(error) {
  disposeConflict?.(); pendingConflict = error
  editorPanel.querySelector('form fieldset')?.setAttribute('disabled', '')
  disposeConflict = mountConflictReview(conflictPanel, { conflict: error, collections, onCancel: clearConflict, onError: next => { if (next instanceof EditConflict) showConflict(next); else message.textContent = next instanceof Error ? next.message : 'Could not save. Your draft is preserved.' }, onSaved: async data => {
   accept(data); clearConflict()
   if (error.action === 'progress') await syncProgressDraft()
   else { clearEditor(); draft = null; showPanel(null); await api.deleteValue(draftKey()) }
   message.textContent = 'Saved'; renderToolbar()
  } })
 }
 function clearEditor() { seriesControls.forEach(control => control.unmount()); seriesControls = []; personalControls?.unmount(); personalControls = null; syncEditorProgress = null; syncEditorDraft = null; editorPanel.replaceChildren() }
 function resetPanels() { clearConflict(); showPanel(null); clearEditor(); connectionPanel.replaceChildren() }
 function panelButton(label, name, action, parent = toolbar) {
  const element = button(label, async () => {
   await action()
   if (bottomBar.contains(element) && activePanel === name) {
    host.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    panel.querySelector('div:not([hidden]) input, div:not([hidden]) textarea')?.focus({ preventScroll: true })
   }
  }, parent)
  element.setAttribute('aria-expanded', String(activePanel === name))
  element.setAttribute('aria-controls', name === 'editor' ? editorPanel.id : connectionPanel.id)
  return element
 }
 async function run(action) {
  if (busy) return
  busy = true; message.textContent = ''; [root, bottomRoot].forEach(surface => surface.querySelectorAll('button').forEach(button => { button.disabled = true }))
  try { await action() }
  catch (error) { if (error instanceof EditConflict) showConflict(error); message.textContent = error instanceof Error ? error.message : 'Connection failed. Your draft is preserved.' }
  finally { busy = false; renderToolbar(); root.querySelectorAll('button').forEach(button => { if (!conflictPanel.contains(button)) button.disabled = Boolean(pendingConflict) || button.dataset.atBoundary === 'true' }); bottomMessage.textContent = message.textContent === 'Saved' ? '' : message.textContent }
 }
 async function rpc(action, input = {}, secret = connection?.secret) {
  const backend = new URL(backendUrl)
  const networkMessage = ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname)
   && browser === 'safari' ? 'This script points to a local development server. Install the hosted Safari userscript to connect from an iPhone. Your draft is preserved.'
   : `Cannot reach the library backend. Check your connection and ${browser === 'chrome' ? 'extension' : 'Userscripts network'} access to ${backend.hostname}, then retry. Your draft is preserved.`
  let response
  try { response = await api.xmlHttpRequest({
   method: 'POST', url: `${backendUrl}/rest/v1/rpc/userscript_library`, timeout: 20000,
   headers: { apikey: publicKey, 'Content-Type': 'application/json' },
   data: JSON.stringify({ p_secret: secret, p_action: page.series && ['get', 'save'].includes(action) ? `series_${action}` : action, p_work: page.work, p_input: input }),
  }) } catch (error) { if (error?.code === 'ENVIRONMENT_CHANGED') throw error; throw new Error(networkMessage) }
  if (!response?.status) throw new Error(networkMessage)
  let data
  try { data = JSON.parse(response.responseText) } catch { throw new Error('Backend unavailable. Your draft is preserved; try again.') }
  if (response.status < 200 || response.status >= 300) {
   if (data.code === '28000') {
    if (action === 'claim') throw new Error(`Pairing code not accepted by ${appOrigin}. Create a fresh code on that website and paste it within 5 minutes.${browser === 'chrome' ? ' Check the selected Hosted / Local environment in the extension settings and reload AO3.' : ''} Your draft is preserved.`)
    throw new Error('Device authorization expired or was revoked. Reconnect below; your draft is preserved.')
   }
   const conflict = conflictFromError(data, (values, base) => rpc(action, { ...input, ...values, base }))
   if (conflict) { conflict.action = action; throw conflict }
   if (data.code === '40001' && action === 'rating_save') throw new Error('This rating explanation changed on another device. Close and reopen Rating Info to load it before saving again. Your text is kept here.')
   if (data.code === '40001') throw new Error('This entry changed elsewhere. Reload Saved Entry, review your draft, then save again.')
   throw new Error('Could not save or load. Check your connection and chapter count, then retry. Your draft is preserved.')
  }
  return data
 }
 function acceptRatingInfo(data) {
  if (!Object.hasOwn(data, 'ratingInfo')) return
  savedRatingInfo = data.ratingInfo
  ratingInfo = typeof savedRatingInfo === 'string' ? savedRatingInfo : defaultRatingInfo
  personalControls?.updateRatingInfo(ratingInfo)
  seriesControls.forEach(control => control.updateRatingInfo(ratingInfo))
 }
 function accept(data) { acceptRatingInfo(data); savedWorks = data.savedWorks ?? []; entry = data.entry; collections = data.collections; loaded = true }
 function entryPosition() {
  const chapter = Math.min(entry.progress + 1, page.metadata.published_chapters || entry.progress + 1)
  return { chapter, chapterFinished: entry.progress >= chapter }
 }
 function preserveDraft() {
  return api.setValue(draftKey(), draft).catch(() => { message.textContent = 'Could not preserve the draft on this device. Keep this panel open.' })
 }
 async function load() { accept(await rpc('get')); renderToolbar() }
 async function progress(value, status) {
  validateProgress(value, page.metadata)
  const previous = entry
  entry = { ...entry, progress: value, status }; renderToolbar()
  try { accept(await rpc('progress', { version: previous.version, base: { status: previous.status, progress: previous.progress }, progress: value, status })) }
  catch (error) { entry = previous; renderToolbar(); throw error }
  renderToolbar()
  await syncProgressDraft()
  message.textContent = 'Saved'
  renderToolbar()
 }
 function entryValues(value = entry) {
  return value ? { status: value.status, progress: value.progress, notes: value.notes, rating: value.rating ?? null, tags: value.tags, collections: value.collections } : {}
 }
 function draftValues() {
  const progress = draft.status === 'to_read' ? 0 : draft.status === 'finished' ? page.metadata.published_chapters : Number(draft.chapter) - (draft.chapterFinished ? 0 : 1)
  return { status: draft.status, progress, notes: draft.notes, rating: draft.rating === '' ? null : Number(draft.rating), tags: parseLines(draft.tags), collections: draft.collections }
 }
 function applyDraft(values) {
  const local = draftValues()
  if (values.status !== local.status || values.progress !== local.progress) {
   const chapter = Math.min(values.progress + 1, page.metadata.published_chapters || values.progress + 1)
   draft.chapter = chapter; draft.chapterFinished = values.progress >= chapter
  }
  Object.assign(draft, { status: values.status, notes: values.notes, rating: values.rating ?? '', tags: values.tags.join('\n'), collections: values.collections })
  syncEditorDraft?.()
 }
 async function reconcileDraft() {
  const base = entryValues(), review = mergeEdits(draft.base ?? {}, draftValues(), base)
  applyDraft(review.merged)
  if (review.conflicts.length) {
   // Keep the original baseline until the conflict is explicitly resolved.
   await preserveDraft()
   const conflict = new EditConflict({ ...review, base }, choices => rpc('save', { ...resolveEdits(review.merged, choices), metadata: page.metadata, version: entry.version, base }))
   conflict.action = 'save'; throw conflict
  }
  draft.base = base; draft.version = entry?.version ?? null; await preserveDraft()
 }
 async function syncProgressDraft() {
  draft = draft ?? await api.getValue(draftKey(), null)
  if (draft) {
   Object.assign(draft, entryPosition(), { status: entry.status })
   draft.base = { ...(draft.base ?? {}), status: entry.status, progress: entry.progress }
   syncEditorProgress?.(); await reconcileDraft()
  }
 }
 function renderProgress(parent, summaryParent = parent) {
  const summary = node('div', '', summaryParent); summary.className = 'row reading-summary'
  node('strong', entry.status === 'reading' ? 'Currently Reading' : statuses[entry.status], summary)
  const bullet = node('span', '•', summary); bullet.className = 'status-bullet'; bullet.dataset.status = entry.status; bullet.setAttribute('aria-hidden', 'true')
  infoHelp(summary, 'chapters read', 'chapters read', `Ch. ${entry.progress} / ${page.metadata.published_chapters ?? '?'}`)
  if (browser === 'chrome' && ['reading', 're_reading', 'waiting_for_updates', 'paused_reading'].includes(entry.status)) {
   const paused = entry.status === 'paused_reading'
   button(paused ? 'Resume Reading' : 'Pause Reading', () => progress(entry.progress, paused ? resumeReadingStatus({ reading_history: entry.readingHistory }) : 'paused_reading'), parent)
  }
  if (!page.current) return
  const read = entry.progress >= page.current
  if (read) {
   const indicator = node('span', '', parent); indicator.className = 'completion-indicator'
   icon(['M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0', 'm8 12 3 3 5-6'], indicator)
   node('span', 'Read', indicator)
  } else {
   const final = entry.status !== 'to_read' && page.current === page.metadata.total_chapters && page.metadata.published_chapters === page.metadata.total_chapters
   const complete = button(final ? 'Finished' : `Ch. ${page.current}`, () => progress(Math.max(entry.progress, page.current), final ? 'finished' : entry.status === 're_reading' ? 're_reading' : 'reading'), parent)
   if (!final) complete.setAttribute('aria-label', `Mark through chapter ${page.current} as read`)
   complete.className = 'complete-chapter'
   complete.prepend(icon(['m5 12 4 4L19 6'], complete))
  }
 }
 function libraryLink(parent) {
  const logo = node('a', '', parent); logo.className = 'library-link'; logo.href = entry?.id ? page.series ? `${appOrigin}/series/${page.work}` : `${appOrigin}/stories/${encodeURIComponent(entry.id)}` : `${appOrigin}/library`; logo.target = '_blank'; logo.rel = 'noopener noreferrer'; logo.setAttribute('aria-label', 'View in between chapters library')
  // Trusted, build-time Lucide logo markup; no page or user content is injected.
  const mark = node('span', '', logo); mark.className = 'brand-icon'; mark.innerHTML = __BRAND_ICON__
 }
 function renderToolbar() {
  toolbar.replaceChildren(); bottomBar.replaceChildren()
  const inlineInstructions = browser === 'chrome' && !connection && !activePanel
  toolbar.classList.toggle('toolbar-disconnected', inlineInstructions)
  bottomHost.hidden = Boolean(page.series || tile)
  bottomBar.className = entry ? 'row bottom-bar' : 'toolbar'
  footer.hidden = Boolean(connection && !activePanel)
  renderBar(toolbar)
  footer.classList.toggle('inline-instructions', inlineInstructions)
  if (inlineInstructions) toolbar.querySelector('.toolbar-progress').append(footer)
  else section.append(footer)
  if (entry && !page.series) renderProgress(bottomBar)
  else renderBar(bottomBar)
 }
 function renderBar(parent) {
  libraryLink(parent)
  const center = node('div', '', parent); center.className = 'row toolbar-progress'
  const actions = node('div', '', parent); actions.className = 'row toolbar-actions'
  if (config?.label) { const label = node('span', config.label, actions); label.className = 'environment-label'; label.setAttribute('aria-label', `Library environment: ${config.label}`) }
  if (!connection) { panelButton('Connect Library', 'connection', showConnection, actions); return }
  if (!loaded) button('Load Saved Entry', load, center)
  else if (!entry) panelButton('Add to Library', 'editor', openEditor, center)
  else {
   if (page.series) node('span', 'Series saved', center)
   else renderProgress(actions, center)
   const edit = panelButton('Edit', 'editor', openEditor, actions); edit.className = 'edit-button'
   edit.prepend(icon(['m16 3 5 5-12 12-6 1 1-6Z', 'm14 5 5 5'], edit))
  }
  const settings = panelButton('', 'connection', showConnection, actions)
  settings.className = 'settings-button'; settings.setAttribute('aria-label', 'Connection'); settings.title = 'Connection settings'
  icon(['M3 6h4m4 0h10M3 12h10m4 0h4M3 18h6m4 0h8M7 3v6m10 0v6M9 15v6'], settings)
 }
 function showConnection() {
  if (activePanel === 'connection') { showPanel(null); return }
  showPanel('connection')
  if (connectionPanel.childNodes.length) return
  const settingsActions = node('div', '', connectionPanel); settingsActions.className = 'row connection-settings'
  const themeToggle = button('', async () => {
   const next = theme === 'light' ? 'dark' : 'light'
   try { await api.setValue(themeKey, next) }
   catch { throw new Error('Could not save your color mode. Try again.') }
   theme = next; applyTheme(); renderThemeToggle()
  }, settingsActions)
  themeToggle.className = 'theme-toggle'
  function renderThemeToggle() {
   themeToggle.replaceChildren()
   icon(theme === 'light' ? ['M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z'] : ['M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0', 'M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42'], themeToggle)
   node('span', theme === 'light' ? 'Dark Mode' : 'Light Mode', themeToggle)
  }
  renderThemeToggle()
  let ratingBase = savedRatingInfo
  const ratingToggle = button('Rating Info', async () => {
   if (ratingEditor.hidden && connection) {
    acceptRatingInfo(await rpc('rating_get')); ratingText.value = ratingInfo; ratingBase = savedRatingInfo
   }
   ratingEditor.hidden = !ratingEditor.hidden
   ratingToggle.setAttribute('aria-expanded', String(!ratingEditor.hidden))
   if (!ratingEditor.hidden) ratingText.focus()
  }, settingsActions)
  ratingToggle.setAttribute('aria-expanded', 'false'); ratingToggle.setAttribute('aria-controls', 'library-rating-info')
  const ratingEditor = node('div', '', connectionPanel); ratingEditor.id = 'library-rating-info'; ratingEditor.className = 'rating-info-editor'; ratingEditor.hidden = true
  const ratingLabel = node('label', 'Rating info text', ratingEditor), ratingText = node('textarea', '', ratingLabel)
  ratingText.rows = 4; ratingText.value = ratingInfo
  ratingText.maxLength = 10000
  node('p', 'Saved to your library account across devices. Leave blank and save to hide the rating info icon.', ratingEditor)
  if (typeof previousRatingInfo === 'string' && savedRatingInfo === null) button('Use this device’s previous explanation', () => { ratingText.value = previousRatingInfo }, ratingEditor)
  button('Save Rating Info', async () => {
   const next = ratingText.value
   if (!connection) throw new Error('Connect your library before saving rating info.')
   try { acceptRatingInfo(await rpc('rating_save', { text: next, base: ratingBase })) }
   catch (error) { throw new Error(`Could not save your rating info. ${error.message}`) }
   ratingBase = savedRatingInfo
   message.textContent = 'Rating info saved to your library account.'
  }, ratingEditor)
  const libraryLink = node('a', `Library Settings (${appOrigin})`, connectionPanel)
  libraryLink.href = `${appOrigin}/settings#ao3-browser-bar`; libraryLink.target = '_blank'; libraryLink.rel = 'noopener noreferrer'
  node('p', 'In Library Settings → AO3 Browser Bar, create a pairing code. Paste it here within 5 minutes. This grants library access for 90 days.', connectionPanel)
  const label = node('label', 'One-Time Pairing Code', connectionPanel), input = node('input', '', label)
  input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false
  const actions = node('div', '', connectionPanel); actions.className = 'row'
  button('Connect', async () => {
   const next = await rpc('claim', {}, input.value.trim())
   await api.setValue(storageKey, next); connection = next; input.value = ''; loaded = false; draft = null; resetPanels()
   await load(); message.textContent = 'Library connected'
  }, actions)
  if (connection) button('Disconnect Device', async () => {
   await rpc('disconnect'); await api.deleteValue(storageKey); connection = null; entry = null; loaded = false; draft = null; resetPanels(); message.textContent = 'Device disconnected. Local unsaved drafts are retained for this account.'
  }, actions)
  button('Close', () => showPanel(null), actions)
 }
 // One collection field serves standalone works, series, and selected installments.
 function collectionPicker(parent, title, value, onChange) {
  const field = node('div', '', parent); field.className = 'collection-picker'
  const heading = node('div', '', field); heading.className = 'row collection-heading'
  node('h4', title, heading)
  const names = node('ul', '', field); names.className = 'collection-names'
  const editor = node('div', '', field); editor.hidden = true
  const trigger = button('', () => { editor.hidden = !editor.hidden; trigger.setAttribute('aria-expanded', String(!editor.hidden)); if (!editor.hidden) search.focus() }, heading)
  trigger.setAttribute('aria-expanded', 'false')
  const searchLabel = node('label', '', editor), search = node('input', '', searchLabel)
  search.type = 'search'; search.placeholder = 'Search Custom Collections'; search.setAttribute('aria-label', 'Search Custom Collections')
  const list = node('fieldset', '', editor); list.setAttribute('aria-label', title)
  const empty = node('p', collections.length ? 'No matching collections.' : 'Create custom collections in your library.', editor)
  function sync() {
   const assigned = collections.filter(collection => value().includes(collection.id))
   names.replaceChildren(); names.hidden = !assigned.length
   for (const collection of assigned) node('li', collection.name, names)
   trigger.replaceChildren()
   if (assigned.length) {
    icon(['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z'], trigger)
    trigger.setAttribute('aria-label', `Edit ${title}`); trigger.title = `Edit ${title}`; trigger.className = 'collection-edit'
   } else {
    trigger.textContent = 'Add to Collection'; trigger.removeAttribute('aria-label'); trigger.removeAttribute('title'); trigger.className = ''
   }
   list.querySelectorAll('input').forEach(checkbox => { checkbox.checked = value().includes(checkbox.value) })
  }
  for (const collection of collections) {
   const label = node('label', collection.name, list), checkbox = node('input', '', label)
   checkbox.type = 'checkbox'; checkbox.value = collection.id; label.dataset.name = collection.name.toLocaleLowerCase()
   checkbox.addEventListener('change', () => { onChange(checkbox.checked ? [...value(), collection.id] : value().filter(id => id !== collection.id)); sync(); void preserveDraft() })
  }
  const filter = () => {
   const query = search.value.trim().toLocaleLowerCase(), labels = [...list.querySelectorAll('label')]
   labels.forEach(label => { label.hidden = !label.dataset.name.includes(query) }); empty.hidden = labels.some(label => !label.hidden)
  }
  search.addEventListener('input', filter)
  button('Done', () => { editor.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus() }, editor)
  sync(); filter()
  return sync
 }
 function seriesSaveInput() {
  const works = page.series.works.flatMap(work => {
    const detail = draft.works[work.workId]
    if (!detail?.selected || savedWorks.includes(work.workId)) return []
    const metadata = seriesWorkMetadata(work, page.series)
    const progress = detail.status === 'to_read' ? 0 : detail.status === 'finished' ? metadata.published_chapters : detail.progress
    if (progress === null) throw new Error('Enter the published chapter count before marking this work Finished.')
    validateProgress(progress, metadata)
    return [{ workId: work.workId, metadata, ...detail, progress, rating: detail.rating === '' ? null : Number(detail.rating), tags: parseLines(detail.tags) }]
   })
  return { version: draft.version, preview: page.series, notes: draft.notes, favorite: draft.favorite, collections: draft.collections, works }
 }
 async function openSeriesEditor() {
  const stored = await api.getValue(draftKey(), null)
  draft = draft ?? stored ?? { version: entry?.version ?? null, notes: entry?.notes ?? '', favorite: entry?.favorite ?? false, collections: entry?.collections ?? [], works: {}, base: { notes: entry?.notes ?? '', favorite: entry?.favorite ?? false, collections: entry?.collections ?? [] } }
  showPanel('editor')
  const form = node('form', '', editorPanel), fieldset = node('fieldset', '', form)
  if (page.series.nextUrl) {
   node('p', 'This listing has more pages. Save this page, then visit the next page to add more works.', fieldset)
   const next = node('a', 'Next Series Page', fieldset); next.href = page.series.nextUrl
  }
  function input(parent, title, tag, value, onChange, type) {
   const label = node('label', title, parent), control = node(tag, '', label)
   control.setAttribute('aria-label', title)
   if (type) control.type = type
   if (type === 'checkbox') control.checked = value
   else control.value = value
   control.addEventListener('change', () => { onChange(type === 'checkbox' ? control.checked : control.value); void preserveDraft() })
   return control
  }
  input(fieldset, 'Series Private Notes', 'textarea', draft.notes, value => { draft.notes = value })
  input(fieldset, 'Favorite Series', 'input', draft.favorite, value => { draft.favorite = value }, 'checkbox')
  collectionPicker(fieldset, 'Series Collections', () => draft.collections, value => { draft.collections = value })
  node('p', 'Choose works to add. Already saved works keep their existing progress and details. You can also save the series without adding works.', fieldset)
  const all = button('Select All Available Works', async () => {
   for (const checkbox of fieldset.querySelectorAll('input[data-work-choice]')) { checkbox.checked = true; checkbox.dispatchEvent(new Event('change')) }
  }, fieldset)
  all.disabled = false
  for (const work of page.series.works) {
   const row = node('div', '', fieldset)
   const saved = savedWorks.includes(work.workId)
   const details = draft.works[work.workId] ??= { selected: false, status: 'to_read', progress: 0, notes: '', rating: '', tags: '', collections: [] }
   const checkbox = input(row, `${work.position ? `Part ${work.position}: ` : ''}${work.title}${saved ? ' (already saved)' : ''}`, 'input', saved || details.selected, value => { details.selected = value }, 'checkbox')
   checkbox.disabled = saved
   if (!saved) checkbox.dataset.workChoice = String(work.workId)
   if (saved) continue
   const disclosure = node('details', '', row); disclosure.className = 'work-details'
   node('summary', 'Details below apply only to this work when selected.', disclosure)
   const status = input(disclosure, `Reading Status: ${work.title}`, 'select', details.status, value => { details.status = value })
   for (const [key, title] of Object.entries(statuses)) { const option = node('option', title, status); option.value = key }
   status.value = details.status
   const chapter = input(disclosure, `Chapters Read: ${work.title}`, 'input', details.progress, value => { details.progress = Number(value) }, 'number'); chapter.min = '0'; chapter.step = '1'
   input(disclosure, `Private Notes: ${work.title}`, 'textarea', details.notes, value => { details.notes = value })
   seriesControls.push(mountPersonalControls(node('div', '', disclosure), details, () => { void preserveDraft() }, ratingInfo))
   collectionPicker(disclosure, 'Work Collections', () => details.collections, value => { details.collections = value })
  }
  const actions = node('div', '', form); actions.className = 'row editor-actions'
  const save = node('button', 'Save Series and Selected Works', actions); save.type = 'submit'
  button('Cancel', async () => { clearEditor(); draft = null; showPanel(null); await api.deleteValue(draftKey()) }, actions)
  if (entry) {
   const reload = node('span', '', actions); reload.className = 'field-control reload-entry'
   button('Reload Saved Series', async () => {
    await load()
    const base = { notes: entry.notes, favorite: entry.favorite, collections: entry.collections }
    const local = { notes: draft.notes, favorite: draft.favorite, collections: draft.collections }
    const review = mergeEdits(draft.base ?? {}, local, base)
    Object.assign(draft, review.merged, { version: entry.version, base })
    await preserveDraft()
    if (review.conflicts.length) {
     const conflict = new EditConflict({ ...review, base }, choices => rpc('save', { ...seriesSaveInput(), ...resolveEdits(review.merged, choices) }))
     conflict.action = 'save'; throw conflict
    }
    clearEditor(); await openSeriesEditor()
    message.textContent = 'Saved series reloaded. Your local work selections and edits are retained.'
   }, reload)
   infoHelp(reload, 'Reload Saved Series', 'Loads the latest saved series notes, favorite and collections from your library. Your local work selections and edits are kept. Conflicting changes can be reviewed before saving. Reloading does not save your draft or refresh AO3 metadata.')
  }
  form.addEventListener('submit', event => { event.preventDefault(); void run(async () => {
   accept(await rpc('save', seriesSaveInput()))
   clearEditor(); draft = null; showPanel(null); await api.deleteValue(draftKey()); message.textContent = 'Saved'
  }) })
 }
 async function openEditor() {
  if (activePanel === 'editor') { showPanel(null); return }
  if (editorPanel.childNodes.length) { showPanel('editor'); return }
  if (!loaded) await load()
  if (page.series) { await openSeriesEditor(); return }
  const stored = await api.getValue(draftKey(), null)
  draft = draft ?? stored ?? (entry ? { version: entry.version, status: entry.status, ...entryPosition(), notes: entry.notes, rating: entry.rating ?? '', tags: entry.tags.join('\n'), collections: entry.collections } : { ...page.defaults, version: null, notes: '', rating: '', tags: '', collections: [] })
  if (!Object.hasOwn(draft, 'base')) draft.base = stored ? {} : entryValues()
  if (stored) message.textContent = 'Unsaved draft restored. Review it before saving.'
  showPanel('editor')
  if (entry) node('h3', 'Edit Library Entry', editorPanel)
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
   const control = node('span', '', input.parentElement); control.className = 'field-control'; control.append(input)
   infoHelp(control, title, description)
  }
  const status = field('Reading Status', 'select', 'status')
  for (const key of [...new Set(['to_read', 'reading', 'paused_reading', 'finished', 're_reading', ...(entry ? [entry.status] : [])])]) { const option = node('option', key === 'reading' ? 'Currently Reading' : statuses[key], status); option.value = key }
  status.value = draft.status
  help(status, 'reading status', 'To Read marks no chapters as read. Finished status marks every published chapter read. Re-Reading marks the fic as previously read (Finished) and still tracks your chapter.')
  const chapter = field('Current Chapter', 'input', 'chapter'); chapter.type = 'number'; chapter.min = '1'; chapter.step = '1'; chapter.value = draft.chapter
  if (page.metadata.published_chapters) chapter.max = String(page.metadata.published_chapters)
  help(chapter, 'current chapter', 'Current Chapter − 1 counts as completed; check finished to include this chapter.')
  const finished = field('This Chapter Is Finished', 'input', 'chapterFinished'); finished.type = 'checkbox'; finished.checked = draft.chapterFinished
  function showChapterFields() {
   const tracking = !['to_read', 'finished'].includes(status.value)
   chapter.closest('label').hidden = finished.closest('label').hidden = !tracking
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
   const control = node('span', '', input.parentElement); control.className = 'field-control notes-control'; control.append(input)
   const toggle = node('button', 'Collapse', control); toggle.type = 'button'; toggle.className = 'text-toggle'; toggle.setAttribute('aria-label', `Collapse ${title}`)
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
  const notes = growingField('Private Notes', 'notes', 3)
  const personal = node('div', '', fieldset)
  const renderPersonal = () => { personalControls?.unmount(); personalControls = mountPersonalControls(personal, draft, () => { void preserveDraft() }, ratingInfo) }
  renderPersonal()
  const syncCollections = collectionPicker(fieldset, 'Collections', () => draft.collections, value => { draft.collections = value })
  syncEditorDraft = () => {
   syncEditorProgress(); notes.value = draft.notes; notes.dispatchEvent(new Event('resize-text')); renderPersonal()
   syncCollections()
  }
  const actions = node('div', '', form); actions.className = 'row editor-actions'
  const save = node('button', 'Save', actions); save.type = 'submit'
  form.addEventListener('submit', event => { event.preventDefault(); if (pendingConflict) return; void run(async () => {
   fieldset.disabled = true
   try {
    if (!entry && !tile) Object.assign(page, await collectWorkPage(doc, href))
    const chapterNumber = Number(draft.chapter)
    if (!['to_read', 'finished'].includes(draft.status) && (!Number.isInteger(chapterNumber) || chapterNumber < 1)) throw new Error('Enter a valid current chapter.')
    const value = draft.status === 'to_read' ? 0 : draft.status === 'finished' ? page.metadata.published_chapters : chapterNumber - (draft.chapterFinished ? 0 : 1)
    if (value === null) throw new Error('The published chapter count is unavailable. Reload AO3 before finishing the work.')
    validateProgress(value, page.metadata)
    await api.setValue(draftKey(), draft)
    accept(await rpc('save', { version: draft.version, base: draft.base, metadata: page.metadata, status: draft.status, progress: value, notes: draft.notes, rating: draft.rating === '' ? null : Number(draft.rating), tags: parseLines(draft.tags), collections: draft.collections }))
    message.textContent = 'Saved'; clearEditor(); draft = null; showPanel(null)
    await api.deleteValue(draftKey()).catch(() => { message.textContent = 'Saved. Could not clear the local draft.' })
   } finally { fieldset.disabled = false }
  }) })
  button('Cancel', async () => { await api.deleteValue(draftKey()); clearEditor(); draft = null; showPanel(null) }, actions)
  if (entry && !tile) {
   const recollect = node('span', '', actions); recollect.className = 'field-control'
   button('Collect Metadata', async () => {
    const refreshed = await collectWorkPage(doc, href)
    if (!refreshed?.metadata.title) throw new Error('AO3 metadata is unavailable. Reload this work and try again.')
    const result = await rpc('refresh_metadata', { version: entry.version, metadata: refreshed.automaticMetadata, chapters: refreshed.chapters })
    accept(result); Object.assign(page, refreshed)
    if (page.metadata.published_chapters) chapter.max = String(page.metadata.published_chapters)
    else chapter.removeAttribute('max')
    message.textContent = 'Metadata recollected. Your reading progress and draft are unchanged.'
   }, recollect)
   infoHelp(recollect, 'collect metadata', 'Recollect metadata from this AO3 page. Reload AO3 first for the latest changes.')
  }
  if (entry) {
   const reload = node('span', '', actions); reload.className = 'field-control reload-entry'
   button('Reload Saved Entry', async () => { await load(); await reconcileDraft(); message.textContent = 'Saved entry reloaded. Unchanged fields were updated; your local edits are retained.' }, reload)
   infoHelp(reload, 'reload saved entry', 'Loads this fic’s latest saved information from your hosted library. Newer saved notes and other fields update only fields you have not edited here. Your local edits are kept, and changes to different fields merge automatically. If both devices edited the same field, choose a version or combine notes before saving. Reloading does not save your draft or refresh AO3 metadata.')
  }
  status.focus()
 }
 renderToolbar()
 api.onEnvironmentChange?.(label => {
  message.textContent = `Environment changed to ${label}. Reload AO3 to use it. Your draft is preserved for ${config?.label ?? 'this library'}.`
  root.querySelectorAll('.environment-label').forEach(node => { node.textContent = `${label} · reload AO3`; node.setAttribute('aria-label', `Library environment: ${label}; reload AO3`) })
 })
 doc.defaultView?.addEventListener('focus', () => {
  if (host.isConnected && connection && !busy) void run(async () => { acceptRatingInfo(await rpc('rating_get')) })
 })
 if (connection) await run(load)
 if (page.series) {
  for (const work of page.series.works) {
   const element = [...doc.querySelectorAll('.series.work.index li.work')].find(item => [...item.querySelectorAll('h4.heading a')].some(link => new URL(link.getAttribute('href'), href).href === work.url))
   if (!element) continue
   const automaticMetadata = seriesWorkMetadata(work, page.series)
   await mountLibrary(doc, work.url, { ...options, tile: { element, page: { work: work.workId, metadata: { ...blankMetadata, ...automaticMetadata }, automaticMetadata, chapters: {}, current: null, defaults: { status: 'to_read', chapter: 1, chapterFinished: false } } } })
  }
 }
}
