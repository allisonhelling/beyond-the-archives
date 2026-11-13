import { sourceLocation, sourceDuplicateFromError } from './story-source'
import { readReadingHistory } from './reading-history'
import { applyAutomaticCollections, automaticCollectionRules, type AutomaticCollectionRules } from './collections/automatic-collections'
import type { Json } from '../../types/database'
import { parseSearch, filterReading } from './reading-search'
import type { SeriesRecord } from './series/series'
import { conflictFromError, editSnapshot, storyEdits, type EditValues } from './edit-merge'
import { supabase } from '../../lib/supabase'
import type { Collection, Entry, Story, StoryInput, Work } from './model'
import { blankMetadata, bookmarkRec, effectiveMetadata, effectiveWork, savedWorkUrl } from './model'
import { compareCollections, normalizeCollectionChanges, type CollectionAppearance } from './collections/collection-appearance'
import { sampleMode } from '../../lib/sample-mode'
function client() { if (!supabase) throw new Error('Database is not configured.'); return supabase }
function failure(error: { code?: string; message?: string } | null) {
  if (error) throw new Error(error.code === '22023' || error.code === '40001' ? error.message ?? 'Reload and review these changes before saving.' : error.code === '23505' ? 'This story is already in your library (or that collection name already exists).' : 'Could not save your changes. Check your connection and input, then try again.')
}
// PostgREST caps each response; fetch every page so memberships cannot be silently lost.
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; status?: number }>, subject = 'your library') {
  const data: T[] = []
  for (let from = 0; ; from += 500) {
    const result = await page(from, from + 499)
    if (result.error || !result.data) {
      const code = result.error && typeof result.error === 'object' && 'code' in result.error && typeof result.error.code === 'string' ? result.error.code : undefined
      throw libraryLoadError(subject, { code }, result.status ?? 500)
    }
    data.push(...result.data)
    if (result.data.length < 500) return data
  }
}
export function groupLinks<T, V>(links: T[], key: (link: T) => string, value: (link: T) => V) {
  const index = new Map<string, V[]>()
  for (const link of links) {
    const id = key(link), values = index.get(id) ?? []
    values.push(value(link)); index.set(id, values)
  }
  return index
}
function orderedRelations<T extends { id: string }, L extends { work_id: string }>(entities: T[], links: L[], entityId: (link: L) => string) {
  const worksByEntity = groupLinks(links, entityId, link => link.work_id)
  const result = new Map<string, T[]>()
  for (const entity of entities) for (const workId of new Set(worksByEntity.get(entity.id) ?? [])) {
    const values = result.get(workId) ?? []; values.push(entity); result.set(workId, values)
  }
  return result
}
export async function loadLibrary(): Promise<{ stories: Story[]; collections: Collection[]; series: SeriesRecord[] }> {
  if (sampleMode) return (await import('./sample/repository')).loadSampleLibrary()
  const db = client()
  const [entries, works, collections, memberships, tags, links, ao3Tags, workTags, authors, workAuthors, fandoms, workFandoms, series, seriesMemberships, crossoverDocuments] = await Promise.all([
    allRows((from, to) => db.from('library_entries').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('works').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('collections').select('*').order('created_at').order('id').range(from, to)),
    allRows((from, to) => db.from('collection_works').select('*').order('library_entry_id').order('collection_id').range(from, to)),
    allRows((from, to) => db.from('personal_tags').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('library_entry_tags').select('*').order('library_entry_id').order('personal_tag_id').range(from, to)),
    allRows((from, to) => db.from('tags').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('work_tags').select('*').order('work_id').order('source_position', { nullsFirst: false }).order('tag_id').range(from, to)),
    allRows((from, to) => db.from('authors').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('work_authors').select('*').order('work_id').order('author_id').range(from, to)),
    allRows((from, to) => db.from('fandoms').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('work_fandoms').select('*').order('work_id').order('fandom_id').range(from, to)),
    allRows((from, to) => db.from('library_series').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('collection_series').select('*').order('library_series_id').order('collection_id').range(from, to)),
    allRows((from, to) => db.from('library_search_documents').select('id,catalog_story').order('id').range(from, to)),
  ])
  const projections = new Map(crossoverDocuments.map(row=>[row.id,row.catalog_story as unknown as Partial<Story>]))
  const worksById = new Map(works.map(work => [work.id, work]))
  const personalTagsById = new Map(tags.map(tag => [tag.id, tag.name]))
  const membershipsByEntry = groupLinks(memberships, link => link.library_entry_id, link => link.collection_id)
  const membershipsBySeries = groupLinks(seriesMemberships, link => link.library_series_id, link => link.collection_id)
  const personalTagsByEntry = groupLinks(links, link => link.library_entry_id, link => personalTagsById.get(link.personal_tag_id) ?? '')
  // The old author/fandom scans followed entity order, not junction order.
  const authorsByWork = orderedRelations(authors, workAuthors, link => link.author_id)
  const fandomsByWork = orderedRelations(fandoms, workFandoms, link => link.fandom_id)
  const tagsById = new Map(ao3Tags.map(tag => [tag.id, tag]))
  const tagsByWork = new Map<string, typeof ao3Tags>()
  for (const link of workTags) {
    const tag = tagsById.get(link.tag_id)
    if (tag) { const linked = tagsByWork.get(link.work_id) ?? []; linked.push(tag); tagsByWork.set(link.work_id, linked) }
  }
  return { series: series.map(record => ({ ...record, collectionIds: membershipsBySeries.get(record.id) ?? [] })), collections: collections.sort(compareCollections), stories: applyAutomaticCollections(entries.map((entry: Entry) => {
    const sharedWork = worksById.get(entry.work_id)
    if (!sharedWork) throw new Error('Story metadata is unavailable. Please reload.')
    const work = effectiveWork(sharedWork, entry)
    return { ...projections.get(entry.id), ...entry, reading_history: readReadingHistory(entry.reading_history), work, metadata: effectiveMetadata(work, entry.metadata_overrides, tagsByWork.get(work.id), authorsByWork.get(work.id), fandomsByWork.get(work.id), entry.work_status), collectionIds: membershipsByEntry.get(entry.id) ?? [], personalTags: personalTagsByEntry.get(entry.id) ?? [] }
  }), collections) }
}
export async function saveStory(input: StoryInput) {
  if (sampleMode) return (await import('./sample/repository')).saveSampleStory(input)
  const edits = storyEdits(input)
  async function save(values: EditValues, base: EditValues | null): Promise<string> {
    const location = input.id && input.url.includes('/bookmarks/') ? null : sourceLocation(input.url)
    const generic = location?.identity.kind === 'url'
    const { data, error } = await client().rpc('save_library_story_checked', { p_id: input.id ?? null, p_url: generic ? location.normalizedUrl : input.url, p_input: { ...values, ...(generic && { submittedUrl: input.url }) }, p_base: base })
    const conflict = conflictFromError(error, save)
    if (conflict) throw conflict
    const duplicate = sourceDuplicateFromError(error)
    if (duplicate) throw duplicate
    failure(error); return data!
  }
  return save(edits, input.base ?? null)
}

