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
