import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultReadingFilters } from '../reading-search'
import { readBrowsing, writeBrowsing } from './browsing'
import { filterDefaultScope, readFilterDefaults, saveFilterDefaults } from './filter-defaults'

beforeEach(() => {
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
afterEach(() => vi.unstubAllGlobals())

it('restores category defaults and lets explicit URL filters override them', () => {
  const scope = filterDefaultScope('library', 'favorites')
  saveFilterDefaults({ ...defaultReadingFilters, personalTags: 'Comfort', favorites: true }, scope)
  expect(readFilterDefaults(scope)).toMatchObject({ personalTags: 'Comfort', favorites: true })
  expect(readFilterDefaults(filterDefaultScope('library', 'all')).personalTags).toBe('')
  expect(readBrowsing(new URLSearchParams('favorites=false'), readFilterDefaults(scope)).filters).toMatchObject({ personalTags: 'Comfort', favorites: false })
  const url = writeBrowsing(new URLSearchParams(), readFilterDefaults(scope), undefined)
  expect(readBrowsing(url).filters.personalTags).toBe('Comfort')
})

it('replaces category overrides when saving a library default for every category', () => {
  saveFilterDefaults({ ...defaultReadingFilters, tags: 'Old' }, 'library:favorites')
  saveFilterDefaults({ ...defaultReadingFilters, personalTags: 'New', sort: 'alpha' })
  for (const scope of ['library:favorites', 'library:all', 'reading:view_all', 'reading:waiting']) {
    expect(readFilterDefaults(scope)).toMatchObject({ tags: '', personalTags: 'New', sort: 'alpha' })
  }
})

it('preserves current filters when switching categories without a saved default', () => {
 const current = { ...defaultReadingFilters, tags: 'Fluff', sort: 'alpha' as const }
 expect(readFilterDefaults('library:favorites', current)).toMatchObject({tags:'Fluff',sort:'alpha'})
 saveFilterDefaults({...defaultReadingFilters, personalTags:'Comfort'}, 'library:favorites')
 expect(readFilterDefaults('library:favorites', current)).toMatchObject({tags:'',personalTags:'Comfort'})
})
