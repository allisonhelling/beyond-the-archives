import { exampleWork } from './display/display-examples'
import { describe, expect, it } from 'vitest'
import { ao3Date, chapterUrl, authorPageUrl, blankMetadata, effectiveMetadata, effectiveWork, initialProgress, nextUnread, parseWorkUrl, progressReadingStatus, validateProgress, type Story, type Work } from './model'
it('keeps display defaults distinct from source observations and preserves private empty fandom overrides', () => {
 const work = { automatic_metadata: {}, verified_chapters: {} } as Work
 expect(effectiveMetadata(work, {}).fandoms).toEqual([])
 expect(Object.hasOwn(work.automatic_metadata as object, 'fandoms')).toBe(false)
 const privateWork = effectiveWork({ ...work, automatic_metadata: { fandoms: ['Shared'] } }, { extension_metadata: { fandoms: ['Private Observation'] }, extension_chapters: {} })
 expect(effectiveMetadata(privateWork, {}).fandoms).toEqual(['Private Observation'])
 expect(effectiveMetadata(privateWork, { fandoms: [] }).fandoms).toEqual([])
 expect(effectiveMetadata(privateWork, { fandoms: ['Manual'] }).fandoms).toEqual(['Manual'])
 expect(privateWork.automatic_metadata).toEqual({ fandoms: ['Private Observation'] })
})
it('projects deleted availability without losing saved work fields or manual corrections', () => {
  const work = { title: 'Source title', summary: 'Saved summary', is_complete: true, published_chapters: 8, automatic_metadata: {} } as Work
  const manual = { title: 'My title', publication_status: 'complete' }
  expect(effectiveMetadata(work, manual, [], [], [], 'deleted')).toMatchObject({ title: 'My title', summary: 'Saved summary', published_chapters: 8, publication_status: 'complete' })
  expect(effectiveMetadata(work, manual, [], [], [], 'available').publication_status).toBe('complete')
  expect(manual.publication_status).toBe('complete')
})
describe('manual AO3 identity and progress', () => {
  it.each([
    ['complete', 0, 'to_read'], ['complete', 1, 'reading'], ['complete', 3, 'finished'],
    ['in_progress', 0, 'to_read'], ['in_progress', 1, 'reading'], ['in_progress', 3, 'waiting_for_updates'],
    ['abandoned', 0, 'to_read'], ['abandoned', 1, 'reading'], ['abandoned', 3, 'finished'],
    ['unknown', 0, 'to_read'], ['unknown', 1, 'reading'], ['unknown', 3, 'reading'],
    ['deleted', 0, 'to_read'], ['deleted', 1, 'reading'], ['deleted', 3, 'finished'],
  ] as const)('maps footer progress to status for %s at chapter %s', (publication_status, progress, expected) => {
    expect(progressReadingStatus(progress, { ...blankMetadata, publication_status, published_chapters: 3 })).toBe(expected)
  })
  it('handles unknown published counts and rejects invalid edits before deriving a status', () => {
    expect(progressReadingStatus(3, blankMetadata)).toBe('reading')
    expect(progressReadingStatus(3, { ...blankMetadata, publication_status: 'complete', total_chapters: 3 })).toBe('finished')
    expect(progressReadingStatus(0, { ...blankMetadata, publication_status: 'complete', published_chapters: 0 })).toBe('to_read')
    for (const invalid of [-1, 1.5, NaN, Infinity, 4]) expect(() => progressReadingStatus(invalid, { ...blankMetadata, published_chapters: 3 })).toThrow()
  })
  it('accepts AO3 author and pseud pages and rejects unrelated or unsafe destinations', () => {
    for (const url of ['https://archiveofourown.org/users/Author', 'https://archiveofourown.org/users/Author/pseuds/PenName', 'https://archiveofourown.org/users/Author/profile', 'https://archiveofourown.org/users/Author/works']) expect(authorPageUrl(` ${url} `)).toBe(url)
    for (const url of [undefined, '', 'javascript:alert(1)', 'https://example.com/users/Author', 'https://archiveofourown.org.evil.test/users/Author', 'https://name@archiveofourown.org/users/Author', 'https://archiveofourown.org/works/123', 'https://archiveofourown.org/users/']) expect(authorPageUrl(url)).toBeNull()
  })
  it('recognizes supported URLs and preserves the exact submission', () => {
    const original = ' https://archiveofourown.org/works/123/chapters/998?view_adult=true#main '
    expect(parseWorkUrl(original)).toEqual({ workId: 123, chapterId: '998', original, normalizedUrl: 'https://archiveofourown.org/works/123' })
    expect(parseWorkUrl('http://www.archiveofourown.org/works/123/').workId).toBe(123)
  })
  it.each(['https://example.com/works/123', 'https://archiveofourown.org.evil.test/works/123', 'https://archiveofourown.org/users/123', 'https://archiveofourown.org/works/0', 'https://archiveofourown.org/works/-1', 'https://name@archiveofourown.org/works/1', 'https://archiveofourown.org:443/works/1', 'javascript:alert(1)', 'https://archiveofourown.org/works/9007199254740992'])('rejects unsupported URL %s', url => expect(() => parseWorkUrl(url)).toThrow())
  it('defaults a work or verified chapter 1 to To Read', () => {
    expect(initialProgress('https://archiveofourown.org/works/123').status).toBe('to_read')
    expect(initialProgress('https://archiveofourown.org/works/123/chapters/999', { 1: '999' })).toEqual({ status: 'to_read', lastRead: 0, chapterVerified: true })
  })
  it('a verified chapter 4 means three chapters read', () => {
    expect(initialProgress('https://archiveofourown.org/works/123/chapters/999', { 4: '999' })).toEqual({ status: 'reading', lastRead: 3, chapterVerified: true })
    expect(nextUnread(3)).toBe(4)
  })
  it('never interprets an unverified chapter ID as its position', () => {
    expect(initialProgress('https://archiveofourown.org/works/123/chapters/4')).toEqual({ status: 'to_read', lastRead: 0, chapterVerified: false })
  })
  it('accepts unknown totals and rejects invalid progress or known bounds', () => {
    expect(blankMetadata.total_chapters).toBeNull()
    expect(validateProgress(18, blankMetadata)).toBe(18)
    for (const invalid of [-1, 2.5, NaN, Infinity]) expect(() => validateProgress(invalid, blankMetadata)).toThrow()
    expect(() => validateProgress(4, { ...blankMetadata, published_chapters: 3 })).toThrow()
    expect(() => validateProgress(4, { ...blankMetadata, total_chapters: 3 })).toThrow()
  })
})

