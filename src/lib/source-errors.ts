/** Presentation adapter only: existing persisted AO3 job categories remain unchanged. */
const sourceErrors = {
 RATE_LIMITED: { retryable: true, recovery: 'Retry after the source pause ends, or enter metadata manually.', retryAfterSeconds: 3600 },
 AUTH_REQUIRED: { retryable: false, recovery: 'Complete sign-in in the source tab, or enter metadata manually.' },
 ACCESS_DENIED: { retryable: false, recovery: 'Check source access in its tab. Keep saved metadata or edit it manually.' },
 NOT_FOUND: { retryable: false, recovery: 'Verify the submitted URL. A missing page does not confirm deletion; keep saved metadata.' },
 CONTENT_REMOVED: { retryable: false, recovery: 'Review the removal evidence before changing the saved work. Preserve reading history.' },
 UNSUPPORTED_SOURCE: { retryable: false, recovery: 'Use a supported AO3 URL for retrieval, or keep metadata entered manually.' },
 UNSUPPORTED_METADATA: { retryable: false, recovery: 'Edit the unavailable fields manually. Leave unknown counts blank.' },
 EXTRACTION_FAILED: { retryable: false, recovery: 'Check the source page and update the companion, or edit metadata manually.' },
 NETWORK_ERROR: { retryable: true, recovery: 'Check your connection and import history before retrying.' },
 CONTRACT_UNSUPPORTED: { retryable: false, recovery: 'Update and reconnect compatible components, or enter metadata manually.' },
} as const
export type SourceErrorCode = keyof typeof sourceErrors
export type SourceFailure = {
 code: SourceErrorCode; operation: string; source?: string; retryable: boolean;
 recovery: string; retryAfterSeconds?: number; evidence: 'unconfirmed';
}
const legacyCodes: Record<string, SourceErrorCode> = {
 rate_limited: 'RATE_LIMITED', restricted: 'AUTH_REQUIRED', blocked: 'ACCESS_DENIED',
 not_found: 'NOT_FOUND', unavailable: 'NOT_FOUND', invalid_identity: 'UNSUPPORTED_SOURCE',
 partial: 'UNSUPPORTED_METADATA', chapter_dates_unavailable: 'UNSUPPORTED_METADATA',
 parser_failure: 'EXTRACTION_FAILED', redirect: 'EXTRACTION_FAILED', changed_identity: 'EXTRACTION_FAILED',
 network_error: 'NETWORK_ERROR', timeout: 'NETWORK_ERROR', temporary_unavailable: 'NETWORK_ERROR',
}
/** No response body, credentials, URL or free-text message is needed to classify a signal.
 * Even CONTENT_REMOVED is unconfirmed here: no current adapter supplies removal proof.
 */
export function sourceFailure(category: string | null | undefined, operation: string, source?: string, pauseSeconds?: number): SourceFailure | null {
 const code = category && (Object.hasOwn(sourceErrors, category) ? category as SourceErrorCode : Object.hasOwn(legacyCodes, category) ? legacyCodes[category] : undefined)
 if (!code) return null
 const definition = sourceErrors[code]
 const pause = typeof pauseSeconds === 'number' && Number.isFinite(pauseSeconds) && pauseSeconds > 0
  ? Math.min(Math.ceil(pauseSeconds), 2147483647) : category === 'blocked' ? 86400 : 'retryAfterSeconds' in definition ? definition.retryAfterSeconds : undefined
 return { code, operation, ...(source && { source }), retryable: definition.retryable, recovery: definition.recovery,
  ...(definition.retryable && pause !== undefined && { retryAfterSeconds: pause }), evidence: 'unconfirmed' }
}
