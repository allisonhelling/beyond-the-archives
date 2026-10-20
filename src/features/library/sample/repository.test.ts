import { orderCollections, moveCollectionIds } from '../collection-appearance'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addSampleStoriesToCollections, loadSampleLibrary, resetSampleLibrary, updateSampleEntry, saveSampleStory, saveSampleCollection, deleteSampleCollection, deleteSampleStory, restoreSampleStory, saveSampleSeriesNote, updateSampleSeries, finishSampleSeries, reorderSampleCollections, updateSampleCollections, deleteSampleCollections } from './repository'
import { librarySeries, seriesReadingStatus } from '../series'
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
  const alpha = await saveSampleCollection('Zebra'), beta = await saveSampleCollection('Apple')
  expect((await loadSampleLibrary()).collections.map(collection => collection.id)).toEqual([alpha, beta])
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
  expect(stories).toHaveLength(16)
  const counts = Object.fromEntries(['finished', 'waiting_for_updates', 'reading', 're_reading', 'to_read'].map(status => [status, stories.filter(story => story.reading_status === status).length]))
  expect(counts).toEqual({ finished: 6, waiting_for_updates: 2, reading: 2, re_reading: 1, to_read: 5 })
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

it('organizes existing collections by name, creation, story activity, or their saved positions', async () => {
  const ids = []
  for (const name of ['Zebra', 'Apple', 'Middle', 'Empty']) ids.push(await saveSampleCollection(name))
  const collections = (await loadSampleLibrary()).collections.map((collection, index) => ({ ...collection, created_at: `2026-10-${10 + index}T00:00:00Z` }))
  const stories = [
    { collectionIds: [ids[0], ids[1]], updated_at: '2026-10-14T00:00:00Z' },
    { collectionIds: [ids[1]], updated_at: '2026-10-16T00:00:00Z' },
    { collectionIds: [ids[2]], updated_at: '2026-10-15T00:00:00Z' },
  ]
  const names = (order: Parameters<typeof orderCollections>[2]) => orderCollections(collections, stories, order).map(collection => collection.name)
  expect(names('alphabetical')).toEqual(['Apple', 'Empty', 'Middle', 'Zebra'])
  expect(names('created')).toEqual(['Zebra', 'Apple', 'Middle', 'Empty'])
  expect(names('created_newest')).toEqual(['Empty', 'Middle', 'Apple', 'Zebra'])
  expect(names('updated')).toEqual(['Apple', 'Middle', 'Zebra', 'Empty'])
  await reorderSampleCollections(orderCollections(collections, stories, 'alphabetical').map(collection => collection.id))
  const extra = await saveSampleCollection('A new last book')
  const reloaded = (await loadSampleLibrary()).collections
  expect(reloaded.map(collection => collection.id)).toEqual([ids[1], ids[3], ids[2], ids[0], extra])
  expect(orderCollections(reloaded, stories, 'manual').map(collection => collection.id)).toEqual(reloaded.map(collection => collection.id))
})

it('tracks collection additions separately from story edits, removals, and collection renames', async () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date('2026-10-17T01:00:00Z'))
    const first = await saveSampleCollection('First'), second = await saveSampleCollection('Second')
    const story = (await loadSampleLibrary()).stories[0]
    const input = { id: story.id, url: story.original_url, metadata: story.metadata, status: story.reading_status, progress: story.last_read_chapter, notes: story.notes, personalRating: story.personal_rating, favorite: story.is_favorite, tags: story.personalTags, collections: [first] }
    await saveSampleStory(input)
    const firstAdded = (await loadSampleLibrary()).collections.find(collection => collection.id === first)!.last_story_added_at
    vi.setSystemTime(new Date('2026-10-17T02:00:00Z'))
    await saveSampleStory({ ...input, notes: 'An ordinary story edit' })
    expect((await loadSampleLibrary()).collections.find(collection => collection.id === first)!.last_story_added_at).toBe(firstAdded)
    await saveSampleStory({ ...input, collections: [first, second] })
    let library = await loadSampleLibrary()
    expect(orderCollections(library.collections, library.stories, 'edited').map(collection => collection.id)).toEqual([second, first])
    vi.setSystemTime(new Date('2026-10-17T03:00:00Z'))
    await saveSampleStory({ ...input, collections: [second] })
    await saveSampleCollection('Renamed first', first)
    library = await loadSampleLibrary()
    expect(library.collections.find(collection => collection.id === first)!.last_story_added_at).toBe(firstAdded)
    expect(orderCollections(library.collections, library.stories, 'edited').map(collection => collection.id)).toEqual([second, first])
    await saveSampleStory({ ...input, collections: [first, second] })
    library = await loadSampleLibrary()
    expect(orderCollections(library.collections, library.stories, 'edited').map(collection => collection.id)).toEqual([first, second])
  } finally { vi.useRealTimers() }
})

