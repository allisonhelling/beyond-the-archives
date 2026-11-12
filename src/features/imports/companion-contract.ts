import { parseSeriesUrl, parseWorkUrl, waybackSnapshot } from './urls.ts'

/** Optional handshake revision; independent of extension release and feature support. */
export const companionContractVersion = 1
export const metadataRetrievalCapability = 'metadata-retrieval-v1'
export type CapabilityRequest = { type: 'AO3_LIBRARY_CAPABILITIES' } & (
 { contractVersion?: undefined; requestId?: string } | { contractVersion: 1; requestId: string }
)
export type CapabilityReply = { ok: true; contractVersion?: 1; requestId?: string; capabilities: string[] }
export function validCapabilityRequest(value: unknown): value is CapabilityRequest {
 if (!value || typeof value !== 'object') return false
 const request = value as Record<string, unknown>
 const validId = request.requestId === undefined || typeof request.requestId === 'string' && request.requestId.length > 0 && request.requestId.length <= 128
 return validId && request.type === 'AO3_LIBRARY_CAPABILITIES' && (request.contractVersion === undefined
  || request.contractVersion === companionContractVersion && typeof request.requestId === 'string' && request.requestId.length > 0 && request.requestId.length <= 128)
}
export function hasMetadataRetrievalCapability(reply: unknown, requestId?: string): reply is CapabilityReply {
 if (!reply || typeof reply !== 'object') return false
 const value = reply as Record<string, unknown>
 return value.ok === true && (value.contractVersion === undefined || value.contractVersion === companionContractVersion)
  && (value.contractVersion === undefined || requestId === undefined || value.requestId === requestId)
  && Array.isArray(value.capabilities) && value.capabilities.every(capability => typeof capability === 'string')
  && value.capabilities.includes(metadataRetrievalCapability)
}

/** Keep legacy optional scan extensions readable; validate the core before rendering. */
export function validLibrarySyncReply(value: unknown): boolean {
 if (!value || typeof value !== 'object') return false
 const reply = value as Record<string, unknown>
 if (reply.ok !== true || reply.contractVersion !== undefined && reply.contractVersion !== companionContractVersion) return false
 if (reply.rows !== undefined && (!Array.isArray(reply.rows) || !reply.rows.every(row => row && typeof row === 'object' && !Array.isArray(row) && Object.values(row).every(cell => typeof cell === 'string')))) return false
 if (reply.state === null) return true
 if (reply.state === undefined) return reply.rows !== undefined
 if (typeof reply.state !== 'object') return false
 const state = reply.state as Record<string, unknown>
 return typeof state.id === 'string' && state.id.length > 0
  && ['running', 'paused', 'ready', 'complete', 'discarded'].includes(String(state.status))
  && ['url', 'mode', 'error'].every(key => typeof state[key] === 'string')
  && ['pages', 'count', 'skipped'].every(key => Number.isSafeInteger(state[key]) && Number(state[key]) >= 0)
}

/** Validate captured data before parsing; URL identity is still checked again server-side. */
export function readCompanionPage(value: unknown, requestedUrl: string, kind: 'work' | 'series'): { url: string; html: string } | null {
 if (!value || typeof value !== 'object') return null
 const page = value as Record<string, unknown>
 if (typeof page.url !== 'string' || typeof page.html !== 'string' || !page.html.trim() || page.html.length > 4_000_000) return null
 try {
  if (kind === 'series') {
   if (new URL(page.url).origin !== 'https://archiveofourown.org' || parseSeriesUrl(page.url).seriesId !== parseSeriesUrl(requestedUrl).seriesId) return null
  } else {
   const expected = parseWorkUrl(requestedUrl), actual = parseWorkUrl(page.url)
   if (expected.workId !== actual.workId) return null
   if (expected.archiveUrl ? waybackSnapshot(expected.archiveUrl)?.timestamp !== waybackSnapshot(actual.archiveUrl ?? '')?.timestamp
    : new URL(page.url).origin !== 'https://archiveofourown.org') return null
  }
  return { url: page.url, html: page.html }
 } catch { return null }
}
