import { filterDateText, ratingLabel } from './model'
import { publicationStatuses } from './publication-status'
import type { ReadingFilters } from './reading-search'

export function filterPublicationLabel(value: ReadingFilters['publication'][number], series = false) {
  return series
    ? value === 'complete' ? 'Complete' : value === 'in_progress' ? 'Incomplete' : 'Completion Unknown'
    : value === 'in_progress' ? 'In Progress on AO3' : publicationStatuses[value].label
}

/** Keep active filters and saved collection rules consistent without changing user text. */
export function readingFilterLabels(filters: ReadingFilters, { authorOnly = false, series = false }: { authorOnly?: boolean; series?: boolean } = {}): string[] {
  return [
    ...(filters.query ? [`${authorOnly ? 'Author' : 'Title / Author'}: ${filters.query}`] : []),
    ...filters.fandoms.map(value => `Fandom: ${value}`),
    ...filters.publication.map(value => `Publication Status: ${filterPublicationLabel(value, series)}`),
    ...(filters.oneShot !== 'allowed' ? [`One-Shot ${filters.oneShot === 'only' ? 'Only' : 'Exclude'}`] : []),
    ...(filters.inSeries ? ['In a Series Only'] : []),
    ...filters.rating.map(value => `Content Rating: ${ratingLabel(value)}`),
    ...(filters.personalRating ?? []).map(value => `Rating: ${value === 'unrated' ? 'Unrated' : `${value}/5`}`),
    ...(filters.favorites ? ['Favorites Only'] : []),
    ...(filters.personalNotes ? ['Personal Notes Only'] : []),
    ...(filters.recs ? ['Recs Only'] : []),
    ...([['relationship', 'Relationships'], ['characters', 'Characters'], ['tags', 'Tags']] as const).flatMap(([key, label]) => filters[key] ? [`${label}: ${filters[key]}`] : []),
    ...(filters.within ? [`Search ${filters.scope === 'any' ? 'All Information' : filters.scope === 'summary' ? 'Summary' : 'Notes'}: ${filters.within}`] : []),
    ...([['updatedAfter', 'Updated From'], ['updatedBefore', 'Updated Through']] as const).flatMap(([key, label]) => filters[key] ? [`${label}: ${filterDateText(filters[key])}`] : []),
  ]
}
