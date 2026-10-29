import { expect, it } from 'vitest'
import { blankMetadata, type Story } from '../model'
import { librarySeries, seriesInformation, seriesKudosLabel, seriesReadingStatus, seriesMemberships, type SeriesRecord } from './series'
import type { SeriesPreview } from '../../imports/urls'
const url = 'https://archiveofourown.org/series/77'
function story(id: number, series = true): Story { return { id: String(id), work: { ao3_work_id: id }, metadata: { ...blankMetadata, title: `Saved ${id}`, authors: ['Reader author'], fandoms: ['Saved fandom'], series_memberships: series ? [{ id: 77, url, name: 'My series', position: 4 }] : [] } } as unknown as Story }
const preview: SeriesPreview = { seriesId: 77, normalizedUrl: url, title: 'Full series', description: 'Description', creators: ['Creator'], works: [
 { workId: 101, url: 'https://archiveofourown.org/works/101', title: 'First', authors: ['Creator'], fandoms: ['Unsaved fandom'], position: 1, summary: 'First summary', tags: [], wordCount: 3, chapters: '1/1', complete: true },
 { workId: 102, url: 'https://archiveofourown.org/works/102', title: 'Second', authors: ['Creator'], position: 4, summary: '', tags: [], wordCount: 0, chapters: '1/?', complete: false },
] }
function record(metadata = preview) { return { ao3_series_id: metadata.seriesId, metadata, notes: 'Private note' } as unknown as SeriesRecord }
it('combines cached unsaved works with saved work metadata and all fandoms in series order', () => {
 const saved = story(102)
 const result = librarySeries([saved], [record()])
 expect(result).toHaveLength(1)
 expect(result[0]).toMatchObject({ title: 'Full series', creators: ['Creator'], description: 'Description', fandoms: ['Unsaved fandom', 'Saved fandom'], savedStories: [saved], works: [{ workId: 101, position: 1 }, { workId: 102, position: 4, title: 'Saved 102' }] })
 expect(result[0].record?.notes).toBe('Private note')
})
it('shows snapshots for owned works or a personally organized series, including before metadata arrives', () => {
 expect(librarySeries([], [{ ...record(), notes: '' }])).toEqual([])
 expect(librarySeries([], [record()])).toHaveLength(1)
 expect(librarySeries([], [{ ...record(), notes: '', is_favorite: true }])).toHaveLength(1)
 expect(librarySeries([story(102, false)], [record()])).toHaveLength(1)
 expect(librarySeries([story(999, false)], [{ ...record(), notes: '' }])).toEqual([])
})
it('uses membership metadata without a snapshot and rejects unsafe membership destinations', () => {
 expect(librarySeries([story(102)])).toEqual([])
 expect(librarySeries([story(101),story(102)])[0]).toMatchObject({ seriesId: 77, title: 'My series', detailsLoaded: false, savedStories: [story(101),story(102)] })
 expect(librarySeries([story(102),story(102)])).toEqual([])
 const unsafe = story(102); unsafe.metadata.series_memberships![0].url = 'https://evil.example/series/77'
 expect(seriesMemberships(unsafe)).toEqual([])
 expect(librarySeries([unsafe])).toEqual([])
})

it.each([
 [['to_read','to_read'],'to_read'],
 [['reading','to_read'],'reading'],
 [['finished','reading'],'reading'],
 [['finished','finished'],'finished'],
 [['finished','to_read'],'reading'],
 [['re_reading','finished'],'reading'],
 [['waiting_for_updates','to_read'],'reading'],
 [['paused_reading','to_read'],'paused_reading'],
 [['finished','paused_reading'],'paused_reading'],
 [['paused_reading','paused_reading'],'paused_reading'],
 [['reading','paused_reading'],'reading'],
 [['did_not_finish','did_not_finish'],'did_not_finish'],
] as const)('derives series reading status from contained works: %j → %s', (states,expected) => {
 const stories = states.map((status,index) => ({...story(101+index),reading_status:status}))
 const series = librarySeries(stories,[record()])[0]
 expect(seriesReadingStatus(series)).toBe(expected)
})
it('ignores unsaved previews and recalculates a finished series when another work is added', () => {
 const series = librarySeries([{...story(101),reading_status:'finished'}],[{...record(),reading_status:'finished'}])[0]
 expect(seriesReadingStatus(series)).toBe('finished')
 expect(seriesReadingStatus({...series,savedStories:[]})).toBe('finished')
 expect(seriesReadingStatus({...series,savedStories:[],record:undefined})).toBe('to_read')
 for (const status of ['to_read', 'reading', 'finished'] as const) {
  const updated = librarySeries([...series.savedStories,{...story(102),reading_status:status}],[series.record!])[0]
  expect(seriesReadingStatus(updated)).toBe(status === 'finished' ? 'finished' : 'reading')
 }
 expect(seriesReadingStatus({...series,savedStories:[{...story(102),reading_status:'to_read'}]})).toBe('to_read')
})

