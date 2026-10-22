import { expect, it } from 'vitest'
import { parseCsv, readAo3Csv, scraperDate, uniqueCsvWorks } from './ao3-csv'
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
