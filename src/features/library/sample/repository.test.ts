import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadSampleLibrary, resetSampleLibrary, updateSampleEntry, saveSampleStory, saveSampleCollection, deleteSampleCollection, deleteSampleStory, restoreSampleStory, reorderSampleCollections } from './repository'
import { parseWorkUrl, validateProgress } from '../model'

beforeEach(() => {
  // Node 25 also exposes localStorage; use an isolated browser-storage contract.
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value) },
    removeItem: (key: string) => { items.delete(key) },
    clear: () => items.clear(),
  })
})
afterEach(() => vi.unstubAllGlobals())

it('keeps custom order through reload, rename, creation, and deletion', async () => {
  const alpha = await saveSampleCollection('Alpha'), beta = await saveSampleCollection('Beta')
  await reorderSampleCollections([beta, alpha])
  await saveSampleCollection('Zed', beta)
  const extra = await saveSampleCollection('A new shelf')
  expect((await loadSampleLibrary()).collections.map(collection => collection.id)).toEqual([beta, alpha, extra])
  await expect(reorderSampleCollections([beta, beta, extra])).rejects.toThrow('Collections changed')
  await expect(reorderSampleCollections([alpha])).rejects.toThrow('Collections changed')
  await expect(reorderSampleCollections([alpha, beta, 'unknown'])).rejects.toThrow('Collections changed')
  await deleteSampleCollection(beta)
  expect((await loadSampleLibrary()).collections.map(collection => collection.id)).toEqual([alpha, extra])
})

it('includes all supplied works and both series members in the requested reading groups', async () => {
  const { stories } = await loadSampleLibrary()
  expect(stories).toHaveLength(14)
  const counts = Object.fromEntries(['finished', 'waiting_for_updates', 'reading', 're_reading', 'to_read'].map(status => [status, stories.filter(story => story.reading_status === status).length]))
  expect(counts).toEqual({ finished: 6, waiting_for_updates: 2, reading: 2, re_reading: 1, to_read: 3 })
  for (const story of stories) {
    expect(parseWorkUrl(story.original_url).workId).toBe(story.work.ao3_work_id)
    expect(() => validateProgress(story.last_read_chapter, story.metadata)).not.toThrow()
  }
  expect(stories.filter(story => story.metadata.series?.includes('of bards and witches and witchers'))).toHaveLength(2)
  expect(stories.find(story => story.work.ao3_work_id === 8577016)).toMatchObject({ metadata: { published_chapters: null, publication_status: 'unknown' }, work: { canonical_url: null } })
})

it('persists preview changes locally and resets without calling the network', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network in preview'))
  try {
    const original = (await loadSampleLibrary()).stories[0]
    await updateSampleEntry(original.id, { is_favorite: true })
    expect((await loadSampleLibrary()).stories[0].is_favorite).toBe(true)
    resetSampleLibrary()
    expect((await loadSampleLibrary()).stories[0].is_favorite).toBe(false)
    expect(network).not.toHaveBeenCalled()
  } finally { network.mockRestore() }
})

it('supports editing sample notes and collections, preserving the original link', async () => {
  await saveSampleCollection('Weekend reads')
  const { stories, collections } = await loadSampleLibrary()
  const story = stories.find(story => story.work.ao3_work_id === 40090614)!
  await saveSampleStory({ id: story.id, url: `https://archiveofourown.org/works/${story.work.ao3_work_id}`, metadata: story.metadata, status: 'reading', progress: 1, notes: 'Preview note', favorite: true, personalRating: 4, tags: ['Revisit'], collections: [collections[0].id] })
  expect((await loadSampleLibrary()).stories.find(item => item.id === story.id)).toMatchObject({ original_url: story.original_url, notes: 'Preview note', personal_rating: 4, collectionIds: [collections[0].id] })
  await deleteSampleCollection(collections[0].id)
  expect((await loadSampleLibrary()).stories.find(item => item.id === story.id)?.collectionIds).toEqual([])
})

it('persists collection appearance through reload and rename', async () => {
  const id = await saveSampleCollection('Night reads', undefined, { color: '#123456', symbol: 'moon' })
  expect((await loadSampleLibrary()).collections.find(collection => collection.id === id)).toMatchObject({ color: '#123456', symbol: 'moon' })
  await saveSampleCollection('Bedtime reads', id)
  expect((await loadSampleLibrary()).collections.find(collection => collection.id === id)).toMatchObject({ name: 'Bedtime reads', color: '#123456', symbol: 'moon' })
  await expect(saveSampleCollection('Invalid', undefined, { color: 'red', symbol: 'moon' })).rejects.toThrow('valid collection color')
  await expect(saveSampleCollection('Invalid', undefined, { color: '#123456', symbol: 'unknown' })).rejects.toThrow('collection symbol')
})

it('adds verified categories to older sample storage without replacing reading edits', async () => {
  const library = await loadSampleLibrary()
  const story = library.stories.find(item => item.work.ao3_work_id === 40090614)!
  const removed = story.metadata.character_tags![0]
  story.metadata.ao3_tags = story.metadata.ao3_tags.filter(tag => tag !== removed)
  delete story.metadata.relationship_tags; delete story.metadata.character_tags; delete story.metadata.additional_tags
  story.notes = 'Keep this note'; story.last_read_chapter = 1
  window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
  const reloaded = (await loadSampleLibrary()).stories.find(item => item.id === story.id)!
  expect(reloaded.notes).toBe('Keep this note')
  expect(reloaded.last_read_chapter).toBe(1)
  expect(reloaded.metadata.additional_tags).toContain('Time Travel')
  expect(reloaded.metadata.character_tags).not.toContain(removed)
})


it('restores a removed sample story with all private data and original timestamps', async () => {
  const story = (await loadSampleLibrary()).stories[0]
  await saveSampleCollection('Keep')
  const collection = (await loadSampleLibrary()).collections[0]
  const snapshot = { ...story, notes: 'Private note', personalTags: ['Comfort'], collectionIds: [collection.id], personal_rating: 4, is_favorite: true }
  await deleteSampleStory(story.id)
  expect((await loadSampleLibrary()).stories.some(item => item.id === story.id)).toBe(false)
  await restoreSampleStory(snapshot)
  expect((await loadSampleLibrary()).stories.find(item => item.id === story.id)).toEqual(snapshot)
  await expect(restoreSampleStory(snapshot)).rejects.toThrow('already in your library')
})
