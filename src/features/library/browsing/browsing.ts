import { normalizeTagExpressions, tagFilterConfig } from '../tags/tag-expressions'
import { defaultReadingFilters, type ReadingFilters } from '../reading-search'
import { pageSize, savedPageSize } from './page-size'
export const readingPreferencesKey = 'between-chapters:reading-preferences:v1'
export const collectionSortKey = 'between-chapters:collection-sort:v1'

export function isFilterNavigation(from: string, to: string) {
  const previous = new URL(from || '/', 'https://library.local'), next = new URL(to, 'https://library.local')
  return previous.pathname === next.pathname && previous.hash === next.hash && previous.searchParams.get('shelf') === next.searchParams.get('shelf') &&
    Object.keys(defaultReadingFilters).some(key => previous.searchParams.get(key) !== next.searchParams.get(key))
}

export function readBrowsing(params: URLSearchParams, defaults = defaultReadingFilters) {
  const filters = { ...defaults, tagExpressions: normalizeTagExpressions(defaults.tagExpressions) }
  for (const key of Object.keys(defaultReadingFilters) as (keyof ReadingFilters)[]) {
    const value = params.get(key)
    if (value === null) continue
    if (key === 'tagExpressions') {
      try { filters.tagExpressions = normalizeTagExpressions(JSON.parse(value)) } catch { filters.tagExpressions = {} }
    } else if (Array.isArray(defaultReadingFilters[key])) {
      try { const parsed = JSON.parse(value); if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) Object.assign(filters, { [key]: parsed }) } catch { /* Ignore malformed links. */ }
    } else if (typeof defaultReadingFilters[key] === 'boolean') Object.assign(filters, { [key]: value === 'true' })
    else Object.assign(filters, { [key]: value })
  }
  // An old URL's explicit legacy selection overrides a newer saved expression.
  if (!params.has('tagExpressions')) for (const key of Object.keys(tagFilterConfig)) {
    if (params.has(key)) delete filters.tagExpressions[key as keyof typeof tagFilterConfig]
  }
  const randomSeed = params.get('randomSeed')
  if (randomSeed !== null) filters.randomSeed = randomSeed
  if (!['words','words_reverse','random','added','added_reverse','updated','updated_reverse','ready','ready_reverse','alpha','alpha_reverse'].includes(filters.sort)) filters.sort = defaults.sort
  if (!['none','fandom','author','series'].includes(filters.groupBy)) filters.groupBy = defaults.groupBy
  if (!['allowed','only','exclude'].includes(filters.oneShot)) filters.oneShot = 'allowed'
  if (!['allowed','only','exclude'].includes(filters.crossovers ?? 'allowed')) filters.crossovers = 'allowed'
  if (!['any','summary','notes'].includes(filters.scope)) filters.scope = 'any'
  for (const key of ['countConfidence','publicationConfidence'] as const) if (!['','any','verified','automatic','manual','unknown'].includes(filters[key] ?? '')) filters[key] = ''
  const requested = Number(params.get('page'))
  return { filters, page: Number.isSafeInteger(requested) && requested > 0 && requested <= 2147483647 ? requested : 1, size: pageSize(params.get('size')) ?? savedPageSize() }
}
export function writeBrowsing(params: URLSearchParams, filters: ReadingFilters, size: number | undefined, page = 1) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(filters)) next.set(key, value && typeof value === 'object' ? JSON.stringify(value) : String(value))
  if (size === undefined) next.delete('size'); else next.set('size', String(size))
  next.set('page', String(page))
  return next
}

export function browsingReturnTo(value: unknown, fallback = '/library') {
  return typeof value === 'string' && /^\/(?:reading|library|series\/[1-9]\d*|authors\/[^/?#]+)(?:\?[^#]*)?$/.test(value) ? value : fallback
}
