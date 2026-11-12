import { expect, it } from 'vitest'
import { readCompanionPage, hasMetadataRetrievalCapability, validCapabilityRequest, validLibrarySyncReply } from './companion-contract'

it('accepts the known legacy handshake and correlates revision 1 without enabling future capabilities', () => {
 expect(validCapabilityRequest({ type: 'AO3_LIBRARY_CAPABILITIES' })).toBe(true)
 expect(validCapabilityRequest({ type: 'AO3_LIBRARY_CAPABILITIES', contractVersion: 1, requestId: 'request-a', future: true })).toBe(true)
 expect(hasMetadataRetrievalCapability({ ok: true, capabilities: ['metadata-retrieval-v1'] }, 'request-a')).toBe(true)
 expect(hasMetadataRetrievalCapability({ ok: true, contractVersion: 1, requestId: 'request-a', capabilities: ['future-v2', 'metadata-retrieval-v1'], future: true }, 'request-a')).toBe(true)
 for (const value of [undefined, null, {}, { ok: true, capabilities: 'metadata-retrieval-v1' },
  { ok: true, capabilities: ['generic-site-extraction-v1', 'visual-mapping-v1'] },
  { ok: true, capabilities: ['metadata-retrieval-v1', 1] },
  { ok: true, contractVersion: 2, capabilities: ['metadata-retrieval-v1'] },
  { ok: true, contractVersion: 1, requestId: 'account-b-request', capabilities: ['metadata-retrieval-v1'] },
 ]) expect(hasMetadataRetrievalCapability(value, 'request-a')).toBe(false)
 for (const request of [{}, { type: 'AO3_LIBRARY_CAPABILITIES', contractVersion: 2, requestId: 'request-a' },
  { type: 'AO3_LIBRARY_CAPABILITIES', contractVersion: 1 }, { type: 'AO3_LIBRARY_CAPABILITIES', contractVersion: 1, requestId: '' },
 ]) expect(validCapabilityRequest(request)).toBe(false)
})

it('rejects missing scan fields and unknown status enums while tolerating optional extensions', () => {
 const state = { id: 'scan-a', status: 'paused', url: 'https://archiveofourown.org/users/Fixture/works', mode: 'full', pages: 1, count: 3, skipped: 0, error: '' }
 expect(validLibrarySyncReply({ ok: true, state: { ...state, future: true } })).toBe(true)
 expect(validLibrarySyncReply({ ok: true, state: null })).toBe(true)
 expect(validLibrarySyncReply({ ok: true, rows: [{ title: 'Fixture' }] })).toBe(true)
 for (const value of [{ ok: true }, { ok: true, state: {} }, { ok: true, state: { ...state, status: 'future-status' } },
  { ok: true, state: { ...state, pages: -1 } }, { ok: true, rows: [null] }, { ok: true, rows: [{ title: 1 }] },
 ]) expect(validLibrarySyncReply(value)).toBe(false)
})

it('validates capture shape, source identity and archive timestamp before accepting content', () => {
 const url = 'https://archiveofourown.org/works/123', html = '<h2>Sanitized fixture</h2>'
 expect(readCompanionPage({ url, html, future: true }, url, 'work')).toEqual({ url, html })
 expect(readCompanionPage({ url: `${url}/chapters/456`, html }, url, 'work')).not.toBeNull()
 for (const page of [null, {}, { url, html: [] }, { url, html: '' }, { url, html: 'x'.repeat(4_000_001) },
  { url: 'https://evil.example/works/123', html }, { url: 'https://archiveofourown.org/works/456', html },
  { url: 'https://archiveofourown.org/users/login', html },
 ]) expect(readCompanionPage(page, url, 'work')).toBeNull()
 const archive = `https://web.archive.org/web/20260101000000/${url}`
 expect(readCompanionPage({ url: archive, html }, archive, 'work')).not.toBeNull()
 expect(readCompanionPage({ url, html }, archive, 'work')).toBeNull()
 expect(readCompanionPage({ url: archive, html }, url, 'work')).toBeNull()
 expect(readCompanionPage({ url: archive.replace('20260101', '20260102'), html }, archive, 'work')).toBeNull()
 const series = 'https://archiveofourown.org/series/77'
 expect(readCompanionPage({ url: `${series}?page=2`, html }, series, 'series')).not.toBeNull()
 expect(readCompanionPage({ url: `${series}8`, html }, series, 'series')).toBeNull()
})
