import { expect, it } from 'vitest'
import { blankMetadata, type Story } from './model'
import { librarySeries, seriesReadingStatus, seriesMemberships, type SeriesRecord } from './series'
import type { SeriesPreview } from '../imports/urls'
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
 expect(librarySeries([story(102)])[0]).toMatchObject({ seriesId: 77, title: 'My series', detailsLoaded: false, savedStories: [story(102)] })
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
