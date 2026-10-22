import { defaultReadingFilters, type ReadingFilters } from './reading-search'
import { pageSize, savedPageSize } from './page-size'
export function readBrowsing(params: URLSearchParams, defaults = defaultReadingFilters) {
  const filters = { ...defaults }
  for (const key of Object.keys(defaultReadingFilters) as (keyof ReadingFilters)[]) {
    const value = params.get(key)
    if (value === null) continue
    if (Array.isArray(defaultReadingFilters[key])) {
      try { const parsed = JSON.parse(value); if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) Object.assign(filters, { [key]: parsed }) } catch { /* Ignore malformed links. */ }
    } else if (typeof defaultReadingFilters[key] === 'boolean') Object.assign(filters, { [key]: value === 'true' })
    else Object.assign(filters, { [key]: value })
  }
  const randomSeed = params.get('randomSeed')
  if (randomSeed !== null) filters.randomSeed = randomSeed
  if (!['random','added','added_reverse','updated','updated_reverse','ready','ready_reverse','alpha','alpha_reverse'].includes(filters.sort)) filters.sort = defaults.sort
  if (!['none','fandom','author','series'].includes(filters.groupBy)) filters.groupBy = defaults.groupBy
  if (!['allowed','only','exclude'].includes(filters.oneShot)) filters.oneShot = 'allowed'
  if (!['any','summary','notes'].includes(filters.scope)) filters.scope = 'any'
  const requested = Number(params.get('page'))
  return { filters, page: Number.isSafeInteger(requested) && requested > 0 && requested <= 2147483647 ? requested : 1, size: pageSize(params.get('size')) ?? savedPageSize() }
}
export function writeBrowsing(params: URLSearchParams, filters: ReadingFilters, size: number | undefined, page = 1) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(filters)) next.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value))
  if (size === undefined) next.delete('size'); else next.set('size', String(size))
  next.set('page', String(page))
  return next
}

export function browsingReturnTo(value: unknown, fallback = '/library') {
  return typeof value === 'string' && /^\/(?:reading|library|series\/[1-9]\d*)(?:\?[^#]*)?$/.test(value) ? value : fallback
}
