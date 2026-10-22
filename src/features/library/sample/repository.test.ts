import { automaticCollectionRules } from '../automatic-collections'
import { defaultReadingFilters } from '../reading-search'
import { orderCollections, moveCollectionIds } from '../collection-appearance'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addSampleStoriesToCollections, loadSampleLibrary, resetSampleLibrary, updateSampleEntry, saveSampleStory, saveSampleCollection, deleteSampleCollection, deleteSampleStory, restoreSampleStory, saveSampleSeriesNote, updateSampleSeries, finishSampleSeries, reorderSampleCollections, updateSampleCollections, deleteSampleCollections } from './repository'
import { librarySeries, seriesReadingStatus } from '../series'
import { parseWorkUrl, validateProgress } from '../model'

beforeEach(async () => {
  // Node 25 also exposes localStorage; use an isolated browser-storage contract.
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value) },
    removeItem: (key: string) => { items.delete(key) },
    clear: () => items.clear(),
  })
  // Organization tests start empty; the design-preview seed is covered separately.
  await deleteSampleCollections((await loadSampleLibrary()).collections.map(collection => collection.id))
})
afterEach(() => vi.unstubAllGlobals())

it('seeds separate spine design collections and preserves edits and deletions on reload', async () => {
 resetSampleLibrary()
 const { collections } = await loadSampleLibrary()
 expect(collections.filter(collection => collection.spineDesign).map(collection => collection.spineDesign)).toEqual(['celestial','interlocking-circles','linked-diamonds','book-stack','constellation','deco-crest','star-trails','star-trails-extended','vertical-diamonds','lunar-phases','query-crown'])
 await saveSampleCollection('My celestial shelf', collections[0].id)
 await deleteSampleCollection(collections[1].id)
 const reloaded = await loadSampleLibrary()
 expect(reloaded.collections.find(collection => collection.id === collections[0].id)).toMatchObject({name:'My celestial shelf',spineDesign:'celestial'})
 expect(reloaded.collections.some(collection => collection.id === collections[1].id)).toBe(false)
})

it('adds design samples once to an existing preview without replacing its collections or story edits', async () => {
 const id = await saveSampleCollection('My reads')
 const library = await loadSampleLibrary()
 library.sampleVersion = 3
 library.stories[0].notes = 'Keep this note'
 window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
 const upgraded = await loadSampleLibrary()
 expect(upgraded.collections.find(collection => collection.id === id)).toMatchObject({id,name:'My reads'})
 expect(upgraded.collections.filter(collection => collection.spineDesign)).toHaveLength(11)
 expect(upgraded.stories[0].notes).toBe('Keep this note')
 expect((await loadSampleLibrary()).collections).toHaveLength(13)
})

it('renames the legacy celestial design without changing saved collection identities or memberships', async () => {
 resetSampleLibrary()
 const library = await loadSampleLibrary()
 const collection = library.collections[0]
 Object.assign(collection, { id:'sample-spine-celestial-constellation', name:'My celestial shelf', spineDesign:'celestial-constellation' })
 library.stories[0].collectionIds = [collection.id]
 window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
 const upgraded = await loadSampleLibrary()
 expect(upgraded.collections[0]).toMatchObject({id:collection.id,name:'My celestial shelf',spineDesign:'celestial'})
 expect(upgraded.stories[0].collectionIds).toEqual([collection.id])
 expect((await loadSampleLibrary()).collections).toHaveLength(12)
})

