import { normalizeSearchText as normalize } from '../../src/lib/search-text'
import type { Book, CatalogBook } from './model'
import { publisherName, seriesNames } from './metadata'
import { isCrossover } from '../../src/features/library/model'
import { statuses } from './model'
export const unknownValue = '__reader_unknown__'
export { normalize }
type FilterBook = Pick<CatalogBook, 'metadata' | 'status' | 'collections' | 'active' | 'importedAt' | 'workId'>
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
function language(book: FilterBook) {
  const saved = book.metadata.language ?? book.metadata.language_code
  if (!saved) return []
  try { return [/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(saved) ? languageNames.of(saved) ?? saved : saved] } catch { return [saved] }
}
const publicationLabels = { complete: 'Completed', in_progress: 'In Progress', hiatus: 'On Hiatus', abandoned: 'Abandoned', deleted: 'Deleted', unknown: 'Unknown' }
export const facets = [
  { key: 'status', label: 'Reading Status', values: (b: FilterBook) => [statuses[b.status]] },
  { key: 'author', label: 'Author', values: (b: FilterBook) => b.metadata.authors },
  { key: 'fandom', label: 'Fandoms', values: (b: FilterBook) => b.metadata.fandoms },
  { key: 'rating', label: 'Rating', values: (b: FilterBook) => b.metadata.rating ? [b.metadata.rating] : [] },
  { key: 'collection', label: 'Organizer Collection', values: (b: FilterBook) => b.collections },
  { key: 'publisher', label: 'Publisher', values: (b: FilterBook) => b.metadata.publisher ? [publisherName(b.metadata.publisher)!] : [] },
  { key: 'publication', label: 'Publication Status', values: (b: FilterBook) => [publicationLabels[b.metadata.publication_status]] },
  { key: 'category', label: 'Category', values: (b: FilterBook) => b.metadata.categories ?? [] },
  { key: 'language', label: 'Language', values: language },
  { key: 'warning', label: 'Archive Warning', values: (b: FilterBook) => b.metadata.archive_warnings ?? [] },
  { key: 'relationship', label: 'Relationships', values: (b: FilterBook) => b.metadata.relationship_tags ?? [] },
  { key: 'character', label: 'Characters', values: (b: FilterBook) => b.metadata.character_tags ?? [] },
  { key: 'freeform', label: 'Freeform Tags', values: (b: FilterBook) => b.metadata.additional_tags ?? [] },
  { key: 'series', label: 'Series', values: (b: FilterBook) => seriesNames(b.metadata) },
  { key: 'version', label: 'EPUB Version', values: (b: FilterBook) => [b.active ? 'Active Version' : 'Retained Version'] },
  { key: 'fandomCount', label: 'Crossover', values: (b: FilterBook) => b.metadata.fandoms.length ? [isCrossover(b.metadata) ? 'Multiple Fandoms' : 'One Fandom'] : [] },
] as const
export const numericFields = [
  { key: 'words', label: 'Words', value: (b: FilterBook) => b.metadata.word_count },
  { key: 'chapters', label: 'Published Chapters', value: (b: FilterBook) => b.metadata.published_chapters },
  { key: 'kudos', label: 'Kudos', value: (b: FilterBook) => b.metadata.kudos },
  { key: 'bookmarks', label: 'Bookmarks', value: (b: FilterBook) => b.metadata.bookmark_count },
  { key: 'comments', label: 'Comments', value: (b: FilterBook) => b.metadata.comment_count },
  { key: 'hits', label: 'Hits', value: (b: FilterBook) => b.metadata.hits },
] as const
export const dateFields = [
  { key: 'published', label: 'Published', value: (b: FilterBook) => b.metadata.published_at },
  { key: 'updated', label: 'Updated', value: (b: FilterBook) => b.metadata.updated_at },
  { key: 'packaged', label: 'Packaged', value: (b: FilterBook) => b.metadata.packaged_at },
  { key: 'imported', label: 'Imported', value: (b: FilterBook) => b.importedAt.slice(0, 10) },
] as const
export type FacetKey = typeof facets[number]['key']
export type NumericKey = typeof numericFields[number]['key']
export type DateKey = typeof dateFields[number]['key']
export type Filters = { selections: Partial<Record<FacetKey, string[]>>; excluded: Partial<Record<FacetKey, string[]>>; modes: Partial<Record<FacetKey, 'any' | 'all'>>; ranges: Partial<Record<NumericKey | DateKey, { min: string; max: string }>> }
export const emptyFilters = (): Filters => ({ selections: {}, excluded: {}, modes: {}, ranges: {} })
export function facetOptions(books: FilterBook[], facet: typeof facets[number]) {
  const counts = new Map<string, { value: string; count: number }>()
  for (const book of books) for (const value of new Set(facet.values(book).map(value => value.trim()).filter(Boolean).map(value => normalize(value)))) {
    const label = facet.values(book).find(item => normalize(item.trim()) === value)!.trim()
    const previous = counts.get(value)
    counts.set(value, { value: previous?.value ?? label, count: (previous?.count ?? 0) + 1 })
  }
  return [...counts.values()].sort((a,b) => a.value.localeCompare(b.value)).concat(books.some(b => !facet.values(b).length) ? [{ value: unknownValue, count: books.filter(b => !facet.values(b).length).length }] : [])
}
export function filterErrors(filters: Filters) {
  return [...numericFields, ...dateFields].flatMap(field => {
    const range = filters.ranges[field.key]
    if (!range) return []
    if (numericFields.some(n => n.key === field.key) && [range.min, range.max].some(value => value !== '' && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))))) return [`${field.label} must use non-negative whole numbers.`]
    if (range.min && range.max && (numericFields.some(n => n.key === field.key) ? Number(range.min) > Number(range.max) : range.min > range.max)) return [`${field.label}: minimum must not exceed maximum.`]
    return []
  })
}
export function matchesBook(book: Book | CatalogBook, filters: Filters, query: string): boolean {
  if (filterErrors(filters).length) return false
  for (const facet of facets) {
    const values = facet.values(book), selected = filters.selections[facet.key], excluded = filters.excluded[facet.key]
    const matches = (choice: string) => choice === unknownValue ? values.length === 0 : values.some(value => normalize(value.trim()) === normalize(choice.trim()))
    const mode = filters.modes[facet.key] ?? (['fandom','language'].includes(facet.key) ? 'any' : 'all')
    if (selected?.length && !(mode === 'any' ? selected.some(matches) : selected.every(matches)) || excluded?.some(matches)) return false
  }
  for (const field of numericFields) {
    const range = filters.ranges[field.key]
    if (!range || !range.min && !range.max) continue
    const value = field.value(book)
    if (value === null || value === undefined || range.min && value < Number(range.min) || range.max && value > Number(range.max)) return false
  }
  for (const field of dateFields) {
    const range = filters.ranges[field.key]
    if (!range || !range.min && !range.max) continue
    const value = field.value(book)
    if (!value || range.min && value < range.min || range.max && value > range.max) return false
  }
  const text = [book.metadata.title, book.metadata.summary, book.workId ?? '', ...book.metadata.ao3_tags, ...(book.metadata.ao3_collections ?? []), ...facets.flatMap(facet => facet.values(book))].join(' ')
  return normalize(text).includes(normalize(query.trim()))
}
export function activeFilterCount(filters: Filters) {
  return [...Object.values(filters.selections), ...Object.values(filters.excluded)].reduce((count, values) => count + (values?.length ?? 0), 0) + Object.values(filters.ranges).filter(range => range && (range.min || range.max)).length
}