it('saves individual summaries and preserves them during bulk appearance updates', async () => {
  const first = await saveSampleCollection('First', undefined, { color: '#123456', symbol: 'moon' }, '  First summary  ')
  const second = await saveSampleCollection('Second', undefined, { color: '#654321', symbol: 'leaf' }, 'Second summary')
  await updateSampleCollections([first, second], { symbol: 'heart' })
  let collections = (await loadSampleLibrary()).collections
  expect(collections.find(item => item.id === first)).toMatchObject({ name: 'First', color: '#123456', symbol: 'heart', description: 'First summary' })
  expect(collections.find(item => item.id === second)).toMatchObject({ name: 'Second', color: '#654321', symbol: 'heart', description: 'Second summary' })
  await saveSampleCollection('First', first, undefined, '')
  collections = (await loadSampleLibrary()).collections
  expect(collections.find(item => item.id === first)?.description).toBeNull()
  await deleteSampleCollections([first, second])
  expect((await loadSampleLibrary()).collections).toHaveLength(0)
})

it('moves selected collections as an ordered group while leaving other books in order', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  expect(moveCollectionIds(ids, 'c', 'a', ['b', 'c', 'd'])).toEqual(['b', 'c', 'd', 'a', 'e'])
  expect(moveCollectionIds(ids, 'b', 'e', ['b', 'c', 'd'])).toEqual(['a', 'e', 'b', 'c', 'd'])
  expect(moveCollectionIds(ids, 'd', 'a', ['b', 'd'])).toEqual(['b', 'd', 'a', 'c', 'e'])
  expect(moveCollectionIds(ids, 'b', 'c', ['b', 'c'])).toBe(ids)
  expect(moveCollectionIds(ids, 'e', 'b', ['a', 'c'])).toEqual(['a', 'e', 'b', 'c', 'd'])
  expect(ids).toEqual(['a', 'b', 'c', 'd', 'e'])
})

it('finishes abandoned fics only after all known published chapters are read', async () => {
  const original = (await loadSampleLibrary()).stories[0]
  const input = { id: original.id, url: original.original_url, metadata: { ...original.metadata, publication_status: 'abandoned' as const, published_chapters: 3, total_chapters: 8 }, status: 'to_read' as const, progress: 0, notes: '', personalRating: null, favorite: false, collections: [], tags: [] }
  await saveSampleStory(input)
  const saved = async () => (await loadSampleLibrary()).stories.find(story => story.id === original.id)!
  expect((await saved()).reading_status).toBe('to_read')
  await updateSampleEntry(original.id, { last_read_chapter: 2, reading_status: 'reading' })
  expect((await saved()).reading_status).toBe('reading')
  await updateSampleEntry(original.id, { last_read_chapter: 3 })
  expect((await saved()).reading_status).toBe('finished')
  await saveSampleStory({ ...input, progress: 3 })
  expect((await saved()).reading_status).toBe('finished')
  await saveSampleStory({ ...input, metadata: { ...input.metadata, published_chapters: null } })
  expect((await saved()).reading_status).toBe('to_read')
})

it('adds memberships in either direction without replacing personal fields or changing existing activity timestamps', async () => {
  const initial = await loadSampleLibrary(), [first, second] = initial.stories
  const collection = await saveSampleCollection('Night reads'), other = await saveSampleCollection('Weekend reads')
  await addSampleStoriesToCollections([first.id], [collection, other])
  const added = await loadSampleLibrary(), firstSaved = added.stories.find(story => story.id === first.id)!
  expect(firstSaved).toEqual({ ...first, collectionIds: [...first.collectionIds, collection, other] })
  const activity = added.collections.find(item => item.id === collection)!.last_story_added_at
  await addSampleStoriesToCollections([first.id, first.id], [collection])
  expect((await loadSampleLibrary()).collections.find(item => item.id === collection)!.last_story_added_at).toBe(activity)
  await addSampleStoriesToCollections([second.id], [collection])
  const final = await loadSampleLibrary()
  expect(final.stories.find(story => story.id === first.id)).toEqual(firstSaved)
  expect(final.stories.find(story => story.id === second.id)).toEqual({ ...second, collectionIds: [...second.collectionIds, collection] })
  await expect(addSampleStoriesToCollections([first.id], ['missing'])).rejects.toThrow('Collection no longer available')
})

it('merges other-tab personal edits and requires review when both tabs edit notes', async () => {
  const { editSnapshot, EditConflict } = await import('../edit-merge')
  const { updateSampleEntryChecked } = await import('./repository')
  const original = (await loadSampleLibrary()).stories[0], base = editSnapshot(original)
  await updateSampleEntryChecked(original.id, { notes: 'Other tab notes' }, base)
  await updateSampleEntryChecked(original.id, { rating: 5 }, base)
  expect((await loadSampleLibrary()).stories[0]).toMatchObject({ notes: 'Other tab notes', personal_rating: 5 })
  const error = await updateSampleEntryChecked(original.id, { notes: 'My notes' }, base).catch(error => error)
  expect(error).toBeInstanceOf(EditConflict)
  await error.retry({ notes: 'Both notes' })
  expect((await loadSampleLibrary()).stories[0]).toMatchObject({ notes: 'Both notes', personal_rating: 5 })
})

