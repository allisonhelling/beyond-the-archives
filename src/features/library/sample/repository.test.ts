import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadSampleLibrary, resetSampleLibrary, updateSampleEntry, saveSampleStory, saveSampleCollection, deleteSampleCollection } from './repository'
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
