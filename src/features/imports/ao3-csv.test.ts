import { expect, it } from 'vitest'
import { bookmarkConflicts, csvBookmark, csvMetadata, nonemptyMetadata, parseCsv, readAo3Csv, readAo3Rows, scraperDate, uniqueCsvWorks, type CsvWork } from './ao3-csv'
const csv = (source = 'bookmarks') => '\ufeffsource_list,title,link,author,fandoms,category,relationships,characters,freeforms,rating,warnings,date,words,chapters,summary,bookmark date,bookmark tags,bookmark notes\r\n' + `${source},"Title, with comma",https://archiveofourown.org/works/123,Author,Fandom,Gen,A/B,A,Adventure,General Audiences,No Archive Warnings Apply,01 Oct 2026,"1,234",2/3,"Line one\nLine two",20 Oct 2026,"Mine, Favorite","Saved ""summary""\nMore notes"\r\n`
it('reads scraper CSVs with multiline summaries, notes, escaped quotes, dates and counts', () => {
 expect(readAo3Csv(csv())[0]).toMatchObject({ source: 'bookmarks', workId: 123, bookmarkDate: '2026-10-20', updatedDate: '2026-10-01', notes: 'Saved "summary"\nMore notes', tags: ['Mine', 'Favorite'], metadata: { title: 'Title, with comma', summary: 'Line one\nLine two', authors: ['Author'], word_count: 1234, published_chapters: 2, total_chapters: 3, is_complete: false, relationship_tags: ['A/B'] } })
})
it('detects legacy bookmark and Later files and honors source_list in combined exports', () => {
 expect(readAo3Csv(csv().replace('source_list,', '').replace('bookmarks,', ''))[0].source).toBe('bookmarks')
 expect(readAo3Csv('title,link,summary\nTitle,https://archiveofourown.org/works/456,Summary')[0]).toMatchObject({ source: 'marked_for_later', workId: 456, bookmarkDate: null })
 expect(readAo3Csv(csv('marked_for_later'))[0]).toMatchObject({ source: 'marked_for_later', bookmarkDate: null })
})
it('keeps series identities for expansion and deduplicates work identities with bookmarks taking priority', () => {
 expect(readAo3Csv(csv().replace('/works/123', '/series/123'))[0]).toMatchObject({ seriesId: 123 })
 const bookmark = { ...readAo3Csv(csv())[0], workId: 123 }, later = { ...bookmark, source: 'marked_for_later' as const }
 expect(uniqueCsvWorks([later, bookmark, later])).toEqual([bookmark])
})
it('rejects malformed CSV, invalid dates and unsupported or lookalike links', () => {
 for (const text of ['title,link\n"unfinished', 'title,link\nTitle,link,extra', 'title,title,link\nA,B,C', 'title,link\nBad"quote,link']) expect(() => parseCsv(text)).toThrow()
 expect(() => readAo3Csv(csv().replace('archiveofourown.org', 'archiveofourown.org.evil.test'))).toThrow('unsupported AO3 link')
 expect(() => scraperDate('31 Feb 2026')).toThrow()
 expect(scraperDate('2026-10-20')).toBe('2026-10-20')
})

it('retains zero statistics and false while excluding empty observations', () => {
 expect(csvMetadata({ title: 'Work', kudos: '0', bookmarks: '1,234', comments: '0', hits: '9,999', chapters: '2/?' })).toMatchObject({ kudos: 0, bookmark_count: 1234, comment_count: 0, hits: 9999, is_complete: false })
 expect(nonemptyMetadata({ summary: '  ', authors: [], kudos: 0, is_complete: false, title: 'Work' })).toEqual({ kudos: 0, is_complete: false, title: 'Work' })
})
it('reports only personal bookmark differences, ignoring AO3 title, summary and counts', () => {
 const work = { ...readAo3Csv(csv())[0], workId: 123 }
 const existing = { workId: 123, id: 'entry', version: 'v1', title: 'Older AO3 title', status: 'finished', progress: 2, notes: work.notes, tags: [...work.tags].reverse(), finishedAt: '2026-10-20T00:00:00Z' }
 expect(bookmarkConflicts([work], [existing])).toEqual([])
 for (const change of [{ notes: 'Personal edit' }, { tags: ['Other'] }, { progress: 1 }, { status: 'reading' }, { finishedAt: null }]) {
  expect(bookmarkConflicts([work], [{ ...existing, ...change }])).toHaveLength(1)
 }
 expect(bookmarkConflicts([{ ...work, source: 'marked_for_later' }], [{ ...existing, notes: 'Other' }])).toEqual([])
})

