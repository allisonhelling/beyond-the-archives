import { normalizeSearchText as normalizeTag } from '../../../lib/search-text.ts'
export const ao3TagCategories = ['relationship', 'character', 'freeform'] as const
export type Ao3TagCategory = typeof ao3TagCategories[number]
export type TagResolution = { category: Ao3TagCategory; name: string; status: 'canonical' | 'synonym' | 'custom' | 'unverified'; canonical_name: string | null; checked_at: string; attempted_at: string }
export type TagAliases = Partial<Record<Ao3TagCategory, Record<string, Record<string, true>>>>
export function validAo3TagName(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) && value.length <= 10000 && !/\p{Cc}/u.test(value) }
export const hasTagFilters = (filters?: { relationship?: string; characters?: string; tags?: string }) => Boolean(filters?.relationship || filters?.characters || filters?.tags)
export const hasTagRules = (rules: unknown) => hasTagFilters((rules as { filters?: Parameters<typeof hasTagFilters>[0] } | null)?.filters)
export const tagResolutionEvent = 'ao3-tag-resolutions-updated'
export { normalizeTag }
function verifiedTags(records: TagResolution[]) {
 const roots = new Map(records.map(record => [`${record.category}:${record.name}`, record.status]))
 return records.filter((record): record is TagResolution & { canonical_name: string } => Boolean(record.canonical_name && ['canonical','synonym'].includes(record.status)
  && (!roots.has(`${record.category}:${record.canonical_name}`) || roots.get(`${record.category}:${record.canonical_name}`) === 'canonical')))
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
export function tagMatches(values: string[], term: string, category: Ao3TagCategory, aliases?: TagAliases) {
 const categoryAliases = aliases?.[category]
 const names = categoryAliases && Object.hasOwn(categoryAliases, term) ? categoryAliases[term] : undefined
 return values.some(value => names ? Object.hasOwn(names, normalizeTag(value)) : normalizeTag(value).includes(term))
}
/** Standard names are also discoverable by their verified aliases. Raw tags stay intact. */
export function tagSuggestionGroups(values: string[], term: string, records: TagResolution[], category: Ao3TagCategory) {
 const names = new Set(values), standard = new Set<string>(), normalized = normalizeTag(term)
 const matching = values.filter(name => normalizeTag(name).includes(normalized))
 for (const record of verifiedTags(records)) {
  if (record.category !== category) continue
  if (names.has(record.name) && (normalizeTag(record.name).includes(normalized) || normalizeTag(record.canonical_name).includes(normalized))) standard.add(record.canonical_name)
 }
 return [{ label: 'Standard Tags', values: [...standard] }, { label: 'Other / Unverified Tags', values: matching.filter(name => !standard.has(name)) }].filter(group => group.values.length)
}

/** Alphabetize letters/numbers first and punctuation-led names last. */
export function compareTagSuggestions(a: string, b: string) {
 const special = (value: string) => !/^[\p{L}\p{N}]/u.test(value.trim())
 return Number(special(a)) - Number(special(b)) || a.localeCompare(b)
}
