import { describe, expect, it } from 'vitest'
import { blankMetadata, type Story } from './model'
import { compileSearch, defaultReadingFilters, filterReading, inReadingSection, readingGroups, tracked } from './reading-search'
function story(title: string, values: Partial<Story> = {}): Story {
  return { id: title, metadata: { ...blankMetadata, title }, reading_status: 'reading', last_read_chapter: 0,
    notes: '', personalTags: [], is_favorite: false, work: { ao3_updated_at: null, verified_chapters: {} },
    last_update_notification_at: null, update_dismissed_at: null, ...values } as Story
}
it('combines notes, Rec evidence, personal rating and content rating independently', () => {
 const entries = [
  story('Recommended', { personal_rating: 5, notes: 'My thoughts', source_bookmark: { rec: true }, metadata: { ...blankMetadata, rating: 'Mature' } }),
  story('Not a Rec', { personal_rating: 1, notes: 'Other notes', source_bookmark: { rec: false }, metadata: { ...blankMetadata, rating: 'Explicit' } }),
  story('Unknown', { personal_rating: null, notes: ' \n\t ', source_bookmark: { rec: null } }),
 ]
 expect(filterReading(entries, { ...defaultReadingFilters, personalNotes: true })).toHaveLength(2)
 expect(filterReading(entries, { ...defaultReadingFilters, recs: true })).toEqual([entries[0]])
 expect(filterReading(entries, { ...defaultReadingFilters, personalRating: ['1', '5'] })).toHaveLength(2)
 expect(filterReading(entries, { ...defaultReadingFilters, personalRating: ['unrated'] })).toEqual([entries[2]])
 expect(filterReading(entries, { ...defaultReadingFilters, personalNotes: true, recs: true, personalRating: ['5'], rating: ['Mature'] })).toEqual([entries[0]])
 expect(filterReading(entries, { ...defaultReadingFilters, personalRating: ['5'], rating: ['Explicit'] })).toEqual([])
})
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
  const alpha = story('Alpha', { metadata: { ...blankMetadata, title: 'Alpha', authors: ['Jane'], fandoms: ['Fandom A', 'Fandom B'], ao3_tags: ['Castiel/Dean', 'Slow Burn'], relationship_tags: ['Castiel/Dean'], character_tags: ['Dean Winchester'], additional_tags: ['Slow Burn', 'Action/Adventure'], rating: 'Mature', publication_status: 'complete', published_chapters: 10, summary: 'A secret garden', series: ['First series'] }, last_read_chapter: 2, notes: 'My private reminder', is_favorite: true, work: { ao3_updated_at: '2026-10-15T22:00:00Z', verified_chapters: { 3: '999' } } as unknown as Story['work'] })
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
    const result = filterReading([alpha, beta], { ...defaultReadingFilters, publication: ['complete'], favorites: true, rating: ['Mature'], relationship: 'castiel/dean', tags: 'slow, burn', fandoms: ['Fandom B', 'Fandom C'] })
    expect(result).toEqual([alpha])
    expect(filterReading([alpha], { ...defaultReadingFilters, relationship: 'Castiel/Dean, Missing relationship' })).toEqual([])
  })
  it('filters works with linked or manually entered series', () => {
    expect(filterReading([alpha, beta], { ...defaultReadingFilters, inSeries: true })).toEqual([alpha])
    expect(filterReading([alpha, beta], defaultReadingFilters)).toHaveLength(2)
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

it.each(['reading', 're_reading', 'waiting_for_updates', 'to_read', 'finished', 'did_not_finish'] as const)('publication tiles include only actively read works (%s)', status => {
  for (const publication of ['complete', 'in_progress', 'unknown'] as const) {
    const entry = story('Publication rules', { reading_status: status, metadata: { ...blankMetadata, title: 'Publication rules', publication_status: publication } })
    const activelyReading = status === 'reading' || status === 're_reading'
    expect(inReadingSection(entry, 'in_progress')).toBe(activelyReading && publication === 'in_progress')
    expect(inReadingSection(entry, 'complete')).toBe(activelyReading && publication === 'complete')
  }
})
it('moves an unfinished story from In Progress to Waiting when its reading status changes', () => {
  const entry = story('Ongoing', { metadata: { ...blankMetadata, title: 'Ongoing', publication_status: 'in_progress' } })
  expect(inReadingSection(entry, 'in_progress')).toBe(true)
  expect(inReadingSection(entry, 'waiting')).toBe(false)
  entry.reading_status = 'waiting_for_updates'
  expect(inReadingSection(entry, 'in_progress')).toBe(false)
  expect(inReadingSection(entry, 'waiting')).toBe(true)
})

it('keeps Characters and Additional Tags filters scoped to their saved AO3 categories', () => {
  const classified = story('Classified', { metadata: { ...blankMetadata, title: 'Classified', ao3_tags: ['No Archive Warnings Apply', 'Legacy unclassified'], relationship_tags: ['Castiel/Dean Winchester'], character_tags: ['Dean Winchester'], additional_tags: ['Action/Adventure', 'Slow Burn'] } })
  expect(filterReading([classified], { ...defaultReadingFilters, characters: 'dean' })).toEqual([classified])
  expect(filterReading([classified], { ...defaultReadingFilters, characters: 'Slow Burn' })).toEqual([])
  expect(filterReading([classified], { ...defaultReadingFilters, tags: 'dean' })).toEqual([])
  expect(filterReading([classified], { ...defaultReadingFilters, relationship: 'Action/Adventure' })).toEqual([])
  expect(filterReading([classified], { ...defaultReadingFilters, tags: 'Action/Adventure, slow', characters: 'Dean' })).toEqual([classified])
  expect(filterReading([classified], { ...defaultReadingFilters, tags: 'No Archive Warnings Apply' })).toEqual([])
  expect(filterReading([classified], { ...defaultReadingFilters, tags: 'Legacy unclassified' })).toEqual([])
  expect(filterReading([classified], { ...defaultReadingFilters, within: 'Legacy unclassified' })).toEqual([classified])
  expect(filterReading([classified], { ...defaultReadingFilters, within: 'dean slow' })).toEqual([classified])
})


it('defaults to date added newest first using saved dates, with alphabetical ties and unknown dates last', () => {
  const older = story('Older', { created_at: '2026-10-14T12:00:00Z', updated_at: '2026-10-20T12:00:00Z' })
  const newestZ = story('Z newest', { created_at: '2026-10-16T12:00:00Z' })
  const newestA = story('A newest', { created_at: '2026-10-16T12:00:00Z' })
  const unknown = story('Unknown', { created_at: 'invalid' })
  expect(filterReading([older, newestZ, unknown, newestA], defaultReadingFilters)).toEqual([newestA, newestZ, older, unknown])
})

it('includes or excludes abandoned fics independently of their reading status', () => {
  const abandoned = ['to_read', 'reading', 'finished', 'did_not_finish'].map(reading_status => story(reading_status, {
    reading_status: reading_status as Story['reading_status'], metadata: { ...blankMetadata, publication_status: 'abandoned' },
  }))
  const ongoing = story('Ongoing')
  expect(filterReading([...abandoned, ongoing], { ...defaultReadingFilters, publication: ['abandoned'] })).toHaveLength(4)
  expect(filterReading([...abandoned, ongoing], { ...defaultReadingFilters, publication: ['complete', 'in_progress', 'unknown'] })).toEqual([ongoing])
  expect(filterReading(abandoned, { ...defaultReadingFilters, within: 'abandoned' })).toHaveLength(4)
})

it('combines selected publication statuses with OR and treats an empty selection as all statuses', () => {
  const entries = ['complete', 'in_progress', 'abandoned', 'unknown', 'deleted'].map(publication => story(publication, {
    metadata: { ...blankMetadata, title: publication, publication_status: publication as Story['metadata']['publication_status'] },
  }))
  expect(filterReading(entries, { ...defaultReadingFilters, publication: [] })).toHaveLength(5)
  expect(filterReading(entries, { ...defaultReadingFilters, publication: ['deleted'] })).toEqual([entries[4]])
  expect(filterReading(entries, { ...defaultReadingFilters, publication: ['abandoned', 'complete'] }).map(story => story.id).sort()).toEqual(['abandoned', 'complete'])
  expect(filterReading(entries, { ...defaultReadingFilters, publication: ['complete', 'in_progress', 'unknown'] })).toHaveLength(3)
  expect(filterReading(entries, { ...defaultReadingFilters, publication: ['unknown'] })).toEqual([entries[3]])
  expect(filterReading(entries, { ...defaultReadingFilters, publication: ['abandoned', 'complete'], query: 'complete' })).toEqual([entries[0]])
})

it('allows, includes only, or excludes the same inferred and manually marked one-shots', () => {
  const stories = [
    story('Single chapter', { metadata: { ...blankMetadata, title: 'Single chapter', publication_status: 'complete', published_chapters: 1 } }),
    story('Tagged', { personalTags: ['One shot'] }),
    story('AO3 tag', { metadata: { ...blankMetadata, title: 'AO3 tag', ao3_tags: ['Oneshot'] } }),
    story('With art', { metadata: { ...blankMetadata, title: 'With art', published_chapters: 3, one_shot: true } }),
    story('Ongoing', { metadata: { ...blankMetadata, title: 'Ongoing', publication_status: 'in_progress', published_chapters: 1 } }),
    story('Long fic'),
  ]
  expect(filterReading(stories, defaultReadingFilters)).toHaveLength(6)
  expect(filterReading(stories, { ...defaultReadingFilters, oneShot: 'only', sort: 'alpha' }).map(story => story.metadata.title)).toEqual(['AO3 tag', 'Single chapter', 'Tagged', 'With art'])
  expect(filterReading(stories, { ...defaultReadingFilters, oneShot: 'exclude', sort: 'alpha' }).map(story => story.metadata.title)).toEqual(['Long fic', 'Ongoing'])
})

it('reverses each fic sort and keeps unknown counts and dates last', () => {
  const stories = [
    story('Alpha', { created_at: '2026-01-01', metadata: { ...blankMetadata, title: 'Alpha', published_chapters: 2 }, work: { ao3_updated_at: '2026-01-01' } as Story['work'] }),
    story('Beta', { created_at: '2026-02-01', metadata: { ...blankMetadata, title: 'Beta', published_chapters: 6 }, work: { ao3_updated_at: '2026-02-01' } as Story['work'] }),
    story('Unknown'),
  ]
  for (const sort of ['added_reverse', 'updated_reverse', 'ready_reverse'] as const) {
    expect(filterReading(stories, { ...defaultReadingFilters, sort }).map(story => story.metadata.title)).toEqual(['Alpha', 'Beta', 'Unknown'])
  }
  expect(filterReading(stories, { ...defaultReadingFilters, sort: 'alpha_reverse' }).map(story => story.metadata.title)).toEqual(['Unknown', 'Beta', 'Alpha'])
})

it('matches any selected AO3 rating, while an empty selection includes every rating',()=>{
 const works=['Mature','Explicit','General Audiences',''].map((rating,index)=>story(String(index),{metadata:{...blankMetadata,title:String(index),rating}}))
 expect(filterReading(works,{...defaultReadingFilters,rating:['Mature','Explicit']})).toEqual(works.slice(0,2))
 expect(filterReading(works,{...defaultReadingFilters,rating:[]})).toHaveLength(4)
})
it('rejects invalid or partially typed calendar dates rather than silently filtering everything out',()=>{
 for(const date of ['2026-','2026-02-30','2026-13-01']) expect(()=>filterReading([],{...defaultReadingFilters,updatedAfter:date})).toThrow('Enter a valid From date')
})

it('groups series by AO3 identity, including same-named memberships and series cards', () => {
 const membership = (id:number) => ({id,name:'Same series',url:`https://archiveofourown.org/series/${id}`,position:1})
 const first = story('Same fic',{id:'entry-101',metadata:{...blankMetadata,title:'Same fic',series:['Same series'],series_memberships:[membership(77)]}})
 const second = story('Same fic',{id:'entry-102',metadata:{...blankMetadata,title:'Same fic',series:['Same series'],series_memberships:[membership(88)]}})
 expect(readingGroups([first,second],'series')).toEqual([
  ['Same series (AO3 series 77)',[first],'series:77'],
  ['Same series (AO3 series 88)',[second],'series:88'],
 ])
 const both = {...first,metadata:{...first.metadata,series_memberships:[membership(77),membership(88),membership(77)]}}
 expect(readingGroups([both],'series').map(([,stories])=>stories)).toEqual([[both],[both]])
 const cards = [77,88].map(id=>story('Same series',{id:`series:${id}`,metadata:{...blankMetadata,title:'Same series',series:['Same series']}}))
 expect(readingGroups(cards,'series').map(([,stories,key])=>[key,stories.map(story=>story.id)])).toEqual([
  ['series:77',['series:77']],['series:88',['series:88']],
 ])
})
