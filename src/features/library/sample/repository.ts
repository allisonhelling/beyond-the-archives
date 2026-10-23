import type { AutomaticMetadata } from '../../imports/ao3-metadata'
import { csvBookmark, bookmarkReadingState, nonemptyMetadata, type CsvWork } from '../../imports/ao3-csv'
import { recordReadingTransition } from '../reading-history'
import { defaultReadingFilters, filterReading } from '../reading-search'
import { applyAutomaticCollections, automaticCollectionRules, collectionRules, type AutomaticCollectionRules } from '../automatic-collections'
import type { SeriesPreview } from '../../imports/urls'
import { librarySeries, type SeriesRecord } from '../series'
import type { Json } from '../../../types/database'
import { applyStoryEdits, editSnapshot, EditConflict, mergeEdits, resolveEdits, storyEdits, type EditValues } from '../edit-merge'
import { compareCollections, normalizeCollectionChanges, type CollectionAppearance } from '../collection-appearance'
import defaultState from './default-state.json'
import snapshots from './stories.json'
import seriesSnapshots from './series.json'
import type { SpineDesign } from '../SpineDetails'
import { abandonedReadingStatus, blankMetadata, bookmarkRec, deletedWorkTitle, sourceBookmark, parseWorkUrl, validateProgress, type Collection, type Entry, type Story, type StoryInput, type Work } from '../model'

const storageKey = 'between-chapters:sample-library:v1'
const userId = 'sample-reader'
const capturedAt = '2026-10-15T12:00:00.000Z'
const sampleVersion = 8
const seriesVersions: Record<number, number> = { 132147: 6, 1030529: 3, 2404765: 3, 2888871: 3 }
const spineSamples = [
  { name: 'Celestial', spineDesign: 'celestial', color: '#92504e', introducedIn: 4 },
  { name: 'Circles', spineDesign: 'interlocking-circles', color: '#214921', introducedIn: 4 },
  { name: 'Diamonds', spineDesign: 'linked-diamonds', color: '#243c5e', introducedIn: 4 },
  { name: 'Book Stack', spineDesign: 'book-stack', color: '#07534a', introducedIn: 4 },
  { name: 'Constellation', spineDesign: 'constellation', color: '#54254b', introducedIn: 5 },
  { name: 'Deco Crest', spineDesign: 'deco-crest', color: '#92504e', introducedIn: 5 },
  { name: 'Star Trails', spineDesign: 'star-trails', color: '#243c5e', introducedIn: 5 },
  { name: 'Extended Trails', spineDesign: 'star-trails-extended', color: '#07534a', introducedIn: 5 },
  { name: 'Vertical Diamonds', spineDesign: 'vertical-diamonds', color: '#54254b', introducedIn: 5 },
  { name: 'Lunar Phases', spineDesign: 'lunar-phases', color: '#243c5e', introducedIn: 7 },
  { name: 'Query Crown', spineDesign: 'query-crown', color: '#54254b', introducedIn: 7 },
] satisfies { name: string; spineDesign: SpineDesign; color: string; introducedIn: number }[]
type Library = { stories: Story[]; collections: (Collection & { spineDesign?: SpineDesign })[]; series?: SeriesRecord[]; sampleVersion?: number }

function makeWork(id: number | null): Work {
  return {
    id: `sample-work-${id ?? crypto.randomUUID()}`, ao3_work_id: id, automatic_metadata: {}, last_metadata_success: null, canonical_url: null, canonical_verified_at: null,
    title: null, summary: null, rating: null, language: null, word_count: null,
    published_chapters: null, total_chapters: null, is_complete: null,
    ao3_published_at: null, ao3_updated_at: null, last_metadata_check: null,
    metadata_source: 'manual', field_provenance: {}, verified_chapters: {},
    created_at: capturedAt, updated_at: capturedAt,
  }
}