it('only produces next-chapter destinations from trusted mappings', async () => {
  const { chapterUrl } = await import('./model')
  const story = { last_read_chapter: 3, work: { ao3_work_id: 123, verified_chapters: { 4: '900' } } } as unknown as Parameters<typeof chapterUrl>[0]
  expect(chapterUrl(story)).toBe('https://archiveofourown.org/works/123/chapters/900')
  expect(chapterUrl({ ...story, last_read_chapter: 4 })).toBeNull()
  expect(chapterUrl({ ...story, work: { ...story.work, verified_chapters: { 4: 'javascript:alert(1)' } } })).toBeNull()
})

it('keeps an editable URL separate from the original and rejects unsafe saved destinations', async () => {
  const { savedWorkUrl } = await import('./model')
  const story = { original_url: 'https://archiveofourown.org/works/123', work: { ao3_work_id: 123 }, metadata: { manual_url: 'https://archiveofourown.org/works/123/chapters/999' } } as unknown as Parameters<typeof savedWorkUrl>[0]
  expect(savedWorkUrl(story)).toContain('/chapters/999')
  for (const manual_url of ['javascript:alert(1)', 'https://evil.test', 'https://archiveofourown.org/works/456']) expect(savedWorkUrl({ ...story, metadata: { ...story.metadata, manual_url } })).toBe(story.original_url)
})

it('only changed metadata fields become manual overrides', async () => {
  const { changedMetadata, blankMetadata } = await import('./model')
  const automatic = { ...blankMetadata, title: 'Automatic title', authors: ['AO3 author'] }
  expect(changedMetadata(automatic, { ...automatic })).toEqual({})
  expect(changedMetadata(automatic, { ...automatic, title: 'My title' })).toEqual({ title: 'My title' })
})

