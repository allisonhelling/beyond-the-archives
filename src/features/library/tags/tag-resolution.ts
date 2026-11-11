import { normalizeSearchText as normalizeTag } from '../../../lib/search-text.ts'
export const ao3TagCategories = ['relationship', 'character', 'freeform'] as const
export type Ao3TagCategory = typeof ao3TagCategories[number]
/** AO3-only resolver/cache payload. A foreign label requires a separately verified mapping. */
export type TagResolution = { category: Ao3TagCategory; name: string; status: 'canonical' | 'synonym' | 'custom' | 'unverified'; canonical_name: string | null; checked_at: string; attempted_at: string }
/** One owner's AO3 evidence, partitioned by AO3 category; never a global label ontology. */
export type TagAliases = Partial<Record<Ao3TagCategory, Record<string, Record<string, true>>>>
export function validAo3TagName(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) && value.length <= 10000 && !/\p{Cc}/u.test(value) }
export const hasTagFilters = (filters?: { relationship?: string; characters?: string; tags?: string; tagExpressions?: Partial<Record<string, unknown>> }) => Boolean(filters?.relationship || filters?.characters || filters?.tags || Object.keys(filters?.tagExpressions ?? {}).some(key => key !== 'fandoms'))
export const hasTagRules = (rules: unknown) => hasTagFilters((rules as { filters?: Parameters<typeof hasTagFilters>[0] } | null)?.filters)
export const tagResolutionEvent = 'ao3-tag-resolutions-updated'
export { normalizeTag }
function verifiedTags(records: TagResolution[]) {
 const roots = new Map(records.map(record => [`${record.category}:${record.name}`, record.status]))
 return records.filter((record): record is TagResolution & { canonical_name: string } => Boolean(record.canonical_name && ['canonical','synonym'].includes(record.status)
  && roots.get(`${record.category}:${record.canonical_name}`) === 'canonical'))
}
export function tagAliasIndex(records: TagResolution[]): TagAliases {
 const index: TagAliases = Object.create(null)
 for (const record of verifiedTags(records)) {
  const category = index[record.category] ??= Object.create(null), key = normalizeTag(record.canonical_name)
  const names = category[key] ??= Object.create(null)
  names[normalizeTag(record.name)] = true; names[key] = true
 }
 return index
}
/** Keep source spelling and relative order within each verification tier. */
export function prioritizeVerifiedTags(values: string[], records: TagResolution[], category: Ao3TagCategory) {
 const names = new Set(verifiedTags(records).filter(record => record.category === category).map(record => normalizeTag(record.name)))
 return [...values].sort((a,b) => Number(names.has(normalizeTag(b))) - Number(names.has(normalizeTag(a))))
}
/** Callers must establish AO3 backing upstream; null permits raw matching only. */
export function tagMatches(values: string[], term: string, category: Ao3TagCategory, aliases: TagAliases | undefined, authority: 'ao3' | null) {
 const categoryAliases = authority === 'ao3' ? aliases?.[category] : undefined
 const names = categoryAliases && Object.hasOwn(categoryAliases, term) ? categoryAliases[term] : undefined
 return values.some(value => names ? Object.hasOwn(names, normalizeTag(value)) : normalizeTag(value).includes(term))
}
/** Suggest each canonical name once, discoverable by aliases; saved tags stay intact. */
export function tagSuggestionGroups(values: string[], term: string, records: TagResolution[], category: Ao3TagCategory) {
 const names = new Set(values.map(normalizeTag)), standard = new Map<string,string>(), verified = new Set<string>(), normalized = normalizeTag(term)
 const matching = new Map<string,string>()
 for (const name of values) {
  const key = normalizeTag(name)
  if (key.includes(normalized) && !matching.has(key)) matching.set(key,name)
 }
 for (const record of verifiedTags(records)) {
  if (record.category !== category) continue
  const name = normalizeTag(record.name), canonical = normalizeTag(record.canonical_name)
  verified.add(name)
  if (names.has(name) && (name.includes(normalized) || canonical.includes(normalized))) {
   if (!standard.has(canonical)) standard.set(canonical,record.canonical_name)
  }
 }
 return [{ label: 'Standard Tags', values: [...standard.values()] }, { label: 'Other / Unverified Tags', values: [...matching].filter(([key]) => !standard.has(key) && !verified.has(key)).map(([,name]) => name) }].filter(group => group.values.length)
}

/** Alphabetize letters/numbers first and punctuation-led names last. */
export function compareTagSuggestions(a: string, b: string) {
 const special = (value: string) => !/^[\p{L}\p{N}]/u.test(value.trim())
 return Number(special(a)) - Number(special(b)) || a.localeCompare(b)
}