it('retains deleted bookmark identities without inventing work metadata', () => {
 const rows = readAo3Csv('source_list,work_status,title,link,bookmark id,bookmark status,bookmark notes,bookmark tags\nbookmarks,deleted,,https://archiveofourown.org/bookmarks/123456,123456,private,Loved chapter 8!,Favorites')
 expect(rows[0]).toMatchObject({ workId: null, workStatus: 'deleted', bookmarkId: 123456, bookmarkStatus: 'private', metadata: {}, notes: 'Loved chapter 8!', tags: ['Favorites'] })
 expect(uniqueCsvWorks([{ ...rows[0], workId: null }, { ...rows[0], workId: null, bookmarkId: 123457 }])).toHaveLength(2)
 expect(() => readAo3Csv('source_list,work_status,title,link\nbookmarks,deleted,,https://archiveofourown.org/bookmarks/123456')).toThrow()
})
it('keeps all bookmark observations through conversion without turning blank work fields into metadata', () => {
 const work = readAo3Rows([{ source_list: 'bookmarks', work_status: 'deleted', title: '', summary: '', author: '', fandoms: '', words: '', chapters: '',
  link: 'https://archiveofourown.org/bookmarks/123456', 'bookmark id': '123456', 'bookmark url': 'https://archiveofourown.org/bookmarks/123456',
  'bookmark status': 'private rec', 'bookmark date': '20 Oct 2026', 'bookmark user': 'alice', 'bookmark count': '0',
  'bookmark notes': 'First note\nSecond\nThird', 'bookmark tags': 'Favorites, To Reread' }])[0] as CsvWork
 expect(work.metadata).toEqual({})
 expect(csvBookmark(work)).toEqual({ id: '123456', url: 'https://archiveofourown.org/bookmarks/123456', status: 'private rec', date: '2026-10-20', user: 'alice', count: 0, rec: true, notes: 'First note\nSecond\nThird', tags: ['Favorites', 'To Reread'] })
})
it.each([['true', true], ['false', false], ['unknown', null], ['', null]] as const)('retains the explicit bookmark Rec value %s independently from Favorites', (value, expected) => {
 const work = readAo3Rows([{ source_list: 'bookmarks', title: 'Work', link: 'https://archiveofourown.org/works/42', 'bookmark id': '5', 'bookmark status': 'public', 'bookmark rec': value }])[0] as CsvWork
 expect(work.bookmarkRec).toBe(expected)
 expect(csvBookmark(work).rec).toBe(expected)
})
it('can read legacy Rec symbols but rejects invented Rec values', () => {
 for (const [status, expected] of [['rec', true], ['public', false], ['private', null], ['hidden', null]] as const) expect(readAo3Rows([{ title: 'Work', link: 'https://archiveofourown.org/works/42', source_list: 'bookmarks', 'bookmark status': status }])[0].bookmarkRec).toBe(expected)
 expect(() => readAo3Rows([{ title: 'Work', link: 'https://archiveofourown.org/works/42', 'bookmark rec': 'probably' }])).toThrow('invalid bookmark rec')
})

it('uses the verified chapter prefix before the bookmark day for scan and sample imports', async () => {
 const { bookmarkReadingState } = await import('./ao3-csv')
 const work = readAo3Rows([{ source_list: 'bookmarks', title: 'Chapter dates', link: 'https://archiveofourown.org/works/1', chapters: '3/3', date: '2026-10-20', 'bookmark date': '2026-10-10', 'chapter dates': JSON.stringify({ '1': '2026-09-01', '2': '2026-10-01', '3': '2026-10-10' }) }])[0] as import('./ao3-csv').CsvWork
 expect(bookmarkReadingState(work)).toMatchObject({ status: 'reading', progress: 2 })
 expect(bookmarkReadingState({ ...work, importReadingStatus: 'reading' })).toMatchObject({ status: 'reading', progress: 2 })
 expect(bookmarkReadingState({ ...work, importReadingStatus: 'paused_reading' })).toMatchObject({ status: 'paused_reading', progress: 0 })
 expect(bookmarkReadingState({ ...work, bookmarkDate: null })).toMatchObject({ progress: 0 })
 expect(() => readAo3Rows([{ source_list: 'bookmarks', title: 'Bad dates', link: work.url, chapters: '3/3', 'chapter dates': '{"1":"2026-02-31"}' }])).toThrow('invalid chapter dates')
})

it('preserves formatted listing summaries alongside their plain searchable text', () => {
 expect(csvMetadata({ title: 'Work', summary: 'Legacy summary', summary_html: '<p>An <em>italic</em> summary.</p>' })).toMatchObject({ summary: 'An italic summary.', summary_html: '<p>An <em>italic</em> summary.</p>' })
})
