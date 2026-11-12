import { expect, it } from 'vitest'
import { exampleWork } from './display/display-examples'
import { nativeSourceIdentity, sourceIdentityKey, sourceLocation, storySourceVersion } from './story-source'
import { effectiveMetadata, effectiveWork, type Story } from './model'

it('keeps native namespaces, opaque IDs and URL candidates distinct without enabling imports', () => {
 const ao3 = nativeSourceIdentity('ao3', '123'), foreign = nativeSourceIdentity('fixture_site', '123')
 expect(sourceIdentityKey(ao3)).not.toBe(sourceIdentityKey(foreign))
 expect(nativeSourceIdentity('fixture_site', '00123')).toMatchObject({ nativeWorkId: '00123' })
 expect(nativeSourceIdentity('fixture_site', 'opaque:chapter/story')).toMatchObject({ nativeWorkId: 'opaque:chapter/story' })
 for (const id of ['0', '00123', '-1', '9007199254740992', '']) expect(() => nativeSourceIdentity('ao3', id)).toThrow()
 const original = ' HTTPS://Stories.Example:443/Story/ABC?edition=2#part-1 '
 const location = sourceLocation(original)
 expect(location).toEqual({ originalUrl: original, normalizedUrl: 'https://stories.example/Story/ABC?edition=2#part-1',
  identity: { kind: 'url', origin: 'https://stories.example', normalizedUrl: 'https://stories.example/Story/ABC?edition=2#part-1' } })
 expect(sourceIdentityKey(location.identity)).not.toBe(sourceIdentityKey(sourceLocation(original.replace('part-1', 'part-2')).identity))
 expect(sourceIdentityKey(location.identity)).not.toBe(sourceIdentityKey(sourceLocation(original.replace('edition=2', 'edition=3')).identity))
})

it('reuses AO3 work parsing and preserves the original chapter/archive acquisition URL', () => {
 for (const originalUrl of ['https://archiveofourown.org/works/123/chapters/987?view_adult=true',
  'https://web.archive.org/web/20260101000000/https://archiveofourown.org/works/123']) {
  expect(sourceLocation(originalUrl)).toEqual({ originalUrl, normalizedUrl: 'https://archiveofourown.org/works/123', identity: { kind: 'native', platform: 'ao3', nativeWorkId: '123' } })
 }
 for (const url of ['javascript:alert(1)', 'file:///private/file', 'https://user:secret@stories.example/story', 'https://localhost/story',
  'http://2130706433/story', 'http://192.168.1.1/story', 'https://[::1]/story', 'https://app.local/story', 'https://stories.example/\nsecret',
  'https://archiveofourown.org/users/Fixture', 'https://web.archive.org/web/*/https://archiveofourown.org/works/123']) expect(() => sourceLocation(url)).toThrow()
})

function observedStory(manual: Story['metadata_overrides'] = {}): Story {
 const entry = { ...structuredClone(exampleWork), metadata_overrides: manual,
  extension_metadata: { published_chapters: 12, total_chapters: 30, is_complete: false, last_metadata_success: '2026-11-12T12:00:00Z' } }
 const work = effectiveWork(entry.work, entry)
 return { ...entry, work, metadata: effectiveMetadata(work, manual) }
}

it('protects private manual precedence and keeps publication, confidence and reading status independent', () => {
 const entry = observedStory({ published_chapters: 20, publication_status: 'hiatus',
  field_provenance: { published_chapters: { source: 'ao3', verified: true } } })
 const before = structuredClone(entry)
 const version = storySourceVersion(entry)
 expect(version).toMatchObject({ storyId: entry.id, sourceVersionId: entry.id, workId: entry.work.id, ownerId: entry.user_id,
  publishedChapters: { value: 20, source: 'manual', confirmation: 'user_asserted', observedAt: null, manualOverride: true },
  publicationStatus: { value: 'hiatus', source: 'manual', confirmation: 'user_asserted', observedAt: null, manualOverride: true },
  progress: { status: 'reading', chaptersRead: 0 } })
 const refreshed = observedStory(entry.metadata_overrides)
 refreshed.extension_metadata = { published_chapters: 25, is_complete: true }
 refreshed.work = effectiveWork(exampleWork.work, refreshed)
 refreshed.metadata = effectiveMetadata(refreshed.work, refreshed.metadata_overrides)
 expect(storySourceVersion(refreshed).publishedChapters).toEqual(version.publishedChapters)
 expect(storySourceVersion(refreshed).publicationStatus).toEqual(version.publicationStatus)
 expect(entry).toEqual(before)
})

it('labels observations without upgrading browser or archive data to verified source facts', () => {
 const story = observedStory()
 expect(storySourceVersion(story)).toMatchObject({ publishedChapters: { value: 12, source: 'browser', confirmation: 'observed', observedAt: '2026-11-12T12:00:00.000Z', manualOverride: false },
  publicationStatus: { value: 'in_progress', source: 'browser' } })
 story.original_url = `https://web.archive.org/web/20260101000000/https://archiveofourown.org/works/${story.work.ao3_work_id}`
 expect(storySourceVersion(story).publishedChapters.source).toBe('archive')
 story.work_status = 'deleted'
 expect(storySourceVersion(story).publicationStatus).toMatchObject({ source: 'private_availability', confirmation: 'unknown' })
})

it('preserves legacy unknowns and meaningful zero without fabricating observation times or canonical identity', () => {
 const story = observedStory()
 story.extension_metadata = {}
 story.metadata.published_chapters = null
 story.work.canonical_url = `https://archiveofourown.org/works/${story.work.ao3_work_id! + 1}`
 expect(storySourceVersion(story)).toMatchObject({ canonicalUrl: null, canonicalVerifiedAt: null, publishedChapters: { value: null, source: 'unknown', observedAt: null } })
 story.metadata.published_chapters = 0
 expect(storySourceVersion(story).publishedChapters.value).toBe(0)
 story.metadata.published_chapters = 2147483648
 expect(storySourceVersion(story).publishedChapters.value).toBeNull()
 story.work.field_provenance = { published_chapters: { source: 'ao3', retrieved_at: '2026-11-12T10:00:00Z' } }
 story.metadata.published_chapters = 12
 expect(storySourceVersion(story).publishedChapters).toMatchObject({ source: 'ao3', confirmation: 'observed', observedAt: '2026-11-12T10:00:00.000Z' })
 story.work.ao3_work_id = null
 expect(storySourceVersion(story)).toMatchObject({ identity: null, normalizedUrl: null, canonicalUrl: null })
})
