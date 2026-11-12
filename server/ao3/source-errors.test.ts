// @vitest-environment node
import { expect, it } from 'vitest'
import { parseMetadata, retrieveAo3Document } from './adapter'
import { sourceFailure } from '../../src/lib/source-errors'
import { importError } from '../../src/features/imports/import-error'

it.each([
 [429, 'RATE_LIMITED', true], [401, 'AUTH_REQUIRED', false], [403, 'ACCESS_DENIED', false],
 [404, 'NOT_FOUND', false], [410, 'NOT_FOUND', false], [503, 'NETWORK_ERROR', true],
] as const)('maps HTTP %s to a safe recovery without declaring removal', async (status, code, retryable) => {
 const result = await retrieveAo3Document('https://archiveofourown.org/works/123', () => true,
  async () => new Response('Sanitized failure fixture', { status, headers: { 'retry-after': '7200' } }))
 expect(result).toHaveProperty('metadata', null)
 if (!('category' in result)) throw new Error('Expected a retrieval failure')
 const failure = sourceFailure(result.category, 'capture', 'ao3', result.pauseSeconds)!
 expect(failure).toMatchObject({ code, retryable, evidence: 'unconfirmed' })
 if (status === 429) expect(failure.retryAfterSeconds).toBe(7200)
 const error = importError('Could not retrieve metadata', { code: failure.code })
 expect(error.message).toContain(failure.recovery)
 expect(error.message).not.toContain('Sanitized failure fixture')
})

it('keeps login, missing selectors, empty pages and network failures distinct from removal evidence', async () => {
 for (const html of ['', '<div id="main"><form id="new_user"></form></div>', '<h1>Unexpected page</h1>']) {
  const result = parseMetadata(html, 123, 'https://archiveofourown.org/works/123')
  expect(result.metadata).toBeNull()
  expect(sourceFailure(result.category, 'capture')?.code).not.toBe('CONTENT_REMOVED')
 }
 const result = await retrieveAo3Document('https://archiveofourown.org/works/123', () => true, async () => { throw new Error('Transport failure') })
 expect('category' in result && sourceFailure(result.category, 'capture')?.code).toBe('NETWORK_ERROR')
 expect(sourceFailure('CONTENT_REMOVED', 'capture')).toMatchObject({ evidence: 'unconfirmed', retryable: false })
 for (const category of [null, 'new_category', '__proto__', 'toString', '23505']) expect(sourceFailure(category, 'capture')).toBeNull()
 expect(sourceFailure('RATE_LIMITED', 'capture', 'ao3', NaN)?.retryAfterSeconds).toBe(3600)
 expect(sourceFailure('RATE_LIMITED', 'capture', 'ao3', -1)?.retryAfterSeconds).toBe(3600)
})