export async function saveStoryCollections(story: Story, collections: string[], baseline: string[]) {
  if (story.detailsLoaded === false) {
    const [details] = await loadStories([story.id])
    if (!details) throw new Error('This story is no longer in your library.')
    story = details
  }
  return saveStory({ id: story.id, base: { ...editSnapshot(story), collections: baseline }, url: savedWorkUrl(story), metadata: story.metadata, metadataChanges: {}, status: story.reading_status, progress: story.last_read_chapter, notes: story.notes, personalRating: story.personal_rating, favorite: story.is_favorite, collections, tags: story.personalTags })
}

export async function addStoriesToCollections(storyIds: string[], collectionIds: string[]) {
  if (!storyIds.length || !collectionIds.length) return
  if (sampleMode) return (await import('./sample/repository')).addSampleStoriesToCollections(storyIds, collectionIds)
  const rows = [...new Set(storyIds)].flatMap(library_entry_id => [...new Set(collectionIds)].map(collection_id => ({ library_entry_id, collection_id })))
  const { error } = await client().from('collection_works').upsert(rows, { onConflict: 'collection_id,library_entry_id', ignoreDuplicates: true })
  failure(error)
}
export async function updateEntry(id: string, changes: EntryUpdate, base: EditValues, statusOrigin: 'explicit' | 'derived' | 'preserve' = 'explicit') {
  const keys = { reading_status: 'status', last_read_chapter: 'progress', notes: 'notes', personal_rating: 'rating', is_favorite: 'favorite', is_rec: 'rec' } as const
  const edits: EditValues = { ...((changes.reading_status !== undefined || changes.last_read_chapter !== undefined) && { statusOrigin }), ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [keys[key as keyof EntryUpdate], value])) }
  async function save(values: EditValues, baseline: EditValues): Promise<void> {
    if (sampleMode) return (await import('./sample/repository')).updateSampleEntryChecked(id, values, baseline)
    // Retries also contain the full saved snapshot; this boundary accepts only
    // entry columns and preserves tags, collections and metadata separately.
    const patch = Object.fromEntries(Object.entries(values).filter(([key]) => key === 'statusOrigin' || Object.values(keys).includes(key as typeof keys[keyof typeof keys])))
    const { error } = await client().rpc('update_library_entry_checked', { p_id: id, p_input: patch, p_base: baseline })
    const conflict = conflictFromError(error, save)
    if (conflict) throw conflict
    failure(error)
  }
  return save(edits, base)
}