it('seeds the first two play it again works and reuses their metadata for the series page', async () => {
  const { librarySeries } = await import('../series')
  const library = await loadSampleLibrary()
  const series = librarySeries(library.stories, library.series).find(series => series.seriesId === 132147)!
  expect(series).toMatchObject({ title: 'play it again', creators: ['metisket'], begun: '2013-06-29', updated: '2020-08-09', wordCount: 74696, workCount: 3, fandoms: ['Teen Wolf (TV)'] })
  expect(series.works.map(work => [work.workId, work.position, work.title])).toEqual([[862320, 1, 'Play It Again'], [2034597, 2, "This Doesn't Hurt"]])
  expect(series.savedStories).toHaveLength(2)
  expect(series.savedStories.every(story => story.reading_status === 'to_read' && story.last_read_chapter === 0)).toBe(true)
  await saveSampleSeriesNote(132147, 'Read these next.', '')
  expect((await loadSampleLibrary()).series.find(series => series.ao3_series_id === 132147)?.notes).toBe('Read these next.')
})

it('adds the new series to older previews once, preserving edits and removed stories', async () => {
  const library = await loadSampleLibrary(), removed = library.stories[0]
  const edited = library.stories.find(story => story.work.ao3_work_id === 862320)!
  edited.notes = 'Keep my draft'; edited.metadata.title = 'My title'; edited.last_read_chapter = 1
  library.stories = library.stories.filter(story => story.id !== removed.id && story.work.ao3_work_id !== 2034597)
  library.series[0].notes = 'Existing series note'
  delete library.sampleVersion
  window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
  const upgraded = await loadSampleLibrary()
  expect(upgraded.stories.some(story => story.id === removed.id)).toBe(false)
  expect(upgraded.stories.find(story => story.id === edited.id)).toMatchObject({ notes: 'Keep my draft', last_read_chapter: 1, metadata: { title: 'My title' } })
  expect(upgraded.stories.filter(story => story.work.ao3_work_id === 2034597)).toHaveLength(1)
  expect(upgraded.series).toHaveLength(1)
  expect(upgraded.series[0].notes).toBe('Existing series note')
  await deleteSampleStory('sample-entry-2034597')
  expect((await loadSampleLibrary()).stories.some(story => story.work.ao3_work_id === 2034597)).toBe(false)
})

it('organizes a series independently and finishes its works without replacing private fic data', async () => {
 const collection = await saveSampleCollection('Series shelf')
 const initial = await loadSampleLibrary()
 const original = initial.stories.find(story=>story.work.ao3_work_id===862320)!
 const missing = initial.stories.find(story=>story.work.ao3_work_id===2034597)!
 await updateSampleEntry(original.id,{notes:'Keep fic notes',is_favorite:true,personal_rating:4,last_read_chapter:1})
 await updateSampleSeries(132147,{favorite:true,collections:[collection]},{favorite:false,collections:[]})
 expect((await loadSampleLibrary()).stories.find(story=>story.id===original.id)?.collectionIds).toEqual([])
 await deleteSampleStory('sample-entry-2034597')
 expect(await finishSampleSeries(132147)).toBe(1)
 const library = await loadSampleLibrary()
 expect(library.series[0]).toMatchObject({is_favorite:true,reading_status:'finished',collectionIds:[collection]})
 expect(library.stories.find(story=>story.id===original.id)).toMatchObject({reading_status:'finished',last_read_chapter:3,notes:'Keep fic notes',personal_rating:4,is_favorite:true})
 expect(library.stories.find(story=>story.work.ao3_work_id===2034597)).toBeUndefined()
 expect(seriesReadingStatus(librarySeries(library.stories,library.series)[0])).toBe('finished')
 await saveSampleStory({url:'https://archiveofourown.org/works/2034597',metadata:missing.metadata,status:'to_read',progress:0,notes:'New notes',personalRating:null,favorite:false,collections:[],tags:[]})
 const updated = await loadSampleLibrary()
 expect(seriesReadingStatus(librarySeries(updated.stories,updated.series)[0])).toBe('reading')
 expect(updated.stories.find(story=>story.work.ao3_work_id===2034597)?.reading_status).toBe('to_read')
 await deleteSampleCollection(collection)
 expect((await loadSampleLibrary()).series[0].collectionIds).toEqual([])
})

it('finishes an empty series without adding preview works', async () => {
 await loadSampleLibrary()
 await deleteSampleStory('sample-entry-862320')
 await deleteSampleStory('sample-entry-2034597')
 expect(await finishSampleSeries(132147)).toBe(0)
 const library = await loadSampleLibrary()
 expect(library.stories.some(story => [862320,2034597].includes(story.work.ao3_work_id!))).toBe(false)
 expect(seriesReadingStatus(librarySeries(library.stories,library.series)[0])).toBe('finished')
})
