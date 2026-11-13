import { parseWorkUrl, waybackSnapshot } from '../imports/urls'
import type { Metadata, Story } from './model'

/** A source key is separate from work UUID, private entry UUID and EPUB hash. */
export type SourceIdentity =
 | { kind: 'native'; platform: string; nativeWorkId: string }
 | { kind: 'url'; origin: string; normalizedUrl: string }
export type SourceLocation = { originalUrl: string; normalizedUrl: string; identity: SourceIdentity }
export type FieldObservation<T> = {
 value: T; source: 'unknown' | 'ao3' | 'browser' | 'archive' | 'manual' | 'private_availability';
 confirmation: 'unknown' | 'observed' | 'user_asserted'; observedAt: string | null; manualOverride: boolean;
}
export type StorySourceVersion = {
 contractVersion: 1;
 // The current one-source entry serves both roles. Linking is a later additive feature.
 storyId: string; sourceVersionId: string; workId: string; ownerId: string;
 identity: SourceIdentity | null; originalUrl: string; normalizedUrl: string | null;
 canonicalUrl: string | null; canonicalVerifiedAt: string | null;
 publishedChapters: FieldObservation<number | null>;
 publicationStatus: FieldObservation<Metadata['publication_status']>;
 progress: { status: Story['reading_status']; chaptersRead: number };
}

export function nativeSourceIdentity(platform: string, nativeWorkId: string): SourceIdentity {
 if (typeof platform !== 'string' || typeof nativeWorkId !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(platform) || !nativeWorkId || nativeWorkId.length > 1000 || /[\p{Cc}\p{White_Space}]/u.test(nativeWorkId)) throw new Error('Invalid source identity.')
 if (platform === 'ao3' && (!/^[1-9]\d*$/.test(nativeWorkId) || !Number.isSafeInteger(Number(nativeWorkId)))) throw new Error('Invalid AO3 work identity.')
 return { kind: 'native', platform, nativeWorkId }
}
export function sourceIdentityKey(identity: SourceIdentity): string {
 return identity.kind === 'native' ? JSON.stringify(['native', identity.platform, identity.nativeWorkId]) : JSON.stringify(['url', identity.origin, identity.normalizedUrl])
}

/** Candidate normalization only. This grants neither fetching permission nor canonical authority.
 * Unknown sites retain query, fragment, path case and trailing slash: their identity rules are unknown.
 */
export function sourceLocation(originalUrl: string): SourceLocation {
 if (typeof originalUrl !== 'string' || originalUrl.length > 8192 || /\p{Cc}/u.test(originalUrl)) throw new Error('Enter a valid public story URL.')
 let url: URL
 try { url = new URL(originalUrl.trim()) } catch { throw new Error('Enter a valid public story URL.') }
 if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')
  || /^(?:\d+\.){3}\d+$/.test(url.hostname) || url.hostname.startsWith('[')
  || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)) throw new Error('Enter a valid public story URL without credentials or local addresses.')
 if (['archiveofourown.org', 'www.archiveofourown.org', 'web.archive.org'].includes(url.hostname)) {
  const identity = parseWorkUrl(originalUrl)
  return { originalUrl, normalizedUrl: identity.normalizedUrl, identity: nativeSourceIdentity('ao3', String(identity.workId)) }
 }
 return { originalUrl, normalizedUrl: url.href, identity: { kind: 'url', origin: url.origin, normalizedUrl: url.href } }
}

