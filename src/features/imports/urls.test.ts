import { describe, expect, it } from 'vitest'
import { classifyUrl, extractUrls, groupWorks, parseWorkUrl } from './urls'
describe('AO3 identities', () => {
  it.each(['https://archiveofourown.org/works/123', 'http://www.archiveofourown.org/works/123/', 'https://archiveofourown.org/works/123?view_full_work=true#main', 'https://archiveofourown.org/collections/test/works/123'])('normalizes %s without verifying a destination', url => {
    expect(parseWorkUrl(url)).toMatchObject({ workId: 123, normalizedUrl: 'https://archiveofourown.org/works/123', original: url })
  })
  it('preserves meaningful punctuation in valid query parameters and fragments', () => {
    const original = 'https://archiveofourown.org/works/123?context=a,b.#end!'
    expect(extractUrls(original)).toEqual([original])
  })
  it('preserves exact originals and unverified chapter identifiers', () => {
    const original = ' https://archiveofourown.org/works/123/chapters/999?x=1#end '
    expect(parseWorkUrl(original)).toMatchObject({ chapterId: '999', original })
    expect(groupWorks([original, 'https://archiveofourown.org/works/123/chapters/2']).get(123)).toHaveLength(2)
  })
  it.each(['https://archiveofourown.org/works/0', 'https://archiveofourown.org/works/9007199254740992', 'https://archiveofourown.org/works/12/chapters/0', 'https://archiveofourown.org/works/12/chapters/no', 'https://user@archiveofourown.org/works/1', 'https://archiveofourown.org:123/works/1'])('rejects malformed work links %s', url => expect(() => parseWorkUrl(url)).toThrow())
  it('distinguishes unsupported AO3 links from unrelated URLs', () => {
    expect(classifyUrl('https://archiveofourown.org/users/test').kind).toBe('unsupported')
    for (const url of ['https://example.com/works/1', 'https://archiveofourown.org.evil.test/works/1']) expect(classifyUrl(url).kind).toBe('unrelated')
    expect(classifyUrl('https://archiveofourown.org/works/1/chapters/bad').kind).toBe('invalid')
  })
  it('extracts 100+ pasted links and groups URL variants without inventing chapter positions', () => {
    const urls = extractUrls(Array.from({ length: 110 }, (_, i) => `<https://archiveofourown.org/works/${i + 1}>`).join('\n') + ' and (https://archiveofourown.org/works/1/chapters/600). https://example.com')
    expect(urls).toHaveLength(112)
    expect(groupWorks(urls).size).toBe(110)
  })
})

it('recognizes and normalizes series while rejecting malformed identities and lookalike hosts', async () => {
 const { parseSeriesUrl } = await import('./urls')
 expect(classifyUrl('http://www.archiveofourown.org/series/77/?x=1#end')).toEqual({ kind: 'series', identity: { seriesId: 77, normalizedUrl: 'https://archiveofourown.org/series/77' } })
 for (const url of ['https://archiveofourown.org/series/0', 'https://archiveofourown.org/series/9007199254740992', 'https://user@archiveofourown.org/series/77', 'https://archiveofourown.org.evil.test/series/77']) expect(() => parseSeriesUrl(url)).toThrow()
})
it('expands only selected series works, deduplicating overlaps without losing chapter links', async () => {
 const { selectedImportText } = await import('./urls')
 expect(selectedImportText('https://archiveofourown.org/series/77\nhttps://archiveofourown.org/works/101/chapters/999', [{ workId: 101, url: 'https://archiveofourown.org/works/101' }, { workId: 102, url: 'https://archiveofourown.org/works/102' }, { workId: 102, url: 'https://archiveofourown.org/works/102' }] as never)).toBe('https://archiveofourown.org/works/101/chapters/999\nhttps://archiveofourown.org/works/102')
})

it('waits for both URL processing and metadata jobs before reporting a finished batch', async () => {
 const { importFinished } = await import('./urls')
 expect(importFinished({ items: [] })).toBe(false)
 expect(importFinished({ items: [{ status: 'completed', metadata_status: 'pending' }] })).toBe(false)
 expect(importFinished({ items: [{ status: 'completed', metadata_status: 'completed' }], jobs: [{ status: 'processing' }] })).toBe(false)
 expect(importFinished({ items: [{ status: 'completed', metadata_status: 'completed' }, { status: 'failed' }], jobs: [{ status: 'failed' }] })).toBe(true)
})

it('accepts fixed Wayback AO3 snapshots while preserving snapshot and chapter identities', () => {
 const url = 'https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/17199254?view_full_work=true'
 expect(parseWorkUrl(url)).toEqual({ workId: 17199254, chapterId: null, original: url, normalizedUrl: 'https://archiveofourown.org/works/17199254', archiveUrl: url })
 expect(classifyUrl(url).kind).toBe('valid')
 expect(extractUrls(`Import <${url}> and https://archiveofourown.org/works/17199254`)).toHaveLength(2)
 expect(groupWorks([url, 'https://archiveofourown.org/works/17199254']).size).toBe(1)
 expect(parseWorkUrl('https://web.archive.org/web/20251007001146id_/http://www.archiveofourown.org/works/123/chapters/456')).toMatchObject({ workId: 123, chapterId: '456' })
})
it.each([
 'https://web.archive.org.evil.test/web/20251007001146/https://archiveofourown.org/works/123',
 'https://web.archive.org/web/20251007001146/https://evil.test/works/123',
 'https://web.archive.org/web/20251007001146/https://archiveofourown.org.evil.test/works/123',
 'https://web.archive.org/web/20251007001146/https://user@archiveofourown.org/works/123',
 'https://web.archive.org/web/20251007001146/https://archiveofourown.org:444/works/123',
 'https://web.archive.org/web/*/https://archiveofourown.org/works/123',
 'https://web.archive.org/web/2025/https://archiveofourown.org/works/123',
 'https://web.archive.org/web/20251007001146/https://archiveofourown.org/series/123',
])('rejects unsupported or unsafe archived work URLs: %s', url => expect(() => parseWorkUrl(url)).toThrow())
