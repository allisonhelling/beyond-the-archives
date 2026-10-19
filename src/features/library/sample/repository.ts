import { compareCollections, normalizeCollectionChanges, type CollectionAppearance } from '../collection-appearance'
import snapshots from './stories.json'
import { abandonedReadingStatus, blankMetadata, parseWorkUrl, validateProgress, type Collection, type Entry, type Story, type StoryInput, type Work } from '../model'

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

export async function loadSampleLibrary() { const data = read(); data.collections.sort(compareCollections); return data }
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
    reading_status: abandonedReadingStatus(input.status, input.progress, input.metadata), last_read_chapter: input.progress, notes: input.notes,
    is_favorite: input.favorite, personal_rating: input.personalRating,
    metadata: { ...blankMetadata, ...input.metadata }, metadata_overrides: input.metadata, extension_metadata: {}, extension_chapters: {},
    collectionIds: input.collections, personalTags: input.tags,
    created_at: existing?.created_at ?? now, updated_at: now,
    started_at: existing?.started_at ?? null, finished_at: existing?.finished_at ?? null,
    last_update_notification_at: existing?.last_update_notification_at ?? null,
    update_dismissed_at: existing?.update_dismissed_at ?? null,
  }
  for (const collection of data.collections) {
    if (input.collections.includes(collection.id) && !existing?.collectionIds.includes(collection.id)) collection.last_story_added_at = now
  }
  data.stories = [...data.stories.filter(item => item.id !== story.id), story]
  write(data)
  return story.id
}

export async function addSampleStoriesToCollections(storyIds: string[], collectionIds: string[]) {
  const data = read(), stories = storyIds.map(id => find(data, id)), now = new Date().toISOString()
  const collections = collectionIds.map(id => {
    const collection = data.collections.find(item => item.id === id && !item.default_key)
    if (!collection) throw new Error('Collection no longer available.')
    return collection
  })
  for (const story of stories) for (const collection of collections) {
    if (!story.collectionIds.includes(collection.id)) {
      story.collectionIds.push(collection.id)
      collection.last_story_added_at = now
    }
  }
  write(data)
}

export async function updateSampleEntry(id: string, changes: Pick<Partial<Entry>, 'reading_status' | 'last_read_chapter' | 'is_favorite'>) {
  const data = read(), story = find(data, id)
  if (changes.last_read_chapter !== undefined) validateProgress(changes.last_read_chapter, story.metadata)
  Object.assign(story, changes, { updated_at: new Date().toISOString() })
  story.reading_status = abandonedReadingStatus(story.reading_status, story.last_read_chapter, story.metadata)
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
  for (const collection of data.collections) {
    if (story.collectionIds.includes(collection.id)) collection.last_story_added_at = new Date().toISOString()
  }
  data.stories.push({ ...story, collectionIds: story.collectionIds.filter(id => data.collections.some(collection => collection.id === id)) })
  write(data)
}
export async function saveSampleCollection(name: string, id?: string, appearance?: CollectionAppearance, description?: string) {
  const changes = normalizeCollectionChanges({ ...appearance, ...(description !== undefined && { description }) })
  const data = read(), trimmed = name.trim()
  const collectionId = id ?? crypto.randomUUID()
  if (!trimmed) throw new Error('A collection name is required.')
  if (data.collections.some(item => item.id !== id && item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error('That collection name already exists.')
  const now = new Date().toISOString()
  if (id) {
    const collection = data.collections.find(item => item.id === id)
    if (!collection) throw new Error('Collection no longer available.')
    Object.assign(collection, { name: trimmed, updated_at: now, ...changes })
  } else data.collections.push({ id: collectionId, user_id: userId, name: trimmed, description: changes.description ?? null, default_key: null, created_at: now, updated_at: now, color: changes.color ?? null, symbol: changes.symbol ?? null, sort_position: null, last_story_added_at: null })
  data.collections.sort(compareCollections)
  write(data)
  return collectionId
}
export async function updateSampleCollections(ids: string[], changes: Partial<CollectionAppearance>) {
  const data = read(), patch = normalizeCollectionChanges({ color: changes.color, symbol: changes.symbol })
  if (!ids.length || !Object.keys(patch).length) throw new Error('Choose collections and at least one field to change.')
  for (const collection of data.collections) {
    if (ids.includes(collection.id) && !collection.default_key) Object.assign(collection, patch, { updated_at: new Date().toISOString() })
  }
  write(data)
}
export async function deleteSampleCollection(id: string) { return deleteSampleCollections([id]) }
export async function deleteSampleCollections(ids: string[]) {
  const data = read(), removable = new Set(data.collections.filter(item => ids.includes(item.id) && !item.default_key).map(item => item.id))
  data.collections = data.collections.filter(item => !removable.has(item.id))
  data.stories.forEach(story => { story.collectionIds = story.collectionIds.filter(id => !removable.has(id)) })
  write(data)
}

export async function reorderSampleCollections(ids: string[]) {
  const data = read(), custom = data.collections.filter(collection => !collection.default_key)
  if (ids.length !== custom.length || new Set(ids).size !== ids.length || ids.some(id => !custom.some(collection => collection.id === id))) throw new Error('Collections changed. Reload your library and try again.')
  for (const collection of custom) collection.sort_position = ids.indexOf(collection.id)
  write(data)
}