function originalSamples(): Library {
  const stories: Story[] = snapshots.map(sample => {
    const snapshotAt = sample.captured_at ?? capturedAt
    const work: Work = {
      ...makeWork(sample.id), ...{
        title: sample.metadata.title, summary: sample.metadata.summary, rating: sample.metadata.rating,
        word_count: sample.metadata.word_count, published_chapters: sample.metadata.published_chapters,
        total_chapters: sample.metadata.total_chapters, is_complete: sample.metadata.publication_status === 'unknown' ? null : sample.metadata.publication_status === 'complete',
        canonical_url: sample.metadata_available ? `https://archiveofourown.org/works/${sample.id}` : null,
        canonical_verified_at: sample.metadata_available ? snapshotAt : null,
        ao3_published_at: sample.published_at ? `${sample.published_at}T00:00:00Z` : null,
        ao3_updated_at: sample.updated_at ? `${sample.updated_at}T00:00:00Z` : null,
        last_metadata_check: sample.metadata_available ? snapshotAt : null, verified_chapters: sample.verified_chapters,
        metadata_source: sample.metadata_available ? 'ao3' : 'unknown',
        field_provenance: { sample_source: sample.source_url, source_series: sample.source_series, captured_at: snapshotAt, metadata_available: sample.metadata_available },
      },
    }
    return {
      id: `sample-entry-${sample.id}`, user_id: userId, work_id: work.id, original_url: sample.url,
      reading_status: sample.status as Entry['reading_status'], last_read_chapter: sample.progress,
      personal_rating: null, is_favorite: false, is_rec: false, notes: '', metadata_overrides: {}, extension_metadata: {}, extension_chapters: {},
      started_at: null, finished_at: null, last_update_notification_at: null, update_dismissed_at: null,
      created_at: snapshotAt, updated_at: snapshotAt, work,
      metadata: { ...sample.metadata } as Story['metadata'],
      collectionIds: [], personalTags: [],
    }
  })
  const groups = librarySeries(stories)
  const series: SeriesRecord[] = seriesSnapshots.map(snapshot => {
    const group = groups.find(series => series.seriesId === snapshot.seriesId)
    const snapshotAt = snapshot.fetchedAt ?? group?.savedStories[0]?.created_at ?? capturedAt
    return {
      id: `sample-series-${snapshot.seriesId}`, user_id: userId, ao3_series_id: snapshot.seriesId,
      metadata: { ...snapshot, works: snapshot.works ?? group?.works ?? [] } as unknown as Json,
      notes: '', is_favorite: false, is_rec: false, reading_status: 'to_read', collectionIds: [], created_at: snapshotAt, updated_at: snapshotAt,
    }
  })
  const collections: Library['collections'] = spineSamples.map((sample, index) => ({ name:sample.name, color:sample.color, spineDesign:sample.spineDesign,
    id: `sample-spine-${sample.spineDesign}`, user_id: userId, default_key: null,
    description: 'Sample collection for comparing spine designs.', symbol: 'book',
    sort_position: index, last_story_added_at: null, created_at: capturedAt, updated_at: capturedAt,
  }))
  collections.push({
    id: 'sample-one-shots', user_id: userId, name: 'One Shots', default_key: null,
    color: '#8b491e', symbol: 'scroll', description: null,
    automatic_rules: automaticCollectionRules({ ...defaultReadingFilters, oneShot: 'only' }) as unknown as Json,
    sort_position: collections.length, last_story_added_at: null, created_at: capturedAt, updated_at: capturedAt,
  })
  return { stories, collections, series, sampleVersion }
}

// Store only changes to the original fixtures so captured defaults reuse work metadata.
// Keep originalSamples separate for legacy upgrades, which must preserve historical seeds.
function seedLibrary(): Library {
  const original = originalSamples()
  const saved = structuredClone(defaultState)
  return {
    ...saved,
    stories: saved.stories.map(story => ({ ...original.stories.find(sample => sample.id === story.id), ...story })),
    series: saved.series.map(series => ({ ...original.series?.find(sample => sample.id === series.id), ...series })),
  } as Library
}

