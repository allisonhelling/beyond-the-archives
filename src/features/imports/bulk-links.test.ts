import { expect, it } from 'vitest'
import { discoverPastedLinks, eligibleBulkLink, previewBulkLinks } from './bulk-links'
import type { MappingRule } from './site-mapping'

const rule: MappingRule = {
 id: '00000000-0000-4000-8000-000000000001', version: 1, scope: 'matching', example: 'https://fiction.example/story/a',
 prefix: '/story/', field: 'title', selectors: ['h1'], previous: 'A', validation: { when: '2026-11-17', example: 'https://fiction.example/story/a', health: 'Working', current: 'A' },
}
it('separates recognized story patterns and candidates while keeping invalid outcomes visible', () => {
 const links = previewBulkLinks(discoverPastedLinks(`
  https://archiveofourown.org/works/18 https://archiveofourown.org/works/18/chapters/27
  https://archiveofourown.org/series/1 https://archiveofourown.org/users/author
  https://fiction.example/story/a https://fiction.example/story/b https://fiction.example/search
  https://nonfiction.example/story/a https://fiction.example/story/a
  file:///secret javascript:alert(1) http://192.168.1.1/ https://user:pass@fiction.example/story/a
  https://fiction.example/story/a?session=secret
 `), [rule])
 expect(links.map(link => link.kind)).toEqual(['ao3','duplicate','series','unsupported','recognized','recognized','candidate','candidate','duplicate','unsafe','unsafe','unsafe','unsafe','unsafe'])
 expect(links.filter(link => eligibleBulkLink(link, 'recognized'))).toHaveLength(4)
 expect(links.filter(link => eligibleBulkLink(link, 'candidates'))).toHaveLength(6)
})
it('keeps identity-bearing query parameters and requires more than a site-wide mapping', () => {
 const links = previewBulkLinks(['https://fiction.example/?id=a', 'https://fiction.example/?id=b', 'https://FICTION.EXAMPLE:443/?id=a'], [{ ...rule, scope: 'site' }])
 expect(links.map(link => link.kind)).toEqual(['candidate', 'candidate', 'duplicate'])
})
it('recognizes desktop FanFiction.net story candidates and preserves the submitted chapter URL', () => {
 const source = 'https://www.fanfiction.net/s/100/3/Fixture?view=text'
 const links = previewBulkLinks([source, 'https://fanfiction.net/u/100', 'https://fanfiction.net.example/s/100', 'https://archive.example/works/100', 'https://www.wattpad.com/story/100'], [])
 expect(links.map(link => link.kind)).toEqual(['recognized', 'candidate', 'candidate', 'candidate', 'candidate'])
 expect(links[0].candidate).toBe(source)
})
