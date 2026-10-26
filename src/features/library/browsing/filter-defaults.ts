import { defaultReadingFilters, type ReadingFilters } from '../reading-search'
import { readBrowsing, readingPreferencesKey } from './browsing'

const storageKey = 'between-chapters:filter-defaults:v1'
type SavedDefaults = { library?: ReadingFilters; collections?: Record<string, ReadingFilters> }

function savedDefaults(): SavedDefaults {
  try { return JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') ?? {} }
  catch { return {} }
}

export function filterDefaultScope(mode: string, shelf: string) {
  return `${mode === 'reading' ? 'reading' : 'library'}:${shelf}`
}

export function readFilterDefaults(scope: string, fallback?: ReadingFilters): ReadingFilters {
  const saved = savedDefaults()
  let preferences = {}
  try { preferences = JSON.parse(window.localStorage.getItem(readingPreferencesKey) ?? '{}') ?? {} }
  catch { /* Use built-in ordering when storage is unavailable. */ }
  const values = { ...preferences, ...fallback, ...saved.library, ...saved.collections?.[scope] }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) params.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value))
  const filters = readBrowsing(params, defaultReadingFilters).filters
  if (filters.sort === 'random') filters.randomSeed = crypto.randomUUID()
  return filters
}

export function saveFilterDefaults(filters: ReadingFilters, scope?: string) {
  const saved = savedDefaults()
  // A library default replaces previous category overrides so it applies everywhere.
  const next: SavedDefaults = scope
    ? { ...saved, collections: { ...saved.collections, [scope]: filters } }
    : { library: filters, collections: {} }
  window.localStorage.setItem(storageKey, JSON.stringify(next))
}