type EntryUpdate = Pick<Partial<Entry>, 'reading_status' | 'last_read_chapter' | 'is_favorite' | 'is_rec' | 'notes' | 'personal_rating'>
export async function deleteStory(id: string) {
  if (sampleMode) return (await import('./sample/repository')).deleteSampleStory(id)
  const { error } = await client().from('library_entries').delete().eq('id', id); failure(error)
}
export async function restoreStory(story: Story) {
  if (sampleMode) return (await import('./sample/repository')).restoreSampleStory(story)
  const { work: _work, metadata: _metadata, detailsLoaded: _detailsLoaded, collectionIds, personalTags, ...entry } = story
  // Restore only the private entry; shared work metadata never changes during Undo.
  void _work; void _metadata; void _detailsLoaded
  const { error } = await client().rpc('restore_library_story', { p_entry: entry, p_collections: collectionIds, p_tags: personalTags })
  failure(error)
}
export async function saveCollection(name: string, id?: string, appearance?: CollectionAppearance, description?: string, rules?: AutomaticCollectionRules | null) {
  if (!name.trim()) throw new Error('A collection name is required.')
  const changes = { name: name.trim(), ...normalizeCollectionChanges({ ...appearance, ...(description !== undefined && { description }) }), ...(rules !== undefined && { automatic_rules: rules ? automaticCollectionRules(rules.filters) as unknown as Json : null }) }
  if (sampleMode) return (await import('./sample/repository')).saveSampleCollection(name, id, appearance, description, rules)
  const result = await (id ? client().from('collections').update(changes).eq('id', id) : client().from('collections').insert(changes)).select('id').single()
  failure(result.error)
  return result.data!.id
}
export async function updateCollections(ids: string[], changes: Partial<CollectionAppearance>) {
  const patch = normalizeCollectionChanges({ color: changes.color, symbol: changes.symbol })
  if (!ids.length || !Object.keys(patch).length) throw new Error('Choose collections and at least one field to change.')
  if (sampleMode) return (await import('./sample/repository')).updateSampleCollections(ids, patch)
  const { error } = await client().from('collections').update(patch).in('id', ids).is('default_key', null)
  failure(error)
}
export async function deleteCollection(id: string) { return deleteCollections([id]) }
export async function deleteCollections(ids: string[]) {
  if (sampleMode) return (await import('./sample/repository')).deleteSampleCollections(ids)
  const { error } = await client().from('collections').delete().in('id', ids).is('default_key', null); failure(error)
}

