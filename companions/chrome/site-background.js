import { exactMappingUrl, listStoryFields, makeSiteRequest, mappingMatches, normalizedField, observationPatch, readMapping, readObservations, readScannedLinks, readSiteDraft, readSiteRequest, sourcePage, storyFields, validRequestId } from '../../src/features/imports/site-mapping.ts'
import { blankMetadata, statuses, validateProgress } from '../../src/features/library/model'
import { checkedStorySave, editSnapshot, storyEdits } from '../../src/features/library/edit-merge'
import { chapterReview } from '../../src/features/library/chapter-edit'

const rpc = '/rest/v1/rpc/'
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
export function createSiteController({ storage, getAuth, api, ready, appOrigin, generation }) {
 const pendingKey = tabId => `site-tab:${tabId}`
 const appKey = id => `site-request:${id}`
 const drafts = account => `site-drafts:${account}`
 const panelUrl = () => chrome.runtime.getURL('site-panel.html')
 const fail = (error, code = 'EXTRACTION_FAILED') => ({ ok: false, error, code })
 const lanes = new Map()
 function exclusive(key, action) {
  const previous = lanes.get(key) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(action)
  lanes.set(key, next)
  return next.finally(() => { if (lanes.get(key) === next) lanes.delete(key) })
 }
 function topOrganizer(sender) {
  return Number.isInteger(sender.tab?.id) && sender.frameId === 0 && sender.documentId && sender.origin === appOrigin()
 }
 async function get(area, key) { return (await area.get(key))[key] }
 async function state(tabId) { return get(storage.session, pendingKey(tabId)) }
 async function put(tabId, value) { await storage.session.set({ [pendingKey(tabId)]: value }) }
 async function connected() {
  const auth = await getAuth()
  return auth?.expiresAt * 1000 > Date.now() ? auth : null
 }
 async function readDraft(session) {
  if (!session.request.account || session.request.account === 'disconnected') return session.draft
  return (await get(storage.local, drafts(session.request.account)))?.find(item => item.url === session.request.url && item.when > Date.now() - 7 * 86400000) ?? session.draft
 }
 async function saveDraft(session, data, remove = false) {
  const key = drafts(session.request.account)
  if (session.request.account === 'disconnected') return
  await exclusive(key, async () => {
   const list = (await get(storage.local, key) ?? []).filter(item => item.url !== session.request.url && item.when > Date.now() - 7 * 86400000)
   if (!remove) list.unshift({ ...data, base: session.base, url: session.request.url, when: Date.now() })
   await storage.local.set({ [key]: list.slice(0, 20) })
  })
 }
 async function rules(auth) {
  if (!auth || auth.sample) return []
  const rows = await api(auth, '/rest/v1/site_mappings?select=rule&order=id&limit=1000')
  return rows.map(row => readMapping(row.rule)).filter(Boolean)
 }
 async function writeRule(auth, rule, id, expected) {
  if (!auth || auth.sample) throw new Error('Connect your library account to save reusable mappings.')
  const ok = await api(auth, `${rpc}write_site_mapping`, { p_rule: rule, p_id: id, p_version: expected })
  if (!ok) throw new Error('This mapping changed on another device. Reload and review it before saving.')
 }
 async function story(auth, url) {
  if (!auth || auth.sample) return { story: null, collections: [] }
  const [entries, collections] = await Promise.all([
   api(auth, `/rest/v1/library_entries?select=id&source_url=eq.${encodeURIComponent('"' + url.replace(/[\\"]/g, '\\$&') + '"')}&limit=1`),
   api(auth, '/rest/v1/collections?select=id,name&automatic_rules=is.null&order=name'),
  ])
  const id = entries[0]?.id
  const details = id ? (await api(auth, `${rpc}library_story_details`, { p_ids: [id] }))[0] : null
  if (id && !details) throw new Error('Could not load the saved story. Retry before making changes.')
  return { story: details, collections }
 }
 async function saveStory(auth, session, data) {
  if (!auth || auth.sample) throw new Error('Connect your library account or continue in the app to save.')
  data = readSiteDraft({ story: data })?.story
  if (!data) throw new Error('The editor draft is invalid.')
  const saved = session.story, metadata = { ...blankMetadata, ...saved?.metadata }
  const fields = Object.fromEntries(Object.entries(data.fields).map(([field, value]) => [field, { text: normalizedField(field, value) }]).filter(([, value]) => value.text))
  const patch = observationPatch(fields)
  const changed = data.changedFields
  const metadataChanges = {}
  for (const key of Object.keys(storyFields)) {
   if (saved && !changed.includes(key)) continue
   if (Object.hasOwn(patch, key)) metadataChanges[key] = patch[key]
   else if (changed.includes(key)) metadataChanges[key] = listStoryFields.has(key) ? [] : ['published_chapters', 'total_chapters'].includes(key) ? null : key === 'publication_status' ? 'unknown' : ''
  }
  if (!saved || changed.includes('published_chapters') || data.manual !== saved.metadata.chapter_count_manual) metadataChanges.chapter_count_manual = data.manual === true
  Object.assign(metadata, metadataChanges)
  if (!metadata.title.trim()) throw new Error('Enter a title.')
  if (!saved && (!Number.isInteger(metadata.published_chapters) || metadata.published_chapters < 1 || metadata.published_chapters > 100000)) throw new Error('Enter 1–100,000 published chapters.')
  if (saved && chapterReview(saved, metadata)) throw new Error('This chapter change needs a progress review. Continue in the app to apply it.')
  const status = saved && !data.statusChanged ? saved.reading_status : data.status
  if (typeof status !== 'string' || !Object.hasOwn(statuses, status)) throw new Error('Choose a reading status.')
  const progress = saved?.last_read_chapter ?? (status === 'finished' ? metadata.published_chapters : 0)
  validateProgress(progress, metadata)
  const personalRating = data.rating === '' ? null : Number(data.rating)
  if (personalRating !== null && (!Number.isInteger(personalRating) || personalRating < 1 || personalRating > 5)) throw new Error('Choose a valid personal rating.')
  if (typeof data.notes !== 'string' || data.notes.length > 10000 || !Array.isArray(data.tags) || !Array.isArray(data.collections)) throw new Error('The personal fields are invalid.')
  const tags = data.tags.filter(tag => typeof tag === 'string' && tag.trim().length <= 200).slice(0, 100)
  const allowed = new Set(session.collections.map(collection => collection.id))
  const collections = [...new Set([...data.collections.filter(id => allowed.has(id)), ...(saved?.collectionIds ?? []).filter(id => !allowed.has(id))])]
  const input = {
   id: saved?.id, url: session.request.url, metadata, ...(saved && { metadataChanges }),
   status, progress, notes: data.notes, personalRating, favorite: saved?.is_favorite ?? false, rec: saved?.is_rec ?? false,
   collections, tags, statusOrigin: data.statusChanged ? 'explicit' : 'preserve',
  }
  const id = await api(auth, `${rpc}save_companion_story`, {
   ...checkedStorySave(input, storyEdits(input), session.base ?? null),
   p_observations: { ...session.observations, ...data.evidence },
  })
  if (!uuid.test(id)) throw new Error('The save could not be confirmed. Reopen the panel to check your library.')
  return id
 }
 async function external(message, sender) {
  if (!topOrganizer(sender)) return fail('Open the library in its own tab.', 'STALE')
  const request = readSiteRequest(message.request)
  if (!request) return fail('This request expired. Start again from your draft.', 'STALE')
  if (request.origin === appOrigin()) return fail('Open a public source page from your draft.', 'STALE')
  const auth = await connected()
  if (!auth || auth.userId !== request.account) return fail('Reconnect the same library account to resume.', 'DISCONNECTED')
  if (message.action === 'begin') return exclusive(appKey(request.requestId), async () => {
   if (await get(storage.session, appKey(request.requestId))) return fail('This request is already open.', 'STALE')
   const connection = generation()
   const tab = await chrome.tabs.create({ url: request.url, active: true, openerTabId: sender.tab.id })
   if (connection !== generation()) return fail('The connection changed. Start again.', 'STALE')
   await put(tab.id, { request, appTabId: sender.tab.id, appDocumentId: sender.documentId, connection })
   await storage.session.set({ [appKey(request.requestId)]: { tabId: tab.id, appTabId: sender.tab.id, appDocumentId: sender.documentId } })
   return { ok: true, result: { ...request, tabId: tab.id, code: 'PERMISSION_REQUIRED' } }
  })
  if (message.action === 'read') return exclusive(appKey(request.requestId), async () => {
   const link = await get(storage.session, appKey(request.requestId))
   if (!link || link.consumed || link.appTabId !== sender.tab.id || link.appDocumentId !== sender.documentId) return fail('This request belongs to another tab.', 'STALE')
   const session = await state(link.tabId)
   if (link.result && sameRequest(link.result, request)) {
    await storage.session.set({ [appKey(request.requestId)]: { ...link, result: null, consumed: true } })
    return { ok: true, result: link.result }
   }
   if (!session || !sameRequest(session.request, request)) return fail('This request is no longer available.', 'STALE')
   if (!session.result) return { ok: true, result: { ...request, tabId: link.tabId, code: 'PERMISSION_REQUIRED' } }
   await storage.session.set({ [appKey(request.requestId)]: { ...link, consumed: true } })
   return { ok: true, result: session.result }
  })
  return fail('Update the companion and retry.', 'STALE')
 }
 function sameRequest(a, b) {
  return ['requestId', 'account', 'url', 'origin', 'operation', 'capability', 'version', 'createdAt', 'expiresAt', 'draftId', 'field'].every(key => a[key] === b[key])
 }
 async function open(tab) {
  await ready
  const url = sourcePage(tab.url)
  if (!url || new URL(url).origin === appOrigin()) return false
  if (!Number.isInteger(tab.id) || !tab.active) return false
  return exclusive(pendingKey(tab.id), async () => {
   let previous = await state(tab.id)
   const auth = await connected(), connection = generation()
   if (previous?.request.url !== url || !readSiteRequest(previous.request) || previous.result) previous = null
   if (previous && previous.request.account !== 'disconnected' && previous.request.account !== auth?.userId) {
    // Never hand a queued request or an existing draft across accounts.
    if (previous.appTabId !== undefined) throw new Error('Reconnect the original account to resume this request.')
    previous = null
   }
   if (previous?.request.account === 'disconnected' && auth) {
    previous = { ...previous, offlineDraft: previous.draft, request: { ...previous.request, account: auth.userId } }
   }
   const request = previous?.request ?? makeSiteRequest(auth?.userId ?? 'disconnected', url, 'save')
   if (request.operation === 'discover') {
    const [target] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['site-content.js'], world: 'ISOLATED' })
    if (!target?.documentId) return false
    const reply = await chrome.tabs.sendMessage(tab.id, { type: 'BTA_SITE_DISCOVER', url }, { documentId: target.documentId })
    if (connection !== generation()) return false
    const links = reply?.ok ? readScannedLinks(reply.links) : null
    await put(tab.id, { ...previous, result: { ...request, tabId: tab.id, code: links ? 'OK' : 'EXTRACTION_FAILED', ...(links && { links }) } })
    return true
   }
   const [mapped, data] = await Promise.all([
    rules(auth).catch(() => null),
    story(auth, url).catch(() => ({ story: null, collections: [], unavailable: true })),
   ])
   if (connection !== generation()) throw new Error('The account changed. Reopen the panel.')
   const [target] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['site-content.js'], world: 'ISOLATED' })
   if (!target?.documentId) throw new Error('The browser could not open the editor on this page.')
   const session = { ...previous, ...data, rules: mapped?.filter(rule => mappingMatches(rule, url)) ?? [], mappingUnavailable: mapped === null, request, connection, documentId: target.documentId, panelDocumentId: undefined, nonce: crypto.randomUUID() }
   await put(tab.id, session)
   try {
    const reply = await chrome.tabs.sendMessage(tab.id, {
     type: 'BTA_SITE_OPEN', url, nonce: session.nonce, rules: session.rules, panelUrl: panelUrl(), manualUrl: `${appOrigin()}/add?import=manual`,
    }, { documentId: target.documentId })
    if (!reply?.ok) throw new Error('The page changed. Reopen the panel.')
    return true
   } catch (error) {
    if (previous) await put(tab.id, previous)
    else await storage.session.remove(pendingKey(tab.id))
    throw error
   }
  })
 }
 async function internal(message, sender) {
  await ready
  const id = sender.tab?.id
  if (sender.id !== chrome.runtime.id || !Number.isInteger(id)) return fail('The source tab changed.', 'STALE')
  return exclusive(pendingKey(id), async () => {
   const session = await state(id), auth = await connected()
   if (!session || session.nonce !== message.nonce || !readSiteRequest(session.request)
    || session.connection !== generation() || session.request.account !== (auth?.userId ?? 'disconnected')) return fail('The connection changed. Reopen the panel.', 'DISCONNECTED')
   const request = session.request
   if (sourcePage((await chrome.tabs.get(id)).url) !== request.url) return fail('The page changed. Reopen the panel.', 'STALE')
   const fromMain = sender.frameId === 0 && sender.documentId === session.documentId && sourcePage(sender.url) === request.url
   const fromPanel = sender.frameId > 0 && sender.url?.split('#')[0] === panelUrl() && sender.documentId
   if (!fromMain && !fromPanel) return fail('The source tab changed.', 'STALE')
   if (fromMain && ['selection', 'cancel-selection'].includes(message.action)) {
    if (session.panelDocumentId) void chrome.runtime.sendMessage({ type: 'BTA_SITE_SELECTION', nonce: session.nonce, selection: message.selection ?? null }).catch(() => {})
    return { ok: true }
   }
   if (!fromPanel || session.panelDocumentId && session.panelDocumentId !== sender.documentId) return fail('Reopen the editor.', 'STALE')
   const send = data => chrome.tabs.sendMessage(id, { ...data, type: 'BTA_SITE_COMMAND', nonce: session.nonce }, { documentId: session.documentId })
   const closePanel = async () => {
    const result = await send({ action: 'close' })
    if (result?.ok) {
     session.panelDocumentId = null
     session.nonce = null
     await put(id, session)
    }
    return result
   }
   if (message.action === 'initialize') {
    session.panelDocumentId = sender.documentId
    await put(id, session)
    const capture = await send({ action: 'capture' })
    if (!capture?.ok) return fail('The source page changed or the browser blocked extraction. Reopen the editor or continue with manual entry.', 'STALE')
    session.observations = readObservations(capture.observations)
    const validations = await Promise.all((capture.validations ?? []).map(async check => {
     const rule = session.rules.find(rule => rule.id === check.id && rule.version === check.version)
     if (!rule || check.example !== request.url) return null
     const validated = readMapping({ ...rule, version: rule.version + 1, validation: check })
     if (!validated) return null
     if (Object.entries(validated.validation).every(([key, value]) => key === 'when' || value === rule.validation[key])) return check
     try {
      await writeRule(auth, validated, rule.id, rule.version)
      session.rules[session.rules.indexOf(rule)] = validated
      return { ...check, version: validated.version }
     } catch { return check }
    }))
    const draft = await readDraft(session)
    session.base = session.story ? (draft?.storyId === session.story.id ? draft.base : undefined) ?? editSnapshot(session.story) : null
    await put(id, session)
    return { ok: true, request, story: session.story, collections: session.collections, unavailable: session.unavailable,
     mappingUnavailable: session.mappingUnavailable, observations: session.observations,
     validations: validations.filter(Boolean).map(check => ({ ...check, ruleExample: session.rules.find(rule => rule.id === check.id)?.example })),
     draft: readSiteDraft(draft), offlineDraft: readSiteDraft(session.offlineDraft) }
   }
   if (message.action === 'select' || message.action === 'preview' || message.action === 'highlight') return send({ action: message.action, field: message.field, paused: message.paused, strip: message.strip, selectors: message.selectors })
   if (message.action === 'draft') {
    const draft = readSiteDraft(message.draft)
    if (!draft || draft.storyId !== (session.story?.id ?? null)) return fail('The editor draft is invalid.')
    session.draft = { ...draft, base: session.base }
    if (message.recovered === true) delete session.offlineDraft
    await put(id, session)
    await saveDraft(session, draft)
    return { ok: true }
   }
   if (message.action === 'rule') {
    const rule = readMapping(message.rule)
    if (!rule || rule.example !== request.url || !mappingMatches(rule, request.url) || rule.scope !== 'exact' && message.confirm !== true) return fail('Confirm the rule’s URL scope before saving.')
    const expected = message.expected ?? 0
    if (rule.version !== expected + 1) return fail('Reload this mapping before saving.')
    if (rule.scope !== 'exact' && rule.validation.health === 'Working') {
     const prior = session.rules.find(item => item.id === rule.id && item.version === expected)
     if (!prior || prior.scope !== rule.scope || prior.prefix !== rule.prefix || prior.field !== rule.field
      || exactMappingUrl(prior.example) === exactMappingUrl(request.url)) return fail('Review the rule on a different matching story before confirming it.')
    }
    await writeRule(auth, rule, rule.id, expected)
    return { ok: true }
   }
   if (message.action === 'save') {
    if (session.unavailable) return fail('The saved story could not be loaded. Reopen the panel or continue in the app.')
    if (session.savedId) return { ok: true, id: session.savedId }
    const saved = await saveStory(auth, session, message.data)
    session.savedId = saved
    await put(id, session)
    await saveDraft(session, null, true)
    return { ok: true, id: saved }
   }
   if (message.action === 'return') {
    if (session.result) return fail('This request already has a result.', 'STALE')
    const observations = readObservations(message.observations)
    session.result = { ...request, tabId: id, code: 'OK', observations }
    let destination = session.appTabId
    if (destination !== undefined) {
     await storage.session.set({ [appKey(request.requestId)]: { tabId: id, appTabId: destination, appDocumentId: session.appDocumentId, result: session.result } })
    } else {
     const handoff = crypto.randomUUID()
     const tab = await chrome.tabs.create({ url: `${appOrigin()}/add?import=manual&companion=${handoff}`, active: false })
     destination = tab.id
     await storage.session.set({ [appKey(handoff)]: {
      appTabId: destination, url: request.url, account: auth?.userId, expiresAt: request.expiresAt,
      draft: readSiteDraft(message.draft), observations, base: session.base,
     } })
    }
    await put(id, session)
    // Close from the background before focus moves and the source frame can be suspended.
    await closePanel().catch(() => {})
    await chrome.tabs.update(destination, { active: true })
    return { ok: true }
   }
   if (message.action === 'settings') {
    await chrome.tabs.create({ url: `${appOrigin()}/settings#settings-site-mappings` })
    return { ok: true }
   }
   if (message.action === 'manual' && request.account === 'disconnected') {
    await chrome.tabs.create({ url: `${appOrigin()}/add?import=manual` })
    return { ok: true }
   }
   if (message.action === 'connect' && request.account === 'disconnected') {
    await chrome.tabs.create({ url: `${appOrigin()}/settings#settings-metadata` })
    return { ok: true }
   }
   if (message.action === 'close') return closePanel()
   return fail('Unknown editor action.')
  })
 }
 async function appDraft(message, sender) {
  if (!topOrganizer(sender) || !validRequestId(message.id) || new URL(sender.url).searchParams.get('companion') !== message.id) return fail('This draft belongs to another tab.', 'STALE')
  return exclusive(appKey(message.id), async () => {
   const link = await get(storage.session, appKey(message.id)), auth = await connected()
   if (!auth || !link?.account || link.account !== auth.userId || link.appTabId !== sender.tab.id || link.expiresAt <= Date.now()) return fail('Reconnect the original account to load this draft.', 'DISCONNECTED')
   return { ok: true, url: link.url, draft: link.draft, base: link.base, observations: link.observations }
  })
 }
 return { open, external, internal, appDraft, rules, close: tabId => storage.session.remove(pendingKey(tabId)) }
}
