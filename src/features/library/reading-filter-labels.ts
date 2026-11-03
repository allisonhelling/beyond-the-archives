import { filterDateText, ratingLabel } from './model'
import { publicationStatuses } from './publication-status'
import { defaultReadingFilters, type ReadingFilters } from './reading-search'
import type { TagCategory } from './display/display-settings'

export function filterPublicationLabel(value: ReadingFilters['publication'][number], series = false) {
  return series
    ? value === 'complete' ? 'Complete' : value === 'in_progress' ? 'Incomplete' : 'Completion Unknown'
    : value === 'in_progress' ? 'In Progress on AO3' : publicationStatuses[value].label
}

export type ReadingFilterTag = { label: string; category?: TagCategory; key: keyof ReadingFilters; value?: string }

/** Labels and removal share the same field identities, including individual tag terms. */
export function readingFilterTags(filters: ReadingFilters, { authorOnly = false, series = false, seriesVisibility = false }: { authorOnly?: boolean; series?: boolean; seriesVisibility?: boolean } = {}): ReadingFilterTag[] {
  const tags: ReadingFilterTag[] = []
  const add = (key: keyof ReadingFilters, label: string, value?: string, category?: TagCategory) => tags.push({ key, label, value, category })
  if (filters.query) add('query', `${authorOnly ? 'Author' : 'Title / Author'}: ${filters.query}`)
  filters.fandoms.forEach(value => add('fandoms', `Fandom: ${value}`, value))
  filters.publication.forEach(value => add('publication', `Publication Status: ${filterPublicationLabel(value, series)}`, value))
  for (const [key, label] of [['oneShot', 'One-Shot'], ['crossovers', 'Crossovers']] as const) {
    if (filters[key] && filters[key] !== 'allowed') add(key, `${label} ${filters[key] === 'only' ? 'Only' : 'Exclude'}`)
  }
  if (filters.inSeries) add('inSeries', 'In a Series Only')
  if (!authorOnly && !series && (filters.showSeries || seriesVisibility)) add('showSeries', filters.showSeries ? 'Show Series' : 'Hide Series')
  if (filters.excludeLaterSeries) add('excludeLaterSeries', 'Exclude Later Series Works')
  filters.rating.forEach(value => add('rating', `Content Rating: ${ratingLabel(value)}`, value))
  ;(filters.personalRating ?? []).forEach(value => add('personalRating', `Rating: ${value === 'unrated' ? 'Unrated' : `${value}/5`}`, value))
  for (const [key, label] of [['favorites', 'Favorites Only'], ['personalNotes', 'Personal Notes Only'], ['recs', 'Recs Only']] as const) if (filters[key]) add(key, label)
  for (const [key, label, category] of [['relationship', 'Relationships', 'relationships'], ['characters', 'Characters', 'characters'], ['tags', 'Tags', 'tags'], ['personalTags', 'Personal Tags', undefined]] as const) {
    for (const value of (filters[key] ?? '').split(',').map(value => value.trim()).filter(Boolean)) add(key, `${label}: ${value}`, value, category)
  }
  if (filters.within) add('within', `Search ${filters.scope === 'any' ? 'All Information' : filters.scope === 'summary' ? 'Summary' : 'Notes'}: ${filters.within}`)
  for (const [key, label] of [['updatedAfter', 'Updated From'], ['updatedBefore', 'Updated Through']] as const) if (filters[key]) add(key, `${label}: ${filterDateText(filters[key])}`)
  return tags
}

export function removeReadingFilter(filters: ReadingFilters, { key, value }: ReadingFilterTag): ReadingFilters {
  const current = filters[key]
  const next = Array.isArray(current) ? current.filter(item => item !== value)
    : value !== undefined && typeof current === 'string' ? current.split(',').map(item => item.trim()).filter(item => item && item !== value).join(', ')
    : key === 'showSeries' ? !filters.showSeries : defaultReadingFilters[key]
  return { ...filters, [key]: next }
}

export function readingFilterLabels(filters: ReadingFilters, options: Parameters<typeof readingFilterTags>[1] = {}): string[] {
  return readingFilterTags(filters, options).map(tag => tag.label)
}
