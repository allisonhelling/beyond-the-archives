import { type Collection, type Story } from '../model'
import { readingFilterLabels } from '../reading-filter-labels'
import { defaultReadingFilters, filterReading, hasReadingFilters, parseSearch, type ReadingFilters, type SearchTerms } from '../reading-search'

export type AutomaticCollectionRules = { filters: ReadingFilters; terms: SearchTerms }
/** Source labels, not canonical synonym evidence. Both variants use the ordinary Any matcher. */
export const originalWorkFandoms = ['Original Work', 'Original Works']
export function originalWorksRules(): AutomaticCollectionRules {
  return automaticCollectionRules({ ...defaultReadingFilters, fandoms: [...originalWorkFandoms] })
}
export function collectionRules(collection: Pick<Collection, 'automatic_rules'>): AutomaticCollectionRules | null {
  return collection.automatic_rules ? collection.automatic_rules as unknown as AutomaticCollectionRules : null
}
export function automaticCollectionRules(filters: ReadingFilters): AutomaticCollectionRules {
  const normalized = { ...defaultReadingFilters, ...filters, showSeries: false, sort: defaultReadingFilters.sort, groupBy: defaultReadingFilters.groupBy }
  delete normalized.randomSeed
  filterReading([], normalized)
  if (!hasReadingFilters(normalized)) throw new Error('Choose at least one filter for this automatic collection.')
  return { filters: normalized, terms: parseSearch(normalized.within) }
}
/** Match saved effective metadata with the same filters used by the library. */
export function applyAutomaticCollections(stories: Story[], collections: Collection[]): Story[] {
  const memberships = new Map<string, string[]>()
  for (const collection of collections) {
    const rules = collectionRules(collection)
    if (!rules) continue
    for (const story of filterReading(stories, rules.filters, { authorOnly: true })) {
      const ids = memberships.get(story.id) ?? []
      ids.push(collection.id); memberships.set(story.id, ids)
    }
  }
  return stories.map(story => ({ ...story, automaticCollectionIds: memberships.get(story.id) ?? [] }))
}

/** Human-readable rules reuse the labels used by the library filter controls. */
export function automaticCollectionLabels(collection: Pick<Collection, 'automatic_rules'>): string[] {
  const rules = collectionRules(collection)
  if (!rules) return []
  return readingFilterLabels({ ...defaultReadingFilters, ...rules.filters }, { authorOnly: true })
}
