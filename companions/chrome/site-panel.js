import { listStoryFields, normalizedField, readObservations, storyFields } from '../../src/features/imports/site-mapping.ts'
import { parseLines, statuses } from '../../src/features/library/model'

const get = id => document.getElementById(id)
const form = get('editor'), inputs = form.elements, notices = get('notice'), mapping = get('mapping'), fields = get('fields')
const nonce = location.hash.slice(1)
const via = 'Mapped Element'
const send = async (action, data = {}) => {
 const reply = await chrome.runtime.sendMessage({ type: 'BTA_SITE_INTERNAL', nonce, action, ...data })
 if (!reply?.ok) throw new Error(reply?.error ?? 'The source page changed. Reopen the companion.')
 return reply
}
const notice = text => { notices.textContent = text }
function handle(action) { return () => void Promise.resolve().then(action).catch(error => notice(error.message)) }
function element(tag, text, props = {}) { return Object.assign(document.createElement(tag), props, text === undefined ? {} : { textContent: text }) }
function button(text, action) { const control = element('button', text, { type: 'button' }); control.onclick = handle(action); return control }
function label(text, control) { const wrapper = element('label', text); wrapper.append(control); return wrapper }
function option(value, text = value) { return element('option', text, { value }) }
const changed = new Set(), used = {}
let request, original, observed, validations, isConnected, statusChanged = false, timer, inProgress = false, recovered = false
const mappingDraft = { field: '', selectors: [], strip: '', paused: false }
function useFields() {
 const values = {}
 for (const field of Object.keys(storyFields)) values[field] = inputs[field].value
 return {
  fields: values, changedFields: [...changed],
  manual: inputs.manual.checked, status: inputs.status.value, statusChanged,
  notes: inputs.notes.value, rating: inputs.rating.value, evidence: used, tags: parseLines(inputs.tags.value),
  collections: [...get('collections').querySelectorAll('input:checked')].map(input => input.value),
 }
}
function draft() {
 return { story: useFields(), storyId: original?.id ?? null, mapping: { ...mappingDraft } }
}
function persist() {
 clearTimeout(timer)
 return send('draft', { draft: draft(), recovered })
}
function queueDraft() { clearTimeout(timer); timer = setTimeout(handle(persist), 250) }
function normalizedStory(data) {
 for (const [field, value] of Object.entries(data.fields)) {
  if (value && !normalizedField(field, value) && field !== 'publication_status') throw new Error(`Enter a valid value for ${storyFields[field]}.`)
 }
 if (!data.manual && data.changedFields.includes('published_chapters') && data.fields.published_chapters && normalizedField('published_chapters', data.fields.published_chapters) !== observed.published_chapters?.text && used.published_chapters?.text !== data.fields.published_chapters) throw new Error('Select Manually Entered Chapter Count for a corrected count.')
 return data
}
async function startSelection(field = '', restored) {
 Object.assign(mappingDraft, { field, selectors: [], strip: '', paused: false }, restored)
 renderMapping()
 await send('select', { paused: mappingDraft.paused, selectors: mappingDraft.selectors })
 mapping.querySelector('select').focus()
 queueDraft()
}
async function leaveMapping() {
 await send('select', { paused: true })
 Object.assign(mappingDraft, { field: '', selectors: [], strip: '', paused: false })
 mapping.hidden = true
 get('map').focus()
 queueDraft()
}
function renderMapping() {
 mapping.hidden = false
 const repair = validations.find(item => item.field === mappingDraft.field && item.repair)
 const scope = element('select')
 scope.append(option('once', 'Use Once'), option('exact', 'Save for Exact URL'), option('matching', 'Save for Matching Story Pages'), option('site', 'Save Site-Wide Defaults'))
 const field = element('select')
 field.append(option('', 'Choose a Field'), ...Object.entries(storyFields).map(([value, text]) => option(value, text)))
 field.value = mappingDraft.field
 scope.value = repair?.scope ?? 'once'
 const strip = element('input', undefined, { value: mappingDraft.strip, maxLength: 80 })
 const prefix = element('input', undefined, { value: repair?.prefix ?? new URL(request.url).pathname.replace(/[^/]*$/, '') })
 const path = label('Story Path Prefix', prefix), approve = element('input', undefined, { type: 'checkbox' })
 const confirm = label('Apply This Rule to Other Pages on This Site', approve)
 confirm.className = 'check'; path.hidden = scope.value !== 'matching'; confirm.hidden = ['once', 'exact'].includes(scope.value)
 const live = element('output'); live.setAttribute('aria-live', 'polite')
 const save = button(scope.selectedOptions[0].text, async () => {
  if (!mappingDraft.field || !mappingDraft.text || !mappingDraft.selectors.length) return
  const field = mappingDraft.field, text = mappingDraft.text
  if (scope.value !== 'once') {
   if (!isConnected) throw new Error('Connect a library account to save a reusable rule.')
   if (!approve.checked && scope.value !== 'exact') throw new Error('Confirm the broader URL scope before saving.')
   const old = validations.find(item => item.field === field && item.repair && item.scope === scope.value)
   const rule = {
    id: old?.id ?? crypto.randomUUID(), version: (old?.version ?? 0) + 1, scope: scope.value, example: request.url,
    ...(scope.value === 'matching' && { prefix: prefix.value.trim() }), field, selectors: mappingDraft.selectors, strip: strip.value,
    previous: text, validation: { when: new Date().toISOString(), example: request.url, current: text, health: scope.value === 'exact' ? 'Working' : 'Needs Review' },
   }
   await send('rule', { rule, expected: old?.version ?? 0, confirm: approve.checked })
   await leaveMapping()
   notice('Mapping saved. Your story draft is available separately.')
   return
  }
  used[field] = { text, via }
  if (request.operation === 'save' && !changed.has(field) && !original) {
   inputs[field].value = text
   if (field === 'published_chapters') inputs.manual.checked = false
  }
  await leaveMapping()
  renderEvidence()
  notice(original || changed.has(field) ? 'Mapped value previewed. Use it explicitly if you want to replace your story field.' : 'Mapped value added to the draft.')
 })
 const preview = handle(async () => {
  const selectedField = mappingDraft.field, selectedStrip = mappingDraft.strip
  mappingDraft.text = ''
  save.disabled = true
  if (!selectedField || !mappingDraft.selectors.length) return
  const reply = await send('preview', { field: selectedField, strip: selectedStrip })
  if (mappingDraft.field !== selectedField || mappingDraft.strip !== selectedStrip) return
  mappingDraft.text = reply.text
  live.textContent = reply.text ? `Extracted Value\n${reply.text}` : 'No valid value was found for this field.'
  save.disabled = !reply.text
 })
 field.onchange = () => { mappingDraft.field = field.value; queueDraft(); preview() }
 strip.oninput = () => { mappingDraft.strip = strip.value; queueDraft(); preview() }
 scope.onchange = () => { path.hidden = scope.value !== 'matching'; confirm.hidden = ['once', 'exact'].includes(scope.value); approve.checked = false; save.textContent = scope.selectedOptions[0].text }
 mapping.replaceChildren(element('h2', 'Map Page Elements', { id: 'mapping-heading' }),
  element('p', 'Choose a field before or after selecting a page element. Use Tab and Enter to select a focusable element, or click it.'),
  label('Map Field', field), label('Remove Text Prefix', strip), live, label('Mapping Scope', scope), path, confirm,
  element('div', undefined, { className: 'actions' }))
 mapping.lastChild.append(button(mappingDraft.paused ? 'Resume Selection' : 'Pause Selection', async () => {
  mappingDraft.paused = !mappingDraft.paused
  mappingDraft.selectors = []
  await send('select', { paused: mappingDraft.paused })
  renderMapping()
  queueDraft()
 }), save, button('Cancel', leaveMapping))
 preview()
}
function renderEvidence() {
 for (const field of Object.keys(storyFields)) {
  const evidence = used[field] ?? observed[field]
  const output = get(`evidence-${field}`)
  output.replaceChildren()
  if (!evidence) continue
  output.append(document.createTextNode(`${evidence.via}\n${evidence.text}`))
  if (inputs[field].value !== evidence.text) output.append(button('Use Observed Value', () => {
   inputs[field].value = evidence.text
   changed.add(field)
   if (field === 'published_chapters') inputs.manual.checked = false
   queueDraft(); renderEvidence()
  }))
 }
}
async function close() {
 try { if (request && !form.hidden && !form.inert) await persist() }
 finally { await send('close') }
}
get('close').onclick = handle(close)
get('map').onclick = handle(() => startSelection())
get('settings').onclick = handle(() => send('settings'))
get('connect').onclick = handle(async () => { await persist(); await send('connect') })
get('return').onclick = handle(async () => {
 if (inProgress) return
 inProgress = true
 try {
  await persist()
  if (request.account === 'disconnected') { await send('manual'); return }
  notice('Returning to the library…')
  const observations = request.operation === 'teach' ? used : { ...observed, ...used }
  await send('return', { draft: draft(), observations })
  notice(request.operation === 'save' ? 'Draft opened in the app.' : 'Returned to your draft in the app.')
  form.inert = true
  await send('close')
 } finally { inProgress = false }
})
form.onsubmit = async event => {
 event.preventDefault()
 if (inProgress) return
 if (!mapping.hidden) { notice('Finish or cancel your selection before saving this story.'); return }
 inProgress = true
 try {
  await persist()
  const result = await send('save', { data: normalizedStory(useFields()) })
  notice('Story saved to your library.')
  form.inert = true
  get('heading').textContent = 'Story Saved'
  clearTimeout(timer)
  if (result.id) document.title = 'Story Saved'
 } catch (error) { notice(error.message) }
 finally { inProgress = false }
}
form.addEventListener('input', event => {
 const field = event.target.name
 if (Object.hasOwn(storyFields, field)) {
  changed.add(field)
  if (field === 'published_chapters') inputs.manual.checked = true
 }
 if (field === 'status') statusChanged = true
 queueDraft()
})
window.addEventListener('keydown', event => {
 if (event.key !== 'Escape') return
 event.preventDefault()
 handle(mapping.hidden ? close : leaveMapping)()
})
chrome.runtime.onMessage.addListener((message, sender) => {
 if (sender.id !== chrome.runtime.id || message?.type !== 'BTA_SITE_SELECTION' || message.nonce !== nonce) return
 if (!message.selection) { handle(leaveMapping)(); return }
 if (!message.selection.found) { notice('Choose a smaller or more specific text element.'); return }
 mappingDraft.selectors = message.selection.selectors
 renderMapping()
 mapping.querySelector('select').focus()
 queueDraft()
})
void send('initialize').then(async reply => {
 request = reply.request
 original = reply.story
 observed = readObservations(reply.observations)
 validations = reply.validations ?? []
 isConnected = request.account !== 'disconnected' && request.account !== 'local-sample-reader'
 const initialDraft = original?.id === reply.draft?.storyId || !original && !reply.draft?.storyId ? reply.draft : null
 const previous = initialDraft?.story
 const offline = original ? reply.offlineDraft?.story ?? (reply.draft?.storyId === null ? reply.draft.story : null) : null
 if (offline) {
  get('recover').hidden = false
  get('recover').onclick = handle(() => {
   for (const field of offline.changedFields) {
    inputs[field].value = offline.fields[field] ?? ''
    changed.add(field)
   }
   if (offline.changedFields.includes('published_chapters')) inputs.manual.checked = offline.manual
   if (offline.notes) inputs.notes.value = offline.notes
   if (offline.tags.length) inputs.tags.value = [...new Set([...parseLines(inputs.tags.value), ...offline.tags])].join('\n')
   if (offline.rating) inputs.rating.value = offline.rating
   if (offline.statusChanged) { inputs.status.value = offline.status; statusChanged = true }
   get('recover').hidden = true
   recovered = true
   notice('Draft values were restored for review.')
   queueDraft(); renderEvidence()
  })
 }
 Object.assign(used, readObservations(previous?.evidence))
 get('heading').textContent = original ? 'Edit Saved Story' : 'Save This Page as a Story'
 get('url').value = request.url; get('source').hidden = false
 for (const [field, text] of Object.entries(storyFields)) {
  const control = field === 'publication_status' ? element('select', undefined, { name: field })
   : element((listStoryFields.has(field) || field === 'summary') ? 'textarea' : 'input', undefined, { name: field, maxLength: field === 'summary' ? 4000 : 500 })
  if (field === 'publication_status') control.append(...Object.entries({ unknown: 'Unknown', in_progress: 'In Progress', complete: 'Complete', hiatus: 'Hiatus', abandoned: 'Abandoned', deleted: 'Deleted' }).map(([value, text]) => option(value, text)))
  const saved = original?.metadata[field]
  control.value = previous?.fields?.[field] ?? (Array.isArray(saved) ? saved.join('\n') : saved ?? (original ? '' : observed[field]?.text ?? (field === 'publication_status' ? 'unknown' : '')))
  if (field === 'title') control.required = true
  if (field === 'published_chapters' && !original) control.required = true
  const configured = validations.find(item => item.field === field && item.health !== 'Working')
  fields.append(label(text, control), button(`Teach Where to Find ${text}`, () => startSelection(field)), element('small', undefined, { id: `evidence-${field}` }))
  if (configured) fields.append(element('small', `${configured.health}\nPrevious: ${configured.previous || 'Unavailable'}\nCurrent: ${configured.current || 'Unavailable'}`),
   button('Review Repair', () => { configured.repair = true; return startSelection(field) }))
 }
 for (const name of previous?.changedFields ?? []) changed.add(name)
 statusChanged = previous?.statusChanged ?? false
 inputs.status.append(...Object.entries(statuses).map(([value, text]) => option(value, text)))
 inputs.status.value = previous?.status ?? original?.reading_status ?? 'to_read'
 inputs.rating.value = previous?.rating ?? original?.personal_rating ?? ''
 inputs.notes.value = previous?.notes ?? original?.notes ?? ''
 inputs.tags.value = (previous?.tags ?? original?.personalTags ?? []).join('\n')
 inputs.manual.checked = previous?.manual ?? original?.metadata.chapter_count_manual ?? false
 if (reply.collections?.length) get('collections').append(element('h2', 'Collections'), ...reply.collections.map(({ name, id }) => {
  const check = label(name, element('input', undefined, { type: 'checkbox', value: id, checked: (previous?.collections ?? original?.collectionIds ?? []).includes(id) }))
  check.className = 'check'; return check
 }))
 renderEvidence()
 get('save').hidden = request.operation !== 'save' || !isConnected || Boolean(reply.unavailable)
 get('return').textContent = request.operation === 'save' ? 'Continue in App' : 'Return to Draft'
 if (request.account === 'disconnected') get('return').textContent = 'Open Manual Entry'
 get('connect').hidden = request.account !== 'disconnected'
 form.hidden = false
 notice(reply.unavailable ? 'Could not load your saved story. Reopen the panel or continue in the app.' : request.account === 'disconnected' ? 'Connect your library to save or transfer your draft.' :
  reply.mappingUnavailable ? 'Saved mappings could not be loaded. You can still review the page and use a selection once.' : original ? 'Saved values are shown in the editor. Source observations are shown below each field.' : 'Review the extracted values before saving.')
 if (request.operation === 'teach' || initialDraft?.mapping?.field || initialDraft?.mapping?.selectors.length) await startSelection(request.field, initialDraft?.mapping)
 else fields.querySelector('input')?.focus()
}).catch(error => notice(error.message))