export function appliedFilterTags(filters: Filters, query: string) {
  const tags: { id: string; label: string; clear: () => { filters: Filters; query: string } }[] = []
  if (query) tags.push({ id: 'query', label: `Search: ${query}`, clear: () => ({ filters, query: '' }) })
  for (const group of ['selections', 'excluded'] as const) for (const facet of facets) {
    const values = filters[group][facet.key] ?? []
    const mode = filters.modes[facet.key] ?? (['fandom', 'language'].includes(facet.key) ? 'any' : 'all')
    for (const value of values) tags.push({ id: `${group}:${facet.key}:${value}`, label: `${group === 'excluded' ? 'Exclude ' : ''}${facet.label}${group === 'selections' && values.length > 1 ? ` (${mode === 'all' ? 'All' : 'Any'})` : ''}: ${value === unknownValue ? 'Unknown / Not Saved' : value}`, clear: () => ({ filters: { ...filters, [group]: { ...filters[group], [facet.key]: values.filter(item => item !== value) } }, query }) })
  }
  for (const field of [...numericFields, ...dateFields]) for (const bound of ['min', 'max'] as const) {
    const value = filters.ranges[field.key]?.[bound]
    if (value) tags.push({ id: `${field.key}:${bound}`, label: `${field.label} ${bound === 'min' ? 'From' : 'Through'}: ${value}`, clear: () => ({ filters: { ...filters, ranges: { ...filters.ranges, [field.key]: { ...filters.ranges[field.key], [bound]: '' } } }, query }) })
  }
  return tags
}
