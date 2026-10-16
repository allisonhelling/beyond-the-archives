import snapshots from './stories.json'
import { blankMetadata, parseWorkUrl, validateProgress, type Collection, type Entry, type Story, type StoryInput, type Work } from '../model'

const storageKey = 'between-chapters:sample-library:v1'
const userId = 'sample-reader'
const capturedAt = '2026-10-15T12:00:00.000Z'
type Library = { stories: Story[]; collections: Collection[] }

function makeWork(id: number): Work {
  return {
    id: `sample-work-${id}`, ao3_work_id: id, automatic_metadata: {}, last_metadata_success: null, canonical_url: null, canonical_verified_at: null,
    title: null, summary: null, rating: null, language: null, word_count: null,
    published_chapters: null, total_chapters: null, is_complete: null,
    ao3_published_at: null, ao3_updated_at: null, last_metadata_check: null,
    metadata_source: 'manual', field_provenance: {}, verified_chapters: {},
    created_at: capturedAt, updated_at: capturedAt,
  }
}

function seedLibrary(): Library {
  return {
    collections: [],
    stories: snapshots.map(sample => {
      const work: Work = {
        ...makeWork(sample.id), ...{
          title: sample.metadata.title, summary: sample.metadata.summary, rating: sample.metadata.rating,
          word_count: sample.metadata.word_count, published_chapters: sample.metadata.published_chapters,
          total_chapters: sample.metadata.total_chapters, is_complete: sample.metadata.publication_status === 'unknown' ? null : sample.metadata.publication_status === 'complete',
          canonical_url: sample.metadata_available ? `https://archiveofourown.org/works/${sample.id}` : null,
          canonical_verified_at: sample.metadata_available ? capturedAt : null,
          ao3_published_at: sample.published_at ? `${sample.published_at}T00:00:00Z` : null,
          ao3_updated_at: sample.updated_at ? `${sample.updated_at}T00:00:00Z` : null,
          last_metadata_check: sample.metadata_available ? capturedAt : null, verified_chapters: sample.verified_chapters,
          metadata_source: sample.metadata_available ? 'ao3' : 'unknown',
          field_provenance: { sample_source: sample.source_url, source_series: sample.source_series, captured_at: capturedAt, metadata_available: sample.metadata_available },
        },
      }
      return {
        id: `sample-entry-${sample.id}`, user_id: userId, work_id: work.id, original_url: sample.url,
        reading_status: sample.status as Entry['reading_status'], last_read_chapter: sample.progress,
        personal_rating: null, is_favorite: false, notes: '', metadata_overrides: {}, extension_metadata: {}, extension_chapters: {},
        started_at: null, finished_at: null, last_update_notification_at: null, update_dismissed_at: null,
        created_at: capturedAt, updated_at: capturedAt, work,
        metadata: { ...sample.metadata, publication_status: sample.metadata.publication_status as Story['metadata']['publication_status'] },
        collectionIds: [], personalTags: [],
      }
    }),
  }
}

function read(): Library {
  const saved = window.localStorage.getItem(storageKey)
  if (!saved) return seedLibrary()
  try {
    const data = JSON.parse(saved) as Library
    if (Array.isArray(data.stories) && Array.isArray(data.collections)) {
      // Fill only missing categories on older preview entries; preserve edits and removals.
      for (const story of data.stories) {
        const snapshot = snapshots.find(sample => sample.id === story.work.ao3_work_id)
        if (!snapshot) continue
        for (const key of ['relationship_tags', 'character_tags', 'additional_tags'] as const) {
          if (story.metadata[key] === undefined) story.metadata[key] = snapshot.metadata[key].filter(tag => story.metadata.ao3_tags.includes(tag))
        }
      }
      return data
    }
  } catch { /* Fall back to the original samples if local preview storage is invalid. */ }
  return seedLibrary()
}
function write(data: Library) { window.localStorage.setItem(storageKey, JSON.stringify(data)) }
function find(data: Library, id: string) {
  const story = data.stories.find(story => story.id === id)
  if (!story) throw new Error('Story no longer available.')
  return story
}

export async function loadSampleLibrary() { return read() }
export function resetSampleLibrary() { window.localStorage.removeItem(storageKey) }

export async function saveSampleStory(input: StoryInput) {
  const data = read()
  const { workId } = parseWorkUrl(input.url)
  validateProgress(input.progress, input.metadata)
  if (data.stories.some(story => story.work.ao3_work_id === workId && story.id !== input.id)) throw new Error('This story is already in your library.')
  const existing = input.id ? find(data, input.id) : null
  if (existing && existing.work.ao3_work_id !== workId) throw new Error('The AO3 work identity cannot be changed.')
  const now = new Date().toISOString()
  const work = existing?.work ?? makeWork(workId)
  const story: Story = {
    id: input.id ?? crypto.randomUUID(), user_id: userId, work_id: work.id,
    original_url: existing?.original_url ?? input.url, work,
    reading_status: input.status, last_read_chapter: input.progress, notes: input.notes,
    is_favorite: input.favorite, personal_rating: input.personalRating,
    metadata: { ...blankMetadata, ...input.metadata }, metadata_overrides: input.metadata, extension_metadata: {}, extension_chapters: {},
    collectionIds: input.collections, personalTags: input.tags,
    created_at: existing?.created_at ?? now, updated_at: now,
    started_at: existing?.started_at ?? null, finished_at: existing?.finished_at ?? null,
    last_update_notification_at: existing?.last_update_notification_at ?? null,
    update_dismissed_at: existing?.update_dismissed_at ?? null,
  }
  data.stories = [...data.stories.filter(item => item.id !== story.id), story]
  write(data)
  return story.id
}

export async function updateSampleEntry(id: string, changes: Pick<Partial<Entry>, 'reading_status' | 'last_read_chapter' | 'is_favorite'>) {
  const data = read(), story = find(data, id)
  if (changes.last_read_chapter !== undefined) validateProgress(changes.last_read_chapter, story.metadata)
  Object.assign(story, changes, { updated_at: new Date().toISOString() })
  write(data)
}
export async function deleteSampleStory(id: string) {
  const data = read()
  data.stories = data.stories.filter(story => story.id !== id)
  write(data)
}
export async function restoreSampleStory(story: Story) {
  const data = read()
  if (data.stories.some(item => item.work.ao3_work_id === story.work.ao3_work_id)) throw new Error('This story is already in your library.')
  data.stories.push({ ...story, collectionIds: story.collectionIds.filter(id => data.collections.some(collection => collection.id === id)) })
  write(data)
}
export async function saveSampleCollection(name: string, id?: string) {
  const data = read(), trimmed = name.trim()
  if (!trimmed) throw new Error('A collection name is required.')
  if (data.collections.some(item => item.id !== id && item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error('That collection name already exists.')
  const now = new Date().toISOString()
  if (id) {
    const collection = data.collections.find(item => item.id === id)
    if (!collection) throw new Error('Collection no longer available.')
    collection.name = trimmed; collection.updated_at = now
  } else data.collections.push({ id: crypto.randomUUID(), user_id: userId, name: trimmed, description: null, default_key: null, created_at: now, updated_at: now })
  data.collections.sort((a, b) => a.name.localeCompare(b.name))
  write(data)
}
export async function deleteSampleCollection(id: string) {
  const data = read()
  data.collections = data.collections.filter(item => item.id !== id)
  data.stories.forEach(story => { story.collectionIds = story.collectionIds.filter(item => item !== id) })
  write(data)
}