it('adds the latest preview designs without restoring deleted samples or replacing renamed ones', async () => {
 resetSampleLibrary()
 const library = await loadSampleLibrary()
 library.sampleVersion = 4
 library.collections = library.collections.slice(0,4)
 const removed = library.collections.splice(1,1)[0]
 library.collections[0].name = 'My celestial sample'
 window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
 const upgraded = await loadSampleLibrary()
 expect(upgraded.collections.some(collection => collection.id === removed.id)).toBe(false)
 expect(upgraded.collections.find(collection => collection.id === library.collections[0].id)?.name).toBe('My celestial sample')
 expect(upgraded.collections).toHaveLength(11)
 expect(upgraded.collections.filter(collection => ['deco-crest','star-trails','star-trails-extended','vertical-diamonds','constellation'].includes(collection.spineDesign ?? ''))).toHaveLength(5)
 expect((await loadSampleLibrary()).collections).toHaveLength(11)
})

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

it('includes all supplied works and every series member in the requested reading groups', async () => {
  const { stories } = await loadSampleLibrary()
  expect(stories).toHaveLength(28)
  const counts = Object.fromEntries(['finished', 'waiting_for_updates', 'reading', 're_reading', 'to_read'].map(status => [status, stories.filter(story => story.reading_status === status).length]))
  expect(counts).toEqual({ finished: 10, waiting_for_updates: 2, reading: 3, re_reading: 1, to_read: 12 })
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

it('seeds every play it again work and reuses their metadata for the fully loaded series page', async () => {
  const { librarySeries } = await import('../series')
  const library = await loadSampleLibrary()
  const series = librarySeries(library.stories, library.series).find(series => series.seriesId === 132147)!
  expect(series).toMatchObject({ title: 'play it again', creators: ['metisket'], begun: '2013-06-29', updated: '2020-08-09', wordCount: 74696, workCount: 3, fandoms: ['Teen Wolf (TV)'] })
  expect(series.works.map(work => [work.workId, work.position, work.title])).toEqual([[862320, 1, 'Play It Again'], [2034597, 2, "This Doesn't Hurt"], [25794964, 3, 'Kiss of Death']])
  expect(series.savedStories).toHaveLength(3)
  expect(series.detailsLoaded).toBe(true)
  expect(series.record?.metadata).toMatchObject({basic:false,fetchedAt:expect.any(String),works:expect.any(Array)})
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
  expect(upgraded.series).toHaveLength(4)
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
 expect(await finishSampleSeries(132147)).toBe(2)
 const library = await loadSampleLibrary()
 expect(library.series[0]).toMatchObject({is_favorite:true,reading_status:'finished',collectionIds:[collection]})
 expect(library.stories.find(story=>story.id===original.id)).toMatchObject({reading_status:'finished',last_read_chapter:3,notes:'Keep fic notes',personal_rating:4,is_favorite:true})
 expect(library.stories.find(story=>story.work.ao3_work_id===2034597)).toBeUndefined()
 expect(seriesReadingStatus(librarySeries(library.stories,library.series).find(series => series.seriesId === 132147)!)).toBe('finished')
 await saveSampleStory({url:'https://archiveofourown.org/works/2034597',metadata:missing.metadata,status:'to_read',progress:0,notes:'New notes',personalRating:null,favorite:false,collections:[],tags:[]})
 const updated = await loadSampleLibrary()
 expect(seriesReadingStatus(librarySeries(updated.stories,updated.series).find(series => series.seriesId === 132147)!)).toBe('reading')
 expect(updated.stories.find(story=>story.work.ao3_work_id===2034597)?.reading_status).toBe('to_read')
 await deleteSampleCollection(collection)
 expect((await loadSampleLibrary()).series[0].collectionIds).toEqual([])
})

it('finishes an empty series without adding preview works', async () => {
 await loadSampleLibrary()
 await deleteSampleStory('sample-entry-862320')
 await deleteSampleStory('sample-entry-2034597')
 await deleteSampleStory('sample-entry-25794964')
 expect(await finishSampleSeries(132147)).toBe(0)
 const library = await loadSampleLibrary()
 expect(library.stories.some(story => [862320,2034597].includes(story.work.ao3_work_id!))).toBe(false)
 expect(seriesReadingStatus(librarySeries(library.stories,library.series).find(series => series.seriesId === 132147)!)).toBe('finished')
})

it('seeds full and basic series with different saved-work counts and reading states', async () => {
 const library = await loadSampleLibrary(), series = librarySeries(library.stories, library.series)
 const full = series.find(series => series.seriesId === 1030529)!
 expect(full).toMatchObject({ title: 'Point of Divergence', detailsLoaded: true, workCount: 2, savedStories: [{ last_read_chapter: 6 }] })
 expect(full.works).toHaveLength(2)
 expect(full.savedStories).toHaveLength(1)
 expect(seriesReadingStatus(full)).toBe('reading')
 expect(full.works.find(work => work.workId === 14745539)?.title).toBe('Positive Feedback')
 expect(library.stories.some(story => story.work.ao3_work_id === 14745539)).toBe(false)
 for (const [id, count, status, positions, loaded] of [[2404765, 4, 'finished', [1, 2, 3, 4], false], [2888871, 6, 'to_read', [1, 2, 3, 4, 5, 6], true]] as const) {
  const basic = series.find(series => series.seriesId === id)!
  expect(basic.detailsLoaded).toBe(loaded)
  expect(basic.savedStories).toHaveLength(count)
  expect(seriesReadingStatus(basic)).toBe(status)
  expect(basic.works.map(work => work.position)).toEqual(positions)
  if (loaded) {
   expect(basic.workCount).toBe(count)
   expect(basic.works).toHaveLength(count)
  } else {
   expect(basic.workCount).toBeUndefined()
   expect(basic.record?.metadata).toMatchObject({basic:true,works:[]})
  }
 }
})
it('upgrades version two samples without restoring removed old works or overwriting personal edits', async () => {
 const library = await loadSampleLibrary(), ids = new Set([1030529, 2404765, 2888871])
 library.sampleVersion = 2
 library.stories = library.stories.filter(story => !story.metadata.series_memberships?.some(series => ids.has(series.id)) && story.work.ao3_work_id !== 2034597)
 library.series = library.series.filter(series => !ids.has(series.ao3_series_id))
 library.series[0].notes = 'Keep my series note'
 library.stories[0].notes = 'Keep my work note'
 window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
 const upgraded = await loadSampleLibrary()
 expect(upgraded.sampleVersion).toBe(8)
 expect(upgraded.series).toHaveLength(4)
 expect(upgraded.stories.some(story => story.work.ao3_work_id === 2034597)).toBe(true)
 expect(upgraded.series[0].notes).toBe('Keep my series note')
 expect(upgraded.stories[0].notes).toBe('Keep my work note')
 expect(upgraded.stories).toHaveLength(28)
 await deleteSampleStory('sample-entry-11613168')
 expect((await loadSampleLibrary()).stories.some(story => story.work.ao3_work_id === 11613168)).toBe(false)
})

it('renames legacy paused statuses while retaining saved progress', async () => {
 const library = await loadSampleLibrary(), story = library.stories[0]
 const progress = story.last_read_chapter
 window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify({ ...library, stories: library.stories.map(item => item.id === story.id ? { ...item, reading_status: 'continue_later' } : item) }))
 const upgraded = await loadSampleLibrary()
 expect(upgraded.stories.find(item => item.id === story.id)).toMatchObject({ reading_status: 'paused_reading', last_read_chapter: progress })
 expect(JSON.parse(window.localStorage.getItem('between-chapters:sample-library:v1')!).stories.find((item: { id: string }) => item.id === story.id).reading_status).toBe('paused_reading')
})

it('upgrades the existing play it again sample to full details with every work saved once', async () => {
 const library = await loadSampleLibrary()
 library.sampleVersion = 5
 library.stories = library.stories.filter(story => story.work.ao3_work_id !== 25794964)
 const original = library.stories.find(story => story.work.ao3_work_id === 862320)!
 original.notes = 'Keep my notes'; original.last_read_chapter = 1; original.reading_status = 'reading'
 const record = library.series.find(series => series.ao3_series_id === 132147)!
 record.notes = 'Keep series notes'; record.is_favorite = true
 record.metadata = { seriesId:132147, title:'play it again', works:[] }
 window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
 const upgraded = await loadSampleLibrary()
 const series = librarySeries(upgraded.stories, upgraded.series).find(series => series.seriesId === 132147)!
 expect(series.detailsLoaded).toBe(true)
 expect(series.savedStories).toHaveLength(3)
 expect(series.works).toHaveLength(3)
 expect(series.record).toMatchObject({notes:'Keep series notes',is_favorite:true})
 expect(series.savedStories.find(story=>story.id===original.id)).toMatchObject({notes:'Keep my notes',last_read_chapter:1,reading_status:'reading'})
 await deleteSampleStory('sample-entry-25794964')
 expect((await loadSampleLibrary()).stories.some(story=>story.work.ao3_work_id===25794964)).toBe(false)
})

it('adds lunar phases and query crown once to version six samples while preserving edits and deletions', async () => {
 resetSampleLibrary()
 const library = await loadSampleLibrary()
 library.sampleVersion = 6
 library.collections = library.collections.filter(collection => !['lunar-phases','query-crown'].includes(collection.spineDesign ?? ''))
 const removed = library.collections.splice(1,1)[0]
 library.collections[0].name = 'My edited sample'
 const story = library.stories[0]
 story.notes = 'Keep my notes'
 window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
 const upgraded = await loadSampleLibrary()
 expect(upgraded.collections.slice(-2).map(collection => collection.spineDesign)).toEqual(['lunar-phases','query-crown'])
 expect(upgraded.collections[0].name).toBe('My edited sample')
 expect(upgraded.collections.some(collection => collection.id === removed.id)).toBe(false)
 expect(upgraded.stories.find(item => item.id === story.id)?.notes).toBe('Keep my notes')
 expect(upgraded.collections).toHaveLength(11)
 await deleteSampleCollection(upgraded.collections.at(-1)!.id)
 expect((await loadSampleLibrary()).collections).toHaveLength(10)
})

it('keeps automatic collections in sync with saved works and rule edits, independently from manual membership', async () => {
 const rules = automaticCollectionRules({...defaultReadingFilters,fandoms:['Teen Wolf (TV)']})
 const id = await saveSampleCollection('Automatic Teen Wolf',undefined,undefined,undefined,rules)
 let library = await loadSampleLibrary()
 expect(library.stories.filter(story=>story.automaticCollectionIds?.includes(id))).toHaveLength(3)
 const original = library.stories.find(story=>story.work.ao3_work_id===862320)!
 const added = await saveSampleStory({url:'https://archiveofourown.org/works/999999',metadata:original.metadata,status:'to_read',progress:0,notes:'',personalRating:null,favorite:false,collections:[],tags:[]})
 library = await loadSampleLibrary()
 expect(library.stories.find(story=>story.id===added)).toMatchObject({collectionIds:[],automaticCollectionIds:[id]})
 await expect(addSampleStoriesToCollections([added],[id])).rejects.toThrow('determined by its filters')
 await saveSampleCollection('Automatic Teen Wolf',id,undefined,undefined,automaticCollectionRules({...defaultReadingFilters,within:'"Kiss of Death"'}))
 library = await loadSampleLibrary()
 expect(library.stories.filter(story=>story.automaticCollectionIds?.includes(id)).map(story=>story.metadata.title)).toEqual(['Kiss of Death'])
 await deleteSampleCollection(id)
 expect((await loadSampleLibrary()).stories.every(story=>!story.automaticCollectionIds?.includes(id))).toBe(true)
})

it('converts manual sample collections to rule-based membership while preserving their details', async () => {
 const library = await loadSampleLibrary(), original=library.stories.find(story=>story.work.ao3_work_id===862320)!
 const id = await saveSampleCollection('Converted sample',undefined,{color:'#123456',symbol:'moon'},'Keep my summary')
 await addSampleStoriesToCollections([original.id],[id])
 await saveSampleCollection('Converted sample',id,undefined,undefined,automaticCollectionRules({...defaultReadingFilters,within:'"Kiss of Death"'}))
 const updated = await loadSampleLibrary()
 expect(updated.collections.find(collection=>collection.id===id)).toMatchObject({name:'Converted sample',description:'Keep my summary',color:'#123456',symbol:'moon'})
 expect(updated.stories.some(story=>story.collectionIds.includes(id))).toBe(false)
 expect(updated.stories.filter(story=>story.automaticCollectionIds?.includes(id)).map(story=>story.metadata.title)).toEqual(['Kiss of Death'])
})


it('keeps matching sample works when automatic rules are removed and stops future additions', async () => {
 const rules=automaticCollectionRules({...defaultReadingFilters,fandoms:['Teen Wolf (TV)']})
 const id=await saveSampleCollection('Frozen matches',undefined,{color:'#123456',symbol:'sparkle'},undefined,rules)
 const before=await loadSampleLibrary(), matches=before.stories.filter(story=>story.automaticCollectionIds?.includes(id))
 await saveSampleCollection('Frozen matches',id,undefined,undefined,null)
 const after=await loadSampleLibrary()
 expect(after.collections.find(collection=>collection.id===id)?.automatic_rules).toBeNull()
 expect(after.stories.filter(story=>story.collectionIds.includes(id)).map(story=>story.id)).toEqual(matches.map(story=>story.id))
 expect(after.stories.some(story=>story.automaticCollectionIds?.includes(id))).toBe(false)
 const original=matches[0]
 const added=await saveSampleStory({url:'https://archiveofourown.org/works/999999',metadata:original.metadata,status:'to_read',progress:0,notes:'',personalRating:null,favorite:false,collections:[],tags:[]})
 expect((await loadSampleLibrary()).stories.find(story=>story.id===added)?.collectionIds).not.toContain(id)
})


it('seeds One Shots as an editable automatic example without restoring it after deletion', async () => {
 resetSampleLibrary()
 const starter = (await loadSampleLibrary()).collections.find(collection => collection.name === 'One Shots')!
 expect(starter).toMatchObject({ default_key: null, color: '#8b491e', symbol: 'scroll', automatic_rules: automaticCollectionRules({ ...defaultReadingFilters, oneShot: 'only' }) })
 await saveSampleCollection('My one shots', starter.id, { color: '#123456', symbol: 'moon' }, 'My example', automaticCollectionRules({ ...defaultReadingFilters, oneShot: 'exclude' }))
 expect((await loadSampleLibrary()).collections.find(collection => collection.id === starter.id)).toMatchObject({ name: 'My one shots', color: '#123456', symbol: 'moon', automatic_rules: { filters: { oneShot: 'exclude' } } })
 await deleteSampleCollection(starter.id)
 expect((await loadSampleLibrary()).collections.some(collection => collection.id === starter.id)).toBe(false)
})

it('adds the automatic example once to older samples without replacing a same-named custom shelf', async () => {
 const id = await saveSampleCollection('One Shots', undefined, { color: '#123456', symbol: 'moon' })
 const library = await loadSampleLibrary()
 library.sampleVersion = 7
 window.localStorage.setItem('between-chapters:sample-library:v1', JSON.stringify(library))
 const upgraded = await loadSampleLibrary()
 expect(upgraded.collections.filter(collection => collection.name === 'One Shots')).toHaveLength(1)
 expect(upgraded.collections.find(collection => collection.id === id)).toMatchObject({ color: '#123456', symbol: 'moon' })
 await deleteSampleCollection(id)
 expect((await loadSampleLibrary()).collections).toHaveLength(0)
})