it('detects one-shots from completion and exact AO3 or personal tags, with manual corrections', async () => {
  const { isOneShot } = await import('./model')
  expect(isOneShot({ ...blankMetadata, publication_status: 'complete', published_chapters: 1 })).toBe(true)
  expect(isOneShot({ ...blankMetadata, publication_status: 'in_progress', published_chapters: 1 })).toBe(false)
  expect(isOneShot({ ...blankMetadata, publication_status: 'complete', published_chapters: 2 })).toBe(false)
  expect(isOneShot({ ...blankMetadata, publication_status: 'complete' })).toBe(false)
  for (const tag of ['One-shot', 'One shot', 'Oneshot', ' ONE-SHOT ']) {
    expect(isOneShot({ ...blankMetadata, ao3_tags: [tag] })).toBe(true)
    expect(isOneShot({ ...blankMetadata, additional_tags: [tag] })).toBe(true)
    expect(isOneShot(blankMetadata, [tag])).toBe(true)
  }
  for (const tag of ['Not a one-shot', 'One-shot collection', 'Multiple oneshots', 'One--shot']) expect(isOneShot(blankMetadata, [tag])).toBe(false)
  expect(isOneShot({ ...blankMetadata, one_shot: true, published_chapters: 6 })).toBe(true)
  expect(isOneShot({ ...blankMetadata, one_shot: false, publication_status: 'complete', published_chapters: 1 }, ['Oneshot'])).toBe(false)
})

it('shows only the AO3 calendar date without converting timezones or inventing unknown dates', () => {
 expect(ao3Date('2026-10-15T00:00:00Z')).toBe('Oct 15, 2026')
 expect(ao3Date('2020-08-09')).toBe('Aug 09, 2020')
 for (const value of [null,undefined,'','invalid','2026-99-99']) expect(ao3Date(value)).toBe('Unknown')
})

it('formats AO3 calendar dates without UTC boundary shifts and rejects impossible dates',()=>{
 expect(ao3Date('2026-01-01T23:59:59-12:00')).toBe('Jan 01, 2026')
 expect(ao3Date('2024-02-29')).toBe('Feb 29, 2024')
 expect(ao3Date('2026-09-03')).toBe('Sep 03, 2026')
 for(const value of ['2026-02-29','2026-04-31']) expect(ao3Date(value)).toBe('Unknown')
})

it('keeps an archived reading destination instead of inventing a live next-chapter URL', async () => {
 const { chapterUrl, savedWorkUrl } = await import('./model')
 const original_url = 'https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/123?view_full_work=true'
 const story = { original_url, metadata: {}, last_read_chapter: 1, work: { ao3_work_id: 123, verified_chapters: { 2: '920' } } } as unknown as Parameters<typeof chapterUrl>[0]
 expect(chapterUrl(story)).toBeNull()
 expect(savedWorkUrl(story)).toBe(original_url)
})

it('opens finished works at chapter one without resetting saved progress',async()=>{
 const {chapterUrl,readChapter,readingUrl}=await import('./model')
 const story={...exampleWork,reading_status:'finished' as const,last_read_chapter:9,original_url:'https://archiveofourown.org/works/123/chapters/999',work:{...exampleWork.work,ao3_work_id:123,verified_chapters:{1:'100',10:'1000'}}}
 expect(readChapter(story)).toBe(1)
 expect(chapterUrl(story)).toBe('https://archiveofourown.org/works/123/chapters/100')
 expect(readingUrl(story)).toBe('https://archiveofourown.org/works/123/chapters/100')
 expect(story.last_read_chapter).toBe(9)
 expect(readChapter({...story,reading_status:'waiting_for_updates'})).toBe(10)
 expect(chapterUrl({...story,reading_status:'waiting_for_updates'})).toBe('https://archiveofourown.org/works/123/chapters/1000')
 expect(readingUrl({...story,work:{...story.work,verified_chapters:{}}})).toBe('https://archiveofourown.org/works/123')
 const archived={...story,original_url:'https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/123/chapters/999'}
 expect(chapterUrl(archived)).toBeNull()
 expect(readingUrl(archived)).toBe(archived.original_url)
})

it('retains rereading during progress corrections until the publication is caught up', () => {
 const metadata = { ...blankMetadata, published_chapters: 3, total_chapters: 3, publication_status: 'complete' as const }
 expect(progressReadingStatus(0, metadata, 're_reading')).toBe('re_reading')
 expect(progressReadingStatus(2, metadata, 're_reading')).toBe('re_reading')
 expect(progressReadingStatus(3, metadata, 're_reading')).toBe('finished')
 for (const publication_status of ['in_progress', 'hiatus'] as const) expect(progressReadingStatus(3, { ...metadata, publication_status }, 're_reading')).toBe('waiting_for_updates')
})
it('does not offer an out-of-range mapped next chapter after the published count changes',()=>{
 const story: Story={...exampleWork,work:{...exampleWork.work,ao3_work_id:123,verified_chapters:{16:'116'}},metadata:{...blankMetadata,published_chapters:15},metadata_overrides:{published_chapters:15},original_url:'https://archiveofourown.org/works/123',reading_status:'reading',last_read_chapter:15}
 expect(chapterUrl(story)).toBeNull()
})