export async function reorderCollections(ids: string[]) {
  if (sampleMode) return (await import('./sample/repository')).reorderSampleCollections(ids)
  const { error } = await client().rpc('reorder_collections', { p_ids: ids }); failure(error)
}

export async function loadCatalog(signal?: AbortSignal, worksOnly = false) {
  if (sampleMode) return loadLibrary()
  if (worksOnly) {
    const [rows, collections] = await Promise.all([
      allRows((from,to) => {
        let request = client().from('library_search_documents').select('catalog_story,automatic_memberships:automatic_collection_works(collection_id)').order('id').range(from,to)
        if (signal) request = request.abortSignal(signal)
        return request
      }, 'organizer works for collections'),
      loadCollections(signal),
    ])
    if (signal?.aborted) throw new DOMException('Library request cancelled', 'AbortError')
    return { stories: rows.map(row => storyCatalogEntry({ ...(row.catalog_story as unknown as Story), automaticCollectionIds: row.automatic_memberships.map(link => link.collection_id) })), collections, series: [] as SeriesRecord[] }
  }
  let request = client().rpc('library_catalog')
  if (signal) request = request.abortSignal(signal)
  const { data, error, status } = await request
  if (signal?.aborted) throw new DOMException('Library request cancelled', 'AbortError')
  if (error || !data) throw libraryLoadError('your library', error, status)
  const result = data as unknown as { stories: Story[]; collections: Collection[]; series: SeriesRecord[] }
  result.stories = result.stories.map(storyCatalogEntry)
  result.series = result.series.map(record => ({ ...record, detailsLoaded: false }))
  result.collections.sort(compareCollections)
  return result
}
export async function loadStories(ids: string[]): Promise<Story[]> {
  if (!ids.length) return []
  if (sampleMode) { const wanted = new Set(ids); return (await loadLibrary()).stories.filter(story => wanted.has(story.id)) }
  if (ids.length > 100) {
    const stories: Story[] = []
    for (let from = 0; from < ids.length; from += 100) stories.push(...await loadStories(ids.slice(from, from + 100)))
    return stories
  }
  const { data, error } = await client().rpc('library_story_details', { p_ids: ids })
  if (error) throw new Error('Could not reload the affected works. Check your connection.')
  return ((data ?? []) as unknown as Story[]).map(story => ({ ...story, detailsLoaded: true }))
}
export type LibraryQuery = { availability?: 'unfolded' | 'bookfusion'; reader?: string; mode: 'reading' | 'library' | 'series'; shelf: string; author?: string; filters: import('./reading-search').ReadingFilters }
export type LibraryResults = { revision?: number; suggestions?: { relationships: string[]; characters: string[]; tags: string[]; personalTags?: string[] }; stories: Story[]; series: import('./series/series').LibrarySeries[]; total: number; page: number; pages: number; sections: Record<string, number>; fandoms: { name: string; count: number }[] }
export type LibraryFacets = Pick<LibraryResults, 'suggestions' | 'fandoms'> & { total: number }
export type LibraryNavigation = Record<string, { works: number; series: number; updated_at: string | null }>
export function libraryQueryHasSeries(query: LibraryQuery) {
  return !query.reader && !query.availability && query.author === undefined && query.mode !== 'reading' && (query.mode === 'series' || query.shelf === 'series' || query.filters.showSeries)
}
/** Facets describe the collection pool, independent of page, sort and search filters. */
export function libraryFacetScope(query: LibraryQuery) {
  return { ...(query.reader && { reader: query.reader }), ...(query.availability && { availability: query.availability }), mode: query.mode, shelf: query.mode === 'reading' ? 'view_all' : query.shelf, ...(query.author !== undefined && { author: query.author }), filters: { showSeries: query.filters.showSeries } }
}
function libraryLoadError(subject: string, error: { code?: string } | null, status: number) {
  const reason = error?.code === '57014' ? 'The request took too long. Please try again.'
    : status === 401 || error?.code === 'PGRST301' || error?.code === 'PGRST303' ? 'Your session has expired. Sign in again.'
    : ['PGRST200','PGRST202','PGRST204','42883','42703'].includes(error?.code ?? '') ? 'The library database needs an update. Apply the latest migrations, then retry.'
    : status === 0 ? 'Check your connection and retry.'
    : `Please try again. If this continues, report error ${error?.code || status}.`
  return new Error(`Could not load ${subject}. ${reason}`, { cause: error })
}
export async function loadLibraryFacets(query: LibraryQuery, signal: AbortSignal): Promise<LibraryFacets> {
  const { data, error, status } = await client().rpc('library_query_facets', { p_query: libraryFacetScope(query) }).abortSignal(signal)
  if (signal.aborted) throw new DOMException('Library request cancelled', 'AbortError')
  if (error || !data) throw libraryLoadError('filter suggestions', error, status)
  return data as unknown as LibraryFacets
}
export async function loadLibraryRevision(): Promise<number> {
  const { data, error, status } = await client().rpc('library_revision', {})
  if (error || data === null) throw libraryLoadError('library counts', error, status)
  return data
}
export async function loadLibraryNavigation(signal?: AbortSignal): Promise<{ counts: LibraryNavigation; revision: number }> {
  if (sampleMode) return { counts: {}, revision: 0 }
  let request = client().rpc('library_navigation_snapshot')
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (signal?.aborted) throw new DOMException('Library request cancelled', 'AbortError')
  if (error || !data) throw new Error('Could not load collection counts. Retry loading.')
  return data as unknown as { counts: LibraryNavigation; revision: number }
}
export async function queryLibrary(query: LibraryQuery, page: number, size: number, signal: AbortSignal): Promise<LibraryResults> {
  // Run the same parser/validation before either transport. Literal substring
  // groups preserve escaped operators and avoid unsafe SQL/regex interpolation.
  filterReading([], query.filters)
  const { data, error, status } = await client().rpc('query_library', { p_query: { ...query, includeFacets: false, terms: parseSearch(query.filters.within) }, p_page: page, p_size: size }).abortSignal(signal)
  if (signal.aborted) throw new DOMException('Library request cancelled', 'AbortError')
  if (error) throw libraryLoadError('these results', error, status)
  return data as unknown as LibraryResults
}
export async function loadSeriesRecord(seriesId: number): Promise<SeriesRecord | undefined> {
  if (sampleMode) return (await loadLibrary()).series.find(record => record.ao3_series_id === seriesId)
  const { data, error } = await client().from('library_series').select('*').eq('ao3_series_id', seriesId).maybeSingle()
  if (error) throw new Error('Could not reload this series.')
  if (!data) return undefined
  const links = await allRows((from, to) => client().from('collection_series').select('collection_id').eq('library_series_id', data.id).order('collection_id').range(from, to))
  return { ...data, detailsLoaded: true, collectionIds: links.map(link => link.collection_id) }
}

export function storyCatalogEntry(story: Story): Story {
  return { ...story, detailsLoaded: false,
    metadata: { ...blankMetadata, title: story.metadata.title, authors: story.metadata.authors, fandoms: story.metadata.fandoms, series: story.metadata.series, series_memberships: story.metadata.series_memberships, publication_status: story.metadata.publication_status },
    work: { id: story.work.id, ao3_work_id: story.work.ao3_work_id } as Work,
    source_bookmark: { rec: bookmarkRec(story) }, metadata_overrides: {}, extension_metadata: {}, extension_chapters: {}, notes: '', personalTags: [] }
}

export async function loadAffectedCollections(ids: string[]): Promise<Collection[]> {
  if (!ids.length || sampleMode) return []
  const { data, error } = await client().from('collections').select('*').in('id', ids)
  if (error) throw new Error('Could not reload affected collections.')
  return data ?? []
}
export async function loadCollections(signal?: AbortSignal): Promise<Collection[]> {
  if (sampleMode) return (await loadLibrary()).collections
  const rows = await allRows((from,to) => {
    let request = client().from('collections').select('*').order('created_at').order('id').range(from,to)
    if (signal) request = request.abortSignal(signal)
    return request
  }, 'collections')
  return rows.sort(compareCollections)
}