function read(): Library {
  const saved = window.localStorage.getItem(storageKey)
  if (!saved) return seedLibrary()
  try {
    const data = JSON.parse(saved) as Library
    if (Array.isArray(data.stories) && Array.isArray(data.collections)) {
      for (const story of data.stories) if (story.work_status === 'deleted') story.metadata.publication_status = 'deleted'
      // Preserve saved identities and reading progress when upgrading legacy names.
      let renamedValues = false
      for (const story of data.stories) if (typeof story.is_rec !== 'boolean') {
        story.is_rec = bookmarkRec(story) === true
        renamedValues = true
      }
      for (const collection of data.collections) {
        if ((collection.spineDesign as string) === 'celestial-constellation') {
          collection.spineDesign = 'celestial'
          renamedValues = true
        }
      }
      for (const entry of [...data.stories, ...(data.series ?? [])]) {
        if ((entry.reading_status as string) === 'continue_later') {
          entry.reading_status = 'paused_reading'
          renamedValues = true
        }
      }
      if (renamedValues) write(data)
      if ((data.sampleVersion ?? 1) < sampleVersion) {
        const seed = originalSamples(), seriesIds = new Set(seriesSnapshots.filter(series => seriesVersions[series.seriesId] > (data.sampleVersion ?? 1)).map(series => series.seriesId))
        // Upgrade affected series once, preserving edits to saved works and series notes
        // and leaving unrelated removed samples absent.
        for (const story of seed.stories.filter(story => story.metadata.series_memberships?.some(series => seriesIds.has(series.id)))) {
          const existing = data.stories.find(saved => saved.work.ao3_work_id === story.work.ao3_work_id)
          if (!existing) data.stories.push(story)
          else if (existing.metadata.series_memberships === undefined) {
            existing.metadata.series_memberships = story.metadata.series_memberships
            existing.metadata.series ??= story.metadata.series
          }
        }
        data.series ??= []
        for (const series of seed.series ?? []) if (seriesIds.has(series.ao3_series_id)) {
          const existing = data.series.find(saved => saved.ao3_series_id === series.ao3_series_id)
          if (!existing) data.series.push(series)
          else existing.metadata = series.metadata
        }
        const newDesigns = new Set<SpineDesign>(spineSamples.filter(sample => sample.introducedIn > (data.sampleVersion ?? 1)).map(sample => sample.spineDesign))
        for (const collection of seed.collections) {
          const starter = collection.id === 'sample-one-shots'
          const introduced = collection.spineDesign ? newDesigns.has(collection.spineDesign) : starter && (data.sampleVersion ?? 1) < 8
          if (!introduced || data.collections.some(saved => saved.id === collection.id || starter && saved.name === collection.name)) continue
          const lastPosition = Math.max(-1, ...data.collections.map(saved => saved.sort_position ?? -1))
          data.collections.push({ ...collection, sort_position: lastPosition + 1 })
        }
        data.sampleVersion = sampleVersion
        write(data)
      }
      for (const series of data.series ?? []) {
        const snapshot = seriesSnapshots.find(snapshot => snapshot.seriesId === series.ao3_series_id)
        const metadata = series.metadata as unknown as SeriesPreview
        if (snapshot && !metadata.basic && metadata.complete === undefined) metadata.complete = snapshot.complete
      }
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

export async function loadSampleLibrary() { const data = read(); data.collections.sort(compareCollections); return { ...data, stories: applyAutomaticCollections(data.stories, data.collections), series: data.series ?? [] } }
export function resetSampleLibrary() { window.localStorage.removeItem(storageKey) }

export async function saveSampleStory(input: StoryInput, verifiedChapters?: Record<string, string>, automaticMetadata?: AutomaticMetadata, bookmark?: CsvWork) {
  const data = read()
  const existing = input.id ? find(data, input.id) : null
  const workId = bookmark?.workId === null || existing?.work.ao3_work_id === null ? null : parseWorkUrl(input.url).workId
  if (workId === null && input.url !== (bookmark?.url ?? existing?.original_url)) throw new Error('Bookmark identity cannot be changed.')
  if (data.collections.some(collection => collection.automatic_rules && input.collections.includes(collection.id))) throw new Error('Automatic collection membership is determined by its filters.')
  validateProgress(input.progress, input.metadata)
  if (workId !== null && data.stories.some(story => story.work.ao3_work_id === workId && story.id !== input.id)) throw new Error('This story is already in your library.')
  if (existing && existing.work.ao3_work_id !== workId) throw new Error('The AO3 work identity cannot be changed.')
  if (existing && input.base) {
    const base = editSnapshot(existing), review = mergeEdits(input.base, storyEdits(input), base)
    if (review.conflicts.length) throw new EditConflict({ ...review, base }, choices => saveSampleStory(applyStoryEdits(input, resolveEdits(review.merged, choices), base), verifiedChapters, automaticMetadata, bookmark))
    input = applyStoryEdits(input, review.merged, base)
  }
  const now = new Date().toISOString()
  const work = existing?.work ?? makeWork(workId)
  if (verifiedChapters) work.verified_chapters = verifiedChapters
  if (automaticMetadata) Object.assign(work, { metadata_source: 'extension', canonical_url: workId === null ? null : `https://archiveofourown.org/works/${workId}`, ao3_updated_at: automaticMetadata.ao3_updated_at ?? null })
  const story: Story = {
    id: input.id ?? crypto.randomUUID(), user_id: userId, work_id: work.id,
    original_url: existing?.original_url ?? input.url, work, work_status: existing?.work_status ?? (bookmark?.workStatus ?? (automaticMetadata ? 'available' : 'unknown')),
    source_bookmark: bookmark?.bookmarkId ? { ...sourceBookmark(existing ?? {}), ...csvBookmark(bookmark) } : existing?.source_bookmark ?? {},
    reading_status: abandonedReadingStatus(input.status, input.progress, input.metadata), last_read_chapter: input.progress, notes: input.notes,
    is_favorite: input.favorite, is_rec: existing?.is_rec ?? (bookmark?.bookmarkRec === true), personal_rating: input.personalRating,
    metadata: { ...blankMetadata, ...input.metadata }, metadata_overrides: automaticMetadata ? {} : existing && input.metadataChanges ? { ...(existing.metadata_overrides as object), ...input.metadataChanges } : input.metadata, extension_metadata: automaticMetadata ? { ...nonemptyMetadata(automaticMetadata), publication_status: input.metadata.publication_status } as Json : existing?.extension_metadata ?? {}, extension_chapters: existing?.extension_chapters ?? {},
    collectionIds: input.collections, personalTags: input.tags,
    created_at: existing?.created_at ?? now, updated_at: now,
    started_at: existing?.started_at ?? null, finished_at: existing?.finished_at ?? null,
    last_update_notification_at: existing?.last_update_notification_at ?? null,
    update_dismissed_at: existing?.update_dismissed_at ?? null,
  }
  recordReadingTransition(story, existing ?? undefined, now)
  for (const collection of data.collections) {
    if (input.collections.includes(collection.id) && !existing?.collectionIds.includes(collection.id)) collection.last_story_added_at = now
  }
  data.stories = [...data.stories.filter(item => item.id !== story.id), story]
  write(data)
  return story.id
}

export async function previewSampleCsvImport(works: CsvWork[]) {
 return read().stories.filter(story => works.some(work => work.workId !== null && work.workId === story.work.ao3_work_id || work.bookmarkId && String(work.bookmarkId) === sourceBookmark(story).id)).map(story => ({
  workId: works.find(work => work.bookmarkId && String(work.bookmarkId) === sourceBookmark(story).id)?.workStatus === 'deleted' ? null : story.work.ao3_work_id, bookmarkId: sourceBookmark(story).id ? Number(sourceBookmark(story).id) : undefined, id: story.id, version: story.updated_at, title: story.metadata.title,
  status: story.reading_status, progress: story.last_read_chapter, notes: story.notes, tags: story.personalTags, finishedAt: story.finished_at,
 }))
}
/** Refresh automatic observations while preserving existing personal data. */
export async function importSampleWorks(works: CsvWork[]) {
 let imported = 0, kept = 0
 for (const row of works) {
  const data = read()
  const existing = data.stories.find(story => row.bookmarkId && sourceBookmark(story).id === String(row.bookmarkId) || row.workId !== null && story.work.ao3_work_id === row.workId)
  const incoming = nonemptyMetadata(row.metadata)
  const automatic = { ...incoming, ...(incoming.is_complete === undefined ? {} : { publication_status: incoming.is_complete ? 'complete' as const : 'in_progress' as const }) }
  if (existing) {
   if (row.bookmarkId) existing.source_bookmark = { ...sourceBookmark(existing), ...csvBookmark(row) }
   if (row.workStatus === 'deleted') {
    existing.work_status = 'deleted'
    existing.metadata.publication_status = 'deleted'
    write(data); kept++; continue
   }
   if (existing.work.ao3_work_id === null && row.workId !== null) { existing.work = makeWork(row.workId); existing.work_id = existing.work.id; existing.original_url = row.url }
   existing.work_status = 'available'
   existing.extension_metadata = { ...(existing.extension_metadata as object), ...automatic } as Json
   existing.metadata = { ...existing.metadata, ...(existing.extension_metadata as object), ...(existing.metadata_overrides as object) }
   if (incoming.ao3_updated_at) existing.work.ao3_updated_at = incoming.ao3_updated_at
   write(data); kept++; continue
  }
  const reading = bookmarkReadingState(row), finished = reading.status === 'finished'
  const metadata: Story['metadata'] = { ...blankMetadata, ...row.metadata, title: row.metadata.title || `Deleted Work — Bookmark #${row.bookmarkId}`,
   publication_status: row.metadata.is_complete === undefined ? 'unknown' : row.metadata.is_complete ? 'complete' : 'in_progress' }
  const id = await saveSampleStory({ url: row.url, metadata, status: reading.status,
   progress: reading.progress, notes: row.notes, tags: row.tags, personalRating: null, favorite: false, collections: [] }, undefined, incoming, row)
  const saved = read(), story = find(saved, id)
  if (story.work.ao3_work_id === null && !row.metadata.title) story.metadata.title = deletedWorkTitle(story)
  if (finished && row.bookmarkDate) {
   story.finished_at = `${row.bookmarkDate}T00:00:00Z`
   story.reading_history = story.reading_history?.map(event => event.action === 'finished' ? { ...event, at: story.finished_at! } : event)
  }
  write(saved); imported++
 }
 return { batch: null, imported, kept }
}

export async function addSampleStoriesToCollections(storyIds: string[], collectionIds: string[]) {
  const data = read(), stories = storyIds.map(id => find(data, id)), now = new Date().toISOString()
  const collections = collectionIds.map(id => {
    const collection = data.collections.find(item => item.id === id && !item.default_key)
    if (!collection) throw new Error('Collection no longer available.')
    if (collection.automatic_rules) throw new Error('Automatic collection membership is determined by its filters.')
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

export async function updateSampleEntry(id: string, changes: Pick<Partial<Entry>, 'reading_status' | 'last_read_chapter' | 'is_favorite' | 'is_rec' | 'notes' | 'personal_rating'>) {
  const data = read(), story = find(data, id)
  if (changes.last_read_chapter !== undefined) validateProgress(changes.last_read_chapter, story.metadata)
  const previous = { ...story }
  Object.assign(story, changes, { updated_at: new Date().toISOString() })
  story.reading_status = abandonedReadingStatus(story.reading_status, story.last_read_chapter, story.metadata)
  recordReadingTransition(story, previous, story.updated_at)
  write(data)
}
export async function updateSampleEntryChecked(id: string, values: EditValues, baseline: EditValues): Promise<void> {
  const data = read(), story = find(data, id), base = editSnapshot(story), review = mergeEdits(baseline, values, base)
  if (review.conflicts.length) throw new EditConflict({ ...review, base }, choices => updateSampleEntryChecked(id, resolveEdits(review.merged, choices), base))
  const merged = review.merged
  await updateSampleEntry(id, { reading_status: merged.status as Entry['reading_status'], last_read_chapter: merged.progress as number, notes: merged.notes as string, personal_rating: merged.rating as number | null, is_favorite: merged.favorite as boolean, is_rec: merged.rec as boolean })
}
export async function deleteSampleStory(id: string) {
  const data = read()
  data.stories = data.stories.filter(story => story.id !== id)
  write(data)
}
export async function restoreSampleStory(story: Story) {
  const data = read()
  if (data.stories.some(item => story.work.ao3_work_id !== null ? item.work.ao3_work_id === story.work.ao3_work_id : sourceBookmark(item).id === sourceBookmark(story).id)) throw new Error('This story is already in your library.')
  for (const collection of data.collections) {
    if (story.collectionIds.includes(collection.id)) collection.last_story_added_at = new Date().toISOString()
  }
  data.stories.push({ ...story, collectionIds: story.collectionIds.filter(id => data.collections.some(collection => collection.id === id)) })
  write(data)
}
export async function saveSampleCollection(name: string, id?: string, appearance?: CollectionAppearance, description?: string, rules?: AutomaticCollectionRules | null) {
  const changes = { ...normalizeCollectionChanges({ ...appearance, ...(description !== undefined && { description }) }), ...(rules !== undefined && { automatic_rules: rules ? automaticCollectionRules(rules.filters) as unknown as Json : null }) }
  const data = read(), trimmed = name.trim()
  const collectionId = id ?? crypto.randomUUID()
  if (!trimmed) throw new Error('A collection name is required.')
  if (data.collections.some(item => item.id !== id && item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error('That collection name already exists.')
  const now = new Date().toISOString()
  if (id) {
    const collection = data.collections.find(item => item.id === id)
    if (!collection) throw new Error('Collection no longer available.')
    if (collection.automatic_rules && rules === null) {
      const matching = new Set(filterReading(data.stories, collectionRules(collection)!.filters, { authorOnly: true }).map(story => story.id))
      for (const story of data.stories) if (matching.has(story.id) && !story.collectionIds.includes(collectionId)) story.collectionIds.push(collectionId)
    }
    Object.assign(collection, { name: trimmed, updated_at: now, ...changes })
  } else data.collections.push({ id: collectionId, user_id: userId, name: trimmed, description: changes.description ?? null, default_key: null, created_at: now, updated_at: now, color: changes.color ?? null, symbol: changes.symbol ?? null, sort_position: null, last_story_added_at: null, ...changes })
  if (rules) {
    for (const story of data.stories) story.collectionIds = story.collectionIds.filter(id => id !== collectionId)
    for (const series of data.series ?? []) series.collectionIds = series.collectionIds?.filter(id => id !== collectionId)
  }
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
  data.series?.forEach(series => { series.collectionIds = series.collectionIds?.filter(id => !removable.has(id)) })
  write(data)
}

export async function reorderSampleCollections(ids: string[]) {
  const data = read(), custom = data.collections.filter(collection => !collection.default_key)
  if (ids.length !== custom.length || new Set(ids).size !== ids.length || ids.some(id => !custom.some(collection => collection.id === id))) throw new Error('Collections changed. Reload your library and try again.')
  for (const collection of custom) collection.sort_position = ids.indexOf(collection.id)
  write(data)
}

export async function rememberSampleSeries(preview: SeriesPreview) {
 const data = read(), existing = data.series?.find(series => series.ao3_series_id === preview.seriesId), now = new Date().toISOString()
 const record: SeriesRecord = { id: existing?.id ?? crypto.randomUUID(), user_id: userId, ao3_series_id: preview.seriesId, metadata: preview as unknown as Json, notes: existing?.notes ?? '', is_favorite: existing?.is_favorite ?? false, is_rec: existing?.is_rec ?? false, reading_status: existing?.reading_status ?? 'to_read', collectionIds: existing?.collectionIds ?? [], created_at: existing?.created_at ?? now, updated_at: now }
 data.series = [...(data.series ?? []).filter(series => series.id !== record.id), record]; write(data); return record.id
}
export async function ensureSampleSeries(series: Pick<SeriesPreview, 'seriesId' | 'title'>) {
 if (!read().series?.some(record => record.ao3_series_id === series.seriesId)) await rememberSampleSeries({ ...series, normalizedUrl: `https://archiveofourown.org/series/${series.seriesId}`, description: '', works: [], basic: true })
}
export async function removeSampleSeriesDetails(seriesId: number) {
 const data = read(), record = data.series?.find(record => record.ao3_series_id === seriesId)
 if (!record) return
 const preview = record.metadata as unknown as SeriesPreview
 record.metadata = { seriesId, title: preview.title, normalizedUrl: preview.normalizedUrl, description: '', works: [], basic: true }
 record.updated_at = new Date().toISOString()
 write(data)
}
export async function saveSampleSeriesNote(seriesId: number, notes: string, baseline: string): Promise<void> {
 const data = read(), record = data.series?.find(series => series.ao3_series_id === seriesId)
 if (!record) throw new Error('Load the series details before adding a note.')
 const base = { notes: record.notes }, review = mergeEdits({ notes: baseline }, { notes }, base)
 if (review.conflicts.length) throw new EditConflict({ ...review, base }, choices => saveSampleSeriesNote(seriesId, String(choices.notes ?? ''), record.notes))
 record.notes = String(review.merged.notes ?? ''); record.updated_at = new Date().toISOString(); write(data)
}

export async function updateSampleSeries(seriesId: number, values: EditValues, baseline: EditValues): Promise<void> {
 const data = read(), record = data.series?.find(series => series.ao3_series_id === seriesId)
 if (!record) throw new Error('Load the series details first.')
 const base = { rec: record.is_rec ?? false, favorite: record.is_favorite ?? false, collections: record.collectionIds ?? [] }, review = mergeEdits(baseline, values, base)
 if (review.conflicts.length) throw new EditConflict({ ...review, base }, choices => updateSampleSeries(seriesId, resolveEdits(review.merged, choices), base))
 const ids = review.merged.collections as string[]
 if (ids.some(id => !data.collections.some(collection => collection.id === id && !collection.default_key && !collection.automatic_rules))) throw new Error('Collection unavailable.')
 const now = new Date().toISOString()
 for (const collection of data.collections) if (ids.includes(collection.id) && !record.collectionIds?.includes(collection.id)) collection.last_story_added_at = now
 Object.assign(record, { is_rec: review.merged.rec, is_favorite: review.merged.favorite, collectionIds: ids, updated_at: now }); write(data)
}
export async function finishSampleSeries(seriesId: number) {
 const data = read()
 const record = data.series?.find(series => series.ao3_series_id === seriesId)
 if (!record) throw new Error('Load the series details first.')
 Object.assign(record, { reading_status: 'finished', updated_at: new Date().toISOString() })
 const series = librarySeries(data.stories, data.series).find(series => series.seriesId === seriesId)!
 for (const story of series.savedStories) {
  const previous = { ...story }, at = new Date().toISOString()
  Object.assign(story, { reading_status: 'finished', last_read_chapter: Math.max(story.last_read_chapter, story.metadata.published_chapters ?? story.metadata.total_chapters ?? 0), updated_at: at })
  recordReadingTransition(story, previous, at)
 }
 write(data)
 return series.savedStories.length
}
