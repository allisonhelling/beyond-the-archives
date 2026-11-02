import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Router, type Navigator } from 'react-router-dom'
import { ReadingDashboard } from './ReadingDashboard'
import { useLibraryResults } from './useLibraryResults'
import { defaultReadingFilters } from './reading-search'
import { writeBrowsing, readingPreferencesKey } from './browsing/browsing'
import { saveFilterDefaults } from './browsing/filter-defaults'

vi.mock('./LibraryProvider', () => ({ useLibrary: () => ({ temporaryPageSizes: new Map(), checkRevision: vi.fn() }) }))
vi.mock('./useLibraryResults', () => ({ useLibraryResults: vi.fn(() => ({ loading: false })) }))
vi.mock('../imports/usePageMetadataRefresh', () => ({ usePageMetadataRefresh: () => ({ unavailable: true }) }))
vi.mock('./ReadingFilterControls', () => ({
 ReadingFilterControls: ({ onChange, orderingControls }: { onChange: (filters: typeof defaultReadingFilters) => void; orderingControls?: ReactNode }) =>
  <>{orderingControls}<button onClick={() => onChange({ ...defaultReadingFilters })}>Clear Filters</button></>,
}))

beforeEach(() => {
 vi.mocked(useLibraryResults).mockReturnValue({ loading: false, retry: vi.fn() })
 const values = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
})

afterEach(() => vi.unstubAllGlobals())

function pendingNavigation(sort: 'alpha' | 'random' = 'alpha') {
 const push = vi.fn()
 const navigator: Navigator = { createHref: () => '', go: vi.fn(), push, replace: vi.fn() }
 const search = writeBrowsing(new URLSearchParams('shelf=all'), {
  ...defaultReadingFilters, favorites: true, query: 'Old search', sort, groupBy: 'author', ...(sort === 'random' && { randomSeed: 'chosen-order' }),
 }, undefined).toString()
 // Keep the router location pending after push, as during a concurrent navigation.
 render(<Router location={{ pathname: '/library', search: `?${search}` }} navigator={navigator}>
  <ReadingDashboard localOnly stories={[]} mode="library" showActions={false} renderStory={() => null}
   renderHeader={(_actions, _total, selectShelf) => <button onClick={() => selectShelf('finished')}>Finished Shelf</button>} />
 </Router>)
 return () => new URLSearchParams(push.mock.lastCall![0].search)
}

it.each(['alpha', 'random'] as const)('keeps current %s ordering when a filter-panel update carries older ordering values', sort => {
 const navigated = pendingNavigation(sort)
 fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
 expect(navigated().get('groupBy')).toBe('author')
 expect(navigated().get('sort')).toBe(sort)
 expect(navigated().get('randomSeed')).toBe(sort === 'random' ? 'chosen-order' : null)
 expect(JSON.parse(localStorage.getItem(readingPreferencesKey)!)).toEqual({ sort, groupBy: 'author' })
})

it.each([false, true])('uses cleared optimistic filters for a shelf change before URL commit (saved defaults: %s)', saved => {
 const navigated = pendingNavigation()
 if (saved) saveFilterDefaults({ ...defaultReadingFilters, tags: 'Comfort', sort: 'updated' }, 'library:finished')
 fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
 fireEvent.click(screen.getByRole('button', { name: 'Finished Shelf' }))
 expect(navigated().get('shelf')).toBe('finished')
 expect(navigated().get('favorites')).toBe('false')
 expect(navigated().get('query')).toBe('')
 expect(navigated().get('tags')).toBe(saved ? 'Comfort' : '')
 expect(navigated().get('sort')).toBe(saved ? 'updated' : 'alpha')
 expect(navigated().get('groupBy')).toBe(saved ? 'none' : 'author')
})

it.each([
 { search: '', saved: false, expected: 'Author' },
 { search: '?groupBy=none', saved: false, expected: 'None' },
 { search: '', saved: true, expected: 'Fandom' },
])('reads current defaults on a new entry without unmounting (search: $search, saved: $saved)', ({ search, saved, expected }) => {
 const push = vi.fn(), replace = vi.fn()
 const navigator: Navigator = { createHref: () => '', go: vi.fn(), push, replace }
 const page = (search: string, key: string) => <Router location={{ pathname: '/reading', search, key }} navigator={navigator}>
  <ReadingDashboard localOnly stories={[]} showActions={false} renderStory={() => null} />
 </Router>
 const view = render(page('', 'initial'))
 view.rerender(page(replace.mock.lastCall![0].search, 'normalized'))
 fireEvent.click(screen.getByRole('button', { name: 'Group' }))
 fireEvent.click(screen.getByRole('option', { name: 'Author' }))
 view.rerender(page(push.mock.lastCall![0].search, 'selected'))
 expect(JSON.parse(localStorage.getItem(readingPreferencesKey)!)).toMatchObject({ groupBy: 'author' })
 fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
 if (saved) saveFilterDefaults({ ...defaultReadingFilters, groupBy: 'fandom' }, 'reading:view_all')
 // A rapid navigation away and back can retain this same dashboard instance.
 view.rerender(page(search, 'returned'))
 expect(screen.getByRole('button', { name: 'Group' })).toHaveTextContent(expected)
 expect(JSON.parse(localStorage.getItem(readingPreferencesKey)!)).toMatchObject({ groupBy: 'author' })
})

it('keeps the bottom page-size control mounted while replacement results load', () => {
 const result = { stories: [], series: [], total: 60, page: 1, pages: 3, sections: {}, fandoms: [] }
 const retry = vi.fn()
 vi.mocked(useLibraryResults).mockReturnValue({ loading: false, result, retry })
 const navigator: Navigator = { createHref: () => '', go: vi.fn(), push: vi.fn(), replace: vi.fn() }
 const dashboard = () => <Router location={{ pathname: '/library', search: '?shelf=all', key: 'initial' }} navigator={navigator}>
  <ReadingDashboard stories={[]} mode="library" showActions={false} renderStory={() => null} />
 </Router>
 const view = render(dashboard())
 const bottom = screen.getAllByRole('navigation', { name: 'Result Pages' }).at(-1)!
 const size = within(bottom).getByRole('combobox', { name: 'Works per Page' })
 size.focus()
 vi.mocked(useLibraryResults).mockReturnValue({ loading: true, previousResult: result, retry })
 fireEvent.change(size, { target: { value: '50' } })
 view.rerender(dashboard())
 expect(screen.getAllByRole('navigation', { name: 'Result Pages' })).toHaveLength(2)
 expect(within(bottom).getByRole('combobox', { name: 'Works per Page' })).toBe(size)
 expect(size).toHaveFocus()
 expect(size).toHaveValue('50')
 expect(within(bottom).getByRole('status')).toHaveTextContent('Updating…')
 vi.mocked(useLibraryResults).mockReturnValue({ loading: false, result: { ...result, pages: 2 }, retry })
 view.rerender(dashboard())
 expect(size).toHaveValue('50')
 expect(within(bottom).getByRole('status')).toHaveTextContent('1–50 of 60')
 expect(within(bottom).getByRole('status')).not.toHaveTextContent('Updating…')
})

it('keeps the destination shelf when filters are cleared before shelf navigation commits', () => {
 const navigated = pendingNavigation()
 fireEvent.click(screen.getByRole('button', { name: 'Finished Shelf' }))
 fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
 expect(navigated().get('shelf')).toBe('finished')
 expect(navigated().get('query')).toBe('')
 expect(navigated().get('favorites')).toBe('false')
})
