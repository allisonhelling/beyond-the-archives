import { expect, it } from 'vitest'
import { exportMappings, importMappings, makeSiteRequest, mappingMatches, normalizedField, readMapping, readObservations, readSiteDraft, readSiteRequest, readSiteResult, sourcePage, type MappingRule } from './site-mapping'

const example = 'https://fiction.example/stories/alpha?edition=2'
const rule: MappingRule = {
 id: '00000000-0000-4000-8000-000000000001', version: 1, scope: 'matching', prefix: '/stories/',
 example, field: 'title', selectors: ['h1[itemprop="headline"]', '#work-title'], previous: 'Private Title',
 validation: { when: '2026-11-17T12:00:00Z', example, health: 'Working', current: 'Current Private Title' },
}
it('binds companion requests to account, source origin, expiry, and matching result', () => {
 const request = makeSiteRequest('account-a', example, 'teach', crypto.randomUUID(), 'authors')
 expect(readSiteRequest({ ...request, origin: 'https://wrong.example' })).toBeNull()
 expect(readSiteRequest({ ...request, field: 'constructor' })).toBeNull()
 expect(readSiteRequest(request, request.expiresAt)).toBeNull()
 expect(readSiteResult({ ...request, account: 'account-b', code: 'OK', tabId: 1 }, request)).toBeNull()
 expect(readSiteResult({ ...request, code: 'OK', tabId: 1 }, request)?.code).toBe('OK')
 for (const url of ['http://127.0.0.1:8080', 'https://user:secret@fiction.example', 'https://fiction.example/?access_token=sensitive', 'https://archiveofourown.org/works/4']) {
  expect(sourcePage(url)).toBeNull()
 }
})
it('keeps matching rules within an explicit path segment and origin', () => {
 expect(readMapping(rule)).toEqual(rule)
 expect(mappingMatches(rule, 'https://fiction.example/stories/beta')).toBe(true)
 expect(mappingMatches(rule, 'https://fiction.example/stories-old/beta')).toBe(false)
 expect(mappingMatches(rule, 'https://other.example/stories/beta')).toBe(false)
 expect(readMapping({ ...rule, prefix: '/' })).toBeNull()
 expect(readMapping({ ...rule, selectors: ['title['] })).toBeNull()
 expect(readMapping({ ...rule, selectors: ['body > textarea'] })).toBeNull()
})
it('ignores recognized tracking keys for exact mappings while preserving story identity', () => {
 const exact = { ...rule, scope: 'exact' as const }
 expect(mappingMatches(exact, example + '&utm_source=feed')).toBe(true)
 expect(mappingMatches(exact, example.replace('=2', '=3'))).toBe(false)
})
it('round-trips portable rules without extracted text or automatically confirmed status', () => {
 const json = exportMappings([rule])
 expect(json).not.toContain('Private Title')
 expect(importMappings(json)).toEqual([expect.objectContaining({ scope: 'matching', selectors: rule.selectors, previous: '', validation: expect.objectContaining({ health: 'Needs Review', current: '' }) })])
 expect(importMappings(json)[0].id).not.toBe(rule.id)
 expect(() => importMappings(json.replace('"version": 1', '"version": 2'))).toThrow('version 1')
})
it('keeps independent drafts and accepts only bounded observation fields', () => {
 const draft = readSiteDraft({ story: { fields: { title: 'Corrected', secret: 'do not retain' }, notes: 'private', changedFields: ['title'], status: 'reading' }, mapping: { field: 'title', selectors: ['h1', 'script['] } })
 expect(draft).toMatchObject({ story: { fields: { title: 'Corrected' }, notes: 'private' }, mapping: { field: 'title', selectors: ['h1'] } })
 expect(readObservations({ title: { text: 'Real title', via: 'Page Element', html: '<b>' }, notes: { text: 'private', via: 'Page Element' } })).toEqual({ title: { text: 'Real title', via: 'Page Element' } })
 expect(normalizedField('published_chapters', '12/30')).toBe('12')
 expect(normalizedField('total_chapters', '12/30')).toBe('30')
 expect(normalizedField('published_chapters', '100001')).toBe('')
})