function record(value: unknown): Record<string, unknown> {
 return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function timestamp(value: unknown): string | null {
 return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}

/** Read existing protected layers; user-supplied JSON cannot declare itself verified AO3 evidence. */
function observation<T>(story: Story, field: 'published_chapters' | 'publication_status', value: T): FieldObservation<T> {
 const manual = record(story.metadata_overrides), browser = record(story.extension_metadata)
 const result: FieldObservation<T> = { value, source: 'unknown', confirmation: 'unknown', observedAt: null, manualOverride: false }
 if (Object.hasOwn(manual, field)) return { ...result, source: 'manual', confirmation: value === null || value === 'unknown' || field === 'published_chapters' && manual.chapter_count_manual === false ? 'unknown' : 'user_asserted', observedAt: timestamp(record(story.metadata_confirmation_times)[field]), manualOverride: true }
 if (field === 'publication_status' && story.work_status === 'deleted') return { ...result, source: 'private_availability' }
 const sourceField = field === 'publication_status' ? 'is_complete' : field
 if (Object.hasOwn(browser, field) || Object.hasOwn(browser, sourceField)) return { ...result,
  source: waybackSnapshot(story.original_url) ? 'archive' : 'browser', confirmation: value === null || value === 'unknown' ? 'unknown' : 'observed',
  // A successful whole-page capture is the available timestamp, not a fabricated field timestamp.
  observedAt: timestamp(browser.last_metadata_success) }
 const provenance = record(record(story.work.field_provenance)[sourceField])
 if (provenance.source === 'ao3') return { ...result, source: 'ao3', confirmation: value === null || value === 'unknown' ? 'unknown' : 'observed', observedAt: timestamp(provenance.retrieved_at) }
 return result
}

/** Current AO3 adapter. Foreign URL candidates never enter the AO3 matcher/save path through it. */
export function storySourceVersion(story: Story): StorySourceVersion {
 const work = story.work
 let identity: SourceIdentity | null = null, normalizedUrl: string | null = null
 if (work.ao3_work_id !== null && Number.isSafeInteger(work.ao3_work_id) && work.ao3_work_id > 0) {
  identity = nativeSourceIdentity('ao3', String(work.ao3_work_id))
  normalizedUrl = `https://archiveofourown.org/works/${work.ao3_work_id}`
 }
 let canonicalUrl: string | null = null, canonicalVerifiedAt: string | null = null
 if (!identity && story.source_url) { try { const location = sourceLocation(story.source_url); identity = location.identity; normalizedUrl = location.normalizedUrl } catch { /* Invalid legacy evidence remains unknown. */ } }
 if (identity?.kind === 'native' && work.canonical_url === normalizedUrl && timestamp(work.canonical_verified_at)) {
  canonicalUrl = work.canonical_url; canonicalVerifiedAt = timestamp(work.canonical_verified_at)
 }
 const count = story.metadata.published_chapters
 const published = typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= 2147483647 ? count : null
 return { contractVersion: 1, storyId: story.id, sourceVersionId: story.id, workId: work.id, ownerId: story.user_id,
  identity, originalUrl: story.original_url, normalizedUrl, canonicalUrl, canonicalVerifiedAt,
  publishedChapters: observation(story, 'published_chapters', published),
  publicationStatus: observation(story, 'publication_status', story.metadata.publication_status),
  progress: { status: story.reading_status, chaptersRead: story.last_read_chapter } }
}

export type MetadataConfidence = 'any' | 'verified' | 'automatic' | 'manual' | 'unknown'
export const confidenceLabels: Record<MetadataConfidence, string> = { any: 'Any', verified: 'Source-Verified', automatic: 'Automatically Extracted', manual: 'Manually Supplied', unknown: 'Unknown' }
export function fieldConfidence(story: Story, field: 'published_chapters' | 'publication_status'): MetadataConfidence {
 if (story.metadataConfidence?.[field]) return story.metadataConfidence[field]!
 const value = story.metadata[field]
 if (value === null || value === 'unknown' || value === undefined) return 'unknown'
 if (Object.hasOwn(record(story.metadata_overrides), field)) return 'manual'
 if (field === 'publication_status' && story.work_status === 'deleted') return 'unknown'
 const sourceField = field === 'publication_status' ? 'is_complete' : field
 if (Object.hasOwn(record(story.extension_metadata), field) || Object.hasOwn(record(story.extension_metadata), sourceField)) return 'automatic'
 return !story.source_url && record(record(story.work.field_provenance)[sourceField]).source === 'ao3' ? 'verified' : 'unknown'
}

export type SourceDuplicateCandidate = { id: string; title: string; exact: boolean }
export class SourceDuplicateError extends Error {
 constructor(public candidates: SourceDuplicateCandidate[]) { super('Review similar story URLs before saving.') }
}
export function sourceDuplicateFromError(error: { code?: string; details?: string | null } | null) {
 if (error?.code !== '23505' || !error.details) return null
 try {
  const parsed = JSON.parse(error.details)
  if (!Array.isArray(parsed.similarStories) || !parsed.similarStories.length) return null
  const candidates = parsed.similarStories.filter((value: unknown): value is SourceDuplicateCandidate => Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && 'title' in value && typeof value.title === 'string' && 'exact' in value && typeof value.exact === 'boolean'))
  return candidates.length ? new SourceDuplicateError(candidates) : null
 } catch { return null }
}
