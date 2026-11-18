import { classifyUrl } from './urls.ts'
import { genericSiteExtractionCapability, siteBulkImportCapability, visualMappingCapability } from './companion-contract.ts'
import { sourceLocation } from '../library/story-source'

export const storyFields = {
 title: 'Title', authors: 'Authors', fandoms: 'Fandoms', summary: 'Summary', ao3_tags: 'Tags',
 relationship_tags: 'Relationships', character_tags: 'Characters', additional_tags: 'Additional Tags',
 categories: 'Categories', published_chapters: 'Published Chapters', total_chapters: 'Planned Chapters',
 publication_status: 'Publication Status',
} as const
export type StoryField = keyof typeof storyFields
export type Evidence = { text: string; via: string; rawText?: string }
export type Observations = Partial<Record<StoryField, Evidence>>
export type MappingScope = 'exact' | 'matching' | 'site'
export type MappingRule = {
 id: string; version: number; scope: MappingScope; example: string; prefix?: string; field: StoryField;
 selectors: string[]; strip?: string; previous: string; validation: { when: string; example: string; health: 'Working' | 'Needs Review' | 'Broken'; current: string };
}
export const isStoryField = (value: unknown): value is StoryField => typeof value === 'string' && Object.hasOwn(storyFields, value)
export const sourceTagFields = { fandom: 'fandoms', relationship: 'relationship_tags', character: 'character_tags', freeform: 'additional_tags' } as const
export const tagObservationFields = new Set<StoryField>([...Object.values(sourceTagFields), 'ao3_tags'])
export const listStoryFields = new Set<StoryField>(['authors', ...tagObservationFields, 'categories'])
export const fieldLimit = (field: StoryField) => field === 'summary' ? 4000 : 500
export function sourcePage(url: unknown) {
 if (typeof url !== 'string') return null
 try {
  const location = sourceLocation(url), candidate = new URL(location.normalizedUrl)
  if (location.identity.kind !== 'url' || [...candidate.searchParams.keys(), ...new URLSearchParams(candidate.hash.slice(1)).keys()].some(key =>
   /(?:^|[_-])(?:token|password|passwd|secret|session|signature|credential|key|auth|code)(?:$|[_-])/i.test(key))) return null
  return location.normalizedUrl
 }
 catch { return null }
}
export function normalizedField(field: StoryField, input: string) {
 const value = input.trim().slice(0, fieldLimit(field))
 if (field === 'published_chapters' || field === 'total_chapters') {
  const match = /^(?:chapters?\s*:\s*)?(\d{1,6})(?:\s*\/\s*(\d{1,6}|\?))?(?:\s+chapters?)?$/i.exec(value)
  const count = Number(field === 'total_chapters' && match?.[2] !== undefined ? match[2] : match?.[1])
  return Number.isInteger(count) && count >= 1 && count <= 100000 ? String(count) : ''
 }
 if (field === 'publication_status') {
  const status = value.toLowerCase().replace(/^status\s*:\s*/, '').replace(/\s+/g, '_')
  return ({ ongoing: 'in_progress', completed: 'complete', finished: 'complete', on_hold: 'hiatus', discontinued: 'abandoned' } as Record<string, string>)[status]
   ?? (['unknown', 'in_progress', 'complete', 'hiatus', 'abandoned', 'deleted'].includes(status) ? status : '')
 }
 return value
}
export function exactMappingUrl(value: string) {
 const url = new URL(value)
 const query = url.search.slice(1).split('&').filter(pair => {
  const [key] = new URLSearchParams(pair).keys()
  return !/^(?:utm_.*|fbclid|gclid)$/i.test(key ?? '')
 })
 if (query.length !== url.search.slice(1).split('&').length) url.search = query.join('&')
 return url.href
}
export function mappingMatches(rule: MappingRule, candidate: string) {
 const url = new URL(candidate), example = new URL(rule.example)
 if (url.origin !== example.origin) return false
 if (rule.scope === 'exact') return exactMappingUrl(candidate) === exactMappingUrl(rule.example)
 return rule.scope === 'site' || url.pathname.startsWith(rule.prefix!)
}
function record(value: unknown): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
// Selectors are used only with querySelectorAll in the isolated content script.
const selectorPart = /^(?:#[a-z_][\w-]{0,63}|[a-z][\w-]*(?:\.[a-z_][\w-]{0,63}|\[(?:itemprop|data-testid|data-role)="[\w-]{1,64}"\]|:nth-of-type\([1-9]\d{0,3}\))?)$/i
export function validSelector(value: unknown): value is string {
 return typeof value === 'string' && value.length <= 320 && value.split(' > ').every(part =>
  selectorPart.test(part) && !/^(?:html|head|body|form|input|textarea|script|iframe|button|select|meta|link|base|object|embed|template|noscript)(?:$|[.#[:])/i.test(part))
}
export function readMapping(value: unknown): MappingRule | null {
 const rule = record(value), validation = record(rule?.validation)
 if (!rule || !validation || !validRequestId(rule.id)
  || !Number.isSafeInteger(rule.version) || Number(rule.version) < 1 || !isStoryField(rule.field)
  || !Array.isArray(rule.selectors) || !rule.selectors.length || rule.selectors.length > 3 || !rule.selectors.every(validSelector)
  || typeof rule.previous !== 'string' || rule.previous.length > fieldLimit(rule.field)
  || (rule.strip !== undefined && (typeof rule.strip !== 'string' || rule.strip.length > 80))
  || !['exact', 'matching', 'site'].includes(String(rule.scope))
  || typeof validation.when !== 'string' || !Number.isFinite(Date.parse(validation.when))
  || typeof validation.current !== 'string' || validation.current.length > fieldLimit(rule.field)
  || !['Working', 'Needs Review', 'Broken'].includes(String(validation.health))) return null
 const example = sourcePage(rule.example), checked = sourcePage(validation.example)
 if (!example || !checked || new URL(example).origin !== new URL(checked).origin) return null
 if (rule.scope === 'matching' && (typeof rule.prefix !== 'string' || !/^\/(?:[\w.~-]+\/)+$/.test(rule.prefix)
  || /(?:^|\/)\.{1,2}\//.test(rule.prefix) || !new URL(example).pathname.startsWith(rule.prefix) || rule.prefix === new URL(example).pathname)) return null
 const parsed = {
  id: rule.id, version: Number(rule.version), scope: rule.scope as MappingScope, example, field: rule.field,
  ...(rule.scope === 'matching' && { prefix: String(rule.prefix) }), selectors: [...rule.selectors],
  ...(rule.strip && { strip: rule.strip }), previous: rule.previous,
  validation: { when: validation.when, example: checked, health: validation.health, current: validation.current },
 } as MappingRule
 return mappingMatches(parsed, checked) ? parsed : null
}
export function readObservations(value: unknown): Observations {
 const result: Observations = {}, input = record(value)
 if (input) for (const [field, raw] of Object.entries(input)) {
  const evidence = record(raw)
  if (!isStoryField(field) || !evidence || typeof evidence.text !== 'string' || evidence.text.length > fieldLimit(field)
   || typeof evidence.via !== 'string' || !['Site Adapter', 'Structured Data', 'Page Metadata', 'Page Element', 'Saved Mapping', 'Mapped Element'].includes(evidence.via)) continue
  if (/<\/?[a-z][^>]*>/i.test(evidence.text)) continue
  const text = normalizedField(field, evidence.text)
  const rawText = tagObservationFields.has(field) && typeof evidence.rawText === 'string' && evidence.rawText.length <= fieldLimit(field)
   && !/<\/?[a-z][^>]*>/i.test(evidence.rawText) ? evidence.rawText : undefined
  if (text) result[field] = { text, via: evidence.via, ...(rawText && rawText !== text && { rawText }) }
 }
 return result
}
export const maxDiscoveredLinks = 2000
export const restrictedLink = 'about:invalid'
export function safeScannedLink(value: string) {
 if (value.length > 8192) return restrictedLink
 try {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return restrictedLink
 } catch { return restrictedLink }
 const known = classifyUrl(value)
 if (known.kind === 'valid' || known.kind === 'series') return value.split(/[?#]/)[0]
 if (known.kind === 'unsupported') return value.split(/[?#]/)[0]
 return sourcePage(value) ?? restrictedLink
}
export function readScannedLinks(value: unknown) {
 if (!Array.isArray(value) || value.length > maxDiscoveredLinks) return null
 let length = 0
 const links: string[] = []
 for (const link of value) {
  if (typeof link !== 'string' || (length += link.length) > 4_000_000) return null
  links.push(safeScannedLink(link))
 }
 return links
}
const operationCapabilities = {
 extract: genericSiteExtractionCapability, save: genericSiteExtractionCapability, teach: visualMappingCapability, discover: siteBulkImportCapability,
} as const
export type SiteRequest = {
 requestId: string; account: string; url: string; origin: string; operation: keyof typeof operationCapabilities;
 capability: typeof operationCapabilities[keyof typeof operationCapabilities]; version: 1; createdAt: number; expiresAt: number;
 draftId?: string; field?: StoryField;
}
export type SiteResult = SiteRequest & { tabId: number; code: 'OK' | 'PERMISSION_REQUIRED' | 'DISCONNECTED' | 'STALE' | 'EXTRACTION_FAILED'; observations?: Observations; links?: string[] }
export const requestLifetime = 30 * 60 * 1000
export const validRequestId = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
export function readSiteRequest(value: unknown, now = Date.now()): SiteRequest | null {
 const request = record(value), url = sourcePage(request?.url)
 if (!request || !url || request.origin !== new URL(url).origin || !validRequestId(request.requestId)
  || typeof request.account !== 'string' || !request.account || request.account.length > 128
  || request.version !== 1 || typeof request.createdAt !== 'number' || typeof request.expiresAt !== 'number'
  || !Number.isSafeInteger(request.createdAt) || !Number.isSafeInteger(request.expiresAt)
  || request.createdAt > now + 5000 || request.expiresAt <= now || request.expiresAt - request.createdAt > requestLifetime
  || request.expiresAt <= request.createdAt || (request.draftId !== undefined && !validRequestId(request.draftId))) return null
 const operation = request.operation as SiteRequest['operation']
 if (!Object.hasOwn(operationCapabilities, operation) || request.capability !== operationCapabilities[operation]
  || operation === 'teach' && !isStoryField(request.field)) return null
 return {
  requestId: request.requestId, account: request.account, url, origin: request.origin, version: 1,
  operation: request.operation, capability: request.capability, createdAt: request.createdAt, expiresAt: request.expiresAt,
  ...(request.draftId && { draftId: request.draftId }), ...(isStoryField(request.field) && { field: request.field }),
 } as SiteRequest
}
export function makeSiteRequest(account: string, url: string, operation: SiteRequest['operation'], draftId?: string, field?: StoryField): SiteRequest {
 const createdAt = Date.now()
 const request = readSiteRequest({
  account, url, origin: new URL(url).origin, operation, requestId: crypto.randomUUID(), draftId, field,
  version: 1, createdAt, expiresAt: createdAt + requestLifetime,
  capability: operationCapabilities[operation],
 }, createdAt)
 if (!request) throw new Error('Enter a valid story URL to open it in the companion.')
 return request
}
export function exportMappings(rules: MappingRule[]) {
 return JSON.stringify({ version: 1, mappings: rules.map(rule => ({
  ...rule, previous: '', validation: { ...rule.validation, current: '' },
 })) }, null, 2)
}
export function importMappings(json: string): MappingRule[] {
 if (json.length > 250000) throw new Error('Choose a mapping file smaller than 250 KB.')
 const file = record(JSON.parse(json))
 if (!file || file.version !== 1 || !Array.isArray(file.mappings) || file.mappings.length > 100) throw new Error('Choose a version 1 site mapping file.')
 return file.mappings.map(raw => {
  const rule = readMapping(raw)
  if (!rule) throw new Error('A rule has an invalid selector, origin, or URL scope.')
  return { ...rule, id: crypto.randomUUID(), version: 1, previous: '', validation: { ...rule.validation, current: '', health: 'Needs Review' } }
 })
}

export function observationPatch(observations: Observations) {
 const patch = Object.fromEntries(Object.entries(observations).map(([field, value]) => [
  field, listStoryFields.has(field as StoryField) ? value.text.split(/\n/).map(part => part.trim()).filter(Boolean)
   : field === 'published_chapters' || field === 'total_chapters' ? value.text === '' ? null : Number(value.text) : value.text,
 ]))
 return patch
}

export type SiteStoryDraft = {
 fields: Partial<Record<StoryField, string>>; changedFields: StoryField[]; manual: boolean;
 status: string; statusChanged: boolean; notes: string; evidence: Observations; rating: string; tags: string[]; collections: string[];
}
export type SiteDraft = {
 story: SiteStoryDraft; storyId: string | null;
 mapping?: { field: StoryField | ''; selectors: string[]; strip: string; paused: boolean };
}
export function readSiteDraft(value: unknown): SiteDraft | null {
 const draft = record(value), story = record(draft?.story), fields = record(story?.fields)
 if (!draft || !story || !fields) return null
 const lines = (values: unknown): string[] => Array.isArray(values) ? values.filter(cell => typeof cell === 'string' && cell.length <= 200).slice(0, 100) : []
 const mapping = record(draft.mapping)
 return {
  storyId: validRequestId(draft.storyId) ? draft.storyId : null,
  story: {
   fields: Object.fromEntries(Object.entries(fields).filter(([key, cell]) => isStoryField(key) && typeof cell === 'string' && cell.length <= fieldLimit(key))),
   changedFields: Array.isArray(story.changedFields) ? [...new Set(story.changedFields.filter(isStoryField))] : [],
   manual: story.manual === true, statusChanged: story.statusChanged === true,
   status: typeof story.status === 'string' ? story.status.slice(0, 30) : 'to_read',
   notes: typeof story.notes === 'string' ? story.notes.slice(0, 10000) : '',
   rating: typeof story.rating === 'string' && /^[1-5]$/.test(story.rating) ? story.rating : '',
   evidence: readObservations(story.evidence), tags: lines(story.tags), collections: lines(story.collections).filter(validRequestId),
  },
  ...(mapping && { mapping: {
   field: isStoryField(mapping.field) ? mapping.field : '',
   selectors: Array.isArray(mapping.selectors) ? mapping.selectors.filter(validSelector).slice(0, 3) : [],
   strip: typeof mapping.strip === 'string' ? mapping.strip.slice(0, 80) : '',
   paused: mapping.paused === true,
  } }),
 }
}
export function readSiteResult(value: unknown, original: SiteRequest): SiteResult | null {
 const response = record(value), request = readSiteRequest(response)
 if (!response || !request || Object.entries(original).some(([key, expected]) => request[key as keyof SiteRequest] !== expected)
  || !Number.isInteger(response.tabId) || Number(response.tabId) < 0 || !['OK', 'PERMISSION_REQUIRED', 'DISCONNECTED', 'STALE', 'EXTRACTION_FAILED'].includes(String(response.code))) return null
 const links = request.operation === 'discover' && response.code === 'OK' ? readScannedLinks(response.links) : undefined
 if (links === null) return null
 return { ...request, ...(links && { links }), tabId: Number(response.tabId), code: response.code as SiteResult['code'], observations: readObservations(response.observations) }
}