it('keeps identity-only series basic and derives word totals from saved works', () => {
 const saved = story(102); saved.metadata.word_count = 123
 const basic = record({ ...preview, basic: true, description: '', works: [] })
 expect(librarySeries([saved], [basic])[0]).toMatchObject({ detailsLoaded: false, wordCount: 123, works: [{ workId: 102 }] })
 saved.metadata.word_count = null
 expect(librarySeries([saved], [basic])[0].wordCount).toBeNull()
})
it('keeps explicitly downloaded series visible even without library works', () => {
 expect(librarySeries([], [{ ...record({ ...preview, basic: false }), notes: '' }])[0]).toMatchObject({ detailsLoaded: true, savedStories: [], works: preview.works })
})

it('keeps same-named works and series distinct by their AO3 IDs', () => {
 const first = story(101), second = story(102)
 for (const saved of [first,second]) saved.metadata.title = 'Same fic title'
 first.metadata.series_memberships = [{id:77,name:'Same series title',url,position:1}]
 second.metadata.series_memberships = [{id:88,name:'Same series title',url:'https://archiveofourown.org/series/88',position:1}]
 expect(librarySeries([first,second])).toEqual([])
 const separate = librarySeries([first,second], [record({...preview,title:'Same series title',works:[]}),record({...preview,seriesId:88,title:'Same series title',works:[]})])
 expect(separate.map(series => [series.seriesId,series.title,series.works.map(work=>work.workId)])).toEqual([
  [77,'Same series title',[101]], [88,'Same series title',[102]],
 ])
 second.metadata.series_memberships = [{id:77,name:'Same series title',url,position:2}]
 const shared = librarySeries([first,second])
 expect(shared).toHaveLength(1)
 expect(shared[0].works.map(work=>[work.workId,work.title])).toEqual([[101,'Same fic title'],[102,'Same fic title']])
})


it('unions series tags and warnings and totals known kudos once per work', () => {
 const saved = story(102)
 saved.metadata = { ...saved.metadata, relationship_tags: ['Alex/Morgan'], character_tags: ['Alex'], additional_tags: ['Adventure'], archive_warnings: ['Graphic Depictions Of Violence'], kudos: 0 }
 saved.personal_rating = 4
 const snapshot = { ...preview, works: preview.works.map(work => ({ ...work, relationshipTags: ['Alex/Morgan'], characterTags: ['Morgan'], additionalTags: ['Adventure', 'Magic'], archiveWarnings: ['No Archive Warnings Apply'], kudos: 12 })) }
 const series = librarySeries([saved], [record(snapshot)])[0]
 const info = seriesInformation(series)
 expect(info).toMatchObject({ relationships: ['Alex/Morgan'], characters: ['Morgan', 'Alex'], tags: ['Adventure', 'Magic'], warnings: ['No Archive Warnings Apply', 'Graphic Depictions Of Violence'], kudos: 12, kudosKnown: 2, worksKnown: 2, personalRating: 4, ratedWorks: 1 })
 expect(seriesKudosLabel(info)).toBe('12 kudos')
 delete series.works[0].kudos
 expect(seriesKudosLabel(seriesInformation(series))).toBe('0 kudos (1 of 2 works known)')
})
