import { describe, expect, it } from 'vitest'
import { authorPageUrl, blankMetadata, initialProgress, nextUnread, parseWorkUrl, validateProgress } from './model'
describe('manual AO3 identity and progress', () => {
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
