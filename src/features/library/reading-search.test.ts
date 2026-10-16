import { describe, expect, it } from 'vitest'
import { blankMetadata, type Story } from './model'
import { compileSearch, defaultReadingFilters, filterReading, inReadingSection, readingGroups, tracked } from './reading-search'
function story(title: string, values: Partial<Story> = {}): Story {
  return { id: title, metadata: { ...blankMetadata, title }, reading_status: 'reading', last_read_chapter: 0,
    notes: '', personalTags: [], is_favorite: false, work: { ao3_updated_at: null, verified_chapters: {} },
    last_update_notification_at: null, update_dismissed_at: null, ...values } as Story
}
describe('within-results query syntax', () => {
  it.each([
    ['book*', 'book', true], ['book*', 'books and booking', true],
    ['Harry Potter', 'Harry James Potter', true], ['Harry Potter', 'Harry', false],
    ['Harry || Potter', 'Harry', true], ['Harry || Potter', 'Harry Potter', true], ['Harry || Potter', 'Merlin', false],
    ['"Harry Lockhart"', 'Harry Lockhart', true], ['"Harry Lockhart"', 'Harry Potter/Gilderoy Lockhart', false],
    ['Harry -Lockhart', 'Harry Potter', true], ['Harry -Lockhart', 'Gilderoy Lockhart/Harry Potter', false],
    ['Harry Potter || Merlin -Lockhart', 'Merlin', true], ['Harry Potter || Merlin -Lockhart', 'Harry', false],
    ['Harry Potter || Merlin -Lockhart', 'Merlin Lockhart', false],
    ['cafe', 'CAFÉ', true], ['Castiel/Dean', 'Castiel/Dean Winchester', true],
    ['book\\*', 'book*', true], ['book\\*', 'booking', false], ['\\-Harry', '-Harry', true],
    ['\\|\\|', 'a || b', true], ['a.b', 'aXb', false], ['"say \\"hello\\""', 'say "hello"', true],
  ])('query %s matches %s: %s', (query, text, expected) => expect(compileSearch(query)(text)).toBe(expected))
  it.each(['"unfinished', 'Harry ||', '|| Harry', '-', '""', 'Harry\\'])('reports malformed syntax %s', query => expect(() => compileSearch(query)).toThrow())
})
it('handles many wildcards on long summaries without regex backtracking', () => { expect(compileSearch('a*'.repeat(80) + 'z')('a'.repeat(30000))).toBe(false) })
describe('reading filters and sections', () => {
  const alpha = story('Alpha', { metadata: { ...blankMetadata, title: 'Alpha', authors: ['Jane'], fandoms: ['Fandom A', 'Fandom B'], ao3_tags: ['Castiel/Dean', 'Slow Burn'], rating: 'Mature', publication_status: 'complete', published_chapters: 10, summary: 'A secret garden', series: ['First series'] }, last_read_chapter: 2, notes: 'My private reminder', is_favorite: true, work: { ao3_updated_at: '2026-10-15T22:00:00Z', verified_chapters: { 3: '999' } } as unknown as Story['work'] })
  const beta = story('Beta', { metadata: { ...blankMetadata, title: 'Beta', authors: ['Sam'], fandoms: ['Fandom C'], published_chapters: 3 }, reading_status: 'waiting_for_updates' })
  const later = story('Later', { reading_status: 'to_read' })
  it('separates active reading, saved for later, publication and waiting states', () => {
    expect(tracked([alpha, beta, later, story('DNF', { reading_status: 'did_not_finish' })])).toHaveLength(3)
    expect(inReadingSection(later, 'view_all')).toBe(false)
    expect(inReadingSection(later, 'to_read')).toBe(true)
    expect(inReadingSection(alpha, 'complete')).toBe(true)
    expect(inReadingSection(beta, 'waiting')).toBe(true)
    expect(inReadingSection(alpha, 'new')).toBe(false)
    expect(inReadingSection({ ...alpha, last_update_notification_at: '2026-10-15T23:00:00Z' }, 'new')).toBe(true)
    expect(inReadingSection({ ...alpha, last_update_notification_at: '2026-10-15T23:00:00Z', update_dismissed_at: '2026-10-16T00:00:00Z' }, 'new')).toBe(false)
  })
  it('combines publication, favorite, rating, relationship, AO3 tags and any-selected fandom', () => {
    const result = filterReading([alpha, beta], { ...defaultReadingFilters, publication: 'complete', favorites: true, rating: 'Mature', relationship: 'castiel/dean', tags: 'slow, burn', fandoms: ['Fandom B', 'Fandom C'] })
    expect(result).toEqual([alpha])
    expect(filterReading([alpha, beta], { ...defaultReadingFilters, waiting: true })).toEqual([beta])
  })
  it('keeps notes and summary search scopes separate and combines any-field terms across fields', () => {
    expect(filterReading([alpha], { ...defaultReadingFilters, within: 'garden', scope: 'notes' })).toEqual([])
    expect(filterReading([alpha], { ...defaultReadingFilters, within: 'garden', scope: 'summary' })).toEqual([alpha])
    expect(filterReading([alpha], { ...defaultReadingFilters, within: 'Jane "slow burn" reminder', scope: 'any' })).toEqual([alpha])
  })
  it('filters inclusive UTC dates and excludes unknown AO3 dates', () => {
    expect(filterReading([alpha, beta], { ...defaultReadingFilters, updatedAfter: '2026-10-15', updatedBefore: '2026-10-15' })).toEqual([alpha])
    expect(filterReading([alpha], { ...defaultReadingFilters, updatedAfter: '2026-10-16' })).toEqual([])
  })
  it('sorts by known dates and unread saved counts, with unknown values last', () => {
    expect(filterReading([beta, later, alpha], { ...defaultReadingFilters, sort: 'ready' })).toEqual([alpha, beta, later])
    expect(filterReading([beta, alpha], { ...defaultReadingFilters, sort: 'updated' })).toEqual([alpha, beta])
  })
  it('groups multiple fandoms/authors/series without inventing missing metadata', () => {
    expect(readingGroups([alpha], 'fandom').map(([name]) => name)).toEqual(['Fandom A', 'Fandom B'])
    expect(readingGroups([alpha], 'author')[0][0]).toBe('Jane')
    expect(readingGroups([alpha, beta], 'series').map(([name]) => name)).toEqual(['First series', 'No series information saved'])
  })
})
