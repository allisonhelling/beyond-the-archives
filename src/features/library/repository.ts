import { supabase } from '../../lib/supabase'
import type { Collection, Entry, Story, StoryInput, Work } from './model'
import { effectiveMetadata } from './model'
import { compareCollections, validateCollectionAppearance, type CollectionAppearance } from './collection-appearance'
import { sampleMode } from '../../lib/sample-mode'
function client() { if (!supabase) throw new Error('Database is not configured.'); return supabase }
function failure(error: { code?: string } | null) {
  if (error) throw new Error(error.code === '23505' ? 'This story is already in your library (or that collection name already exists).' : 'Could not save your changes. Check your connection and input, then try again.')
}
// PostgREST caps each response; fetch every page so memberships cannot be silently lost.
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const data: T[] = []
  for (let from = 0; ; from += 500) {
    const result = await page(from, from + 499)
    if (result.error || !result.data) throw new Error('Could not load your library. Check your connection and apply the Phase 2 migration if needed.')
    data.push(...result.data)
    if (result.data.length < 500) return data
  }
}
export async function loadLibrary(): Promise<{ stories: Story[]; collections: Collection[] }> {
  if (sampleMode) return (await import('./sample/repository')).loadSampleLibrary()
  const db = client()
  const [entries, works, collections, memberships, tags, links, ao3Tags, workTags, authors, workAuthors, fandoms, workFandoms] = await Promise.all([
    allRows((from, to) => db.from('library_entries').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('works').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('collections').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('collection_works').select('*').order('library_entry_id').order('collection_id').range(from, to)),
    allRows((from, to) => db.from('personal_tags').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('library_entry_tags').select('*').order('library_entry_id').order('personal_tag_id').range(from, to)),
    allRows((from, to) => db.from('tags').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('work_tags').select('*').order('work_id').order('source_position', { nullsFirst: false }).order('tag_id').range(from, to)),
    allRows((from, to) => db.from('authors').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('work_authors').select('*').order('work_id').order('author_id').range(from, to)),
    allRows((from, to) => db.from('fandoms').select('*').order('id').range(from, to)),
    allRows((from, to) => db.from('work_fandoms').select('*').order('work_id').order('fandom_id').range(from, to)),
  ])
  const tagsById = new Map(ao3Tags.map(tag => [tag.id, tag]))
  const tagsByWork = new Map<string, typeof ao3Tags>()
  for (const link of workTags) {
    const tag = tagsById.get(link.tag_id)
    if (tag) { const linked = tagsByWork.get(link.work_id) ?? []; linked.push(tag); tagsByWork.set(link.work_id, linked) }
  }
  return { collections: collections.sort(compareCollections), stories: entries.map((entry: Entry) => {
    const sharedWork = works.find((w: Work) => w.id === entry.work_id)
    if (!sharedWork) throw new Error('Story metadata is unavailable. Please reload.')
    // Overlay private automatic metadata before the existing manual-override merge.
    // All work consumers (dates, chapter links, search) see the same effective data.
    const browser = entry.extension_metadata && typeof entry.extension_metadata === 'object' && !Array.isArray(entry.extension_metadata) ? entry.extension_metadata : {}
    const fields = Object.fromEntries(Object.entries(browser).filter(([key]) => ['title','summary','rating','word_count','published_chapters','total_chapters','is_complete','ao3_published_at','ao3_updated_at','last_metadata_check','last_metadata_success'].includes(key)))
    const work = { ...sharedWork, ...fields, automatic_metadata: { ...(sharedWork.automatic_metadata as object), ...browser }, verified_chapters: entry.extension_chapters && Object.keys(entry.extension_chapters).length ? entry.extension_chapters : sharedWork.verified_chapters } as Work
    return { ...entry, work, metadata: effectiveMetadata(work, entry.metadata_overrides, tagsByWork.get(work.id), authors.filter(a => workAuthors.some(link => link.work_id === work.id && link.author_id === a.id)), fandoms.filter(f => workFandoms.some(link => link.work_id === work.id && link.fandom_id === f.id))), collectionIds: memberships.filter(m => m.library_entry_id === entry.id).map(m => m.collection_id), personalTags: links.filter(l => l.library_entry_id === entry.id).map(l => tags.find(t => t.id === l.personal_tag_id)?.name ?? '') }
  }) }
}
export async function saveStory(input: StoryInput) {
  if (sampleMode) return (await import('./sample/repository')).saveSampleStory(input)
  const { data, error } = await client().rpc('save_library_story', { p_url: input.url, p_metadata: input.metadataChanges ?? input.metadata, p_status: input.status, p_progress: input.progress, p_notes: input.notes, p_rating: input.personalRating, p_favorite: input.favorite, p_collections: input.collections, p_tags: input.tags, p_id: input.id ?? null })
  failure(error); return data!
}
export async function updateEntry(id: string, changes: EntryUpdate) {
  if (sampleMode) return (await import('./sample/repository')).updateSampleEntry(id, changes)
  const { data, error } = await client().from('library_entries').update(changes).eq('id', id).select('id').single()
  failure(error); if (!data) throw new Error('Story no longer available.')
}
type EntryUpdate = Pick<Partial<Entry>, 'reading_status' | 'last_read_chapter' | 'is_favorite' | 'notes' | 'personal_rating'>
export async function deleteStory(id: string) {
  if (sampleMode) return (await import('./sample/repository')).deleteSampleStory(id)
  const { error } = await client().from('library_entries').delete().eq('id', id); failure(error)
}
export async function restoreStory(story: Story) {
  if (sampleMode) return (await import('./sample/repository')).restoreSampleStory(story)
  const { work: _work, metadata: _metadata, collectionIds, personalTags, ...entry } = story
  // Restore only the private entry; shared work metadata never changes during Undo.
  void _work; void _metadata
  const { error } = await client().rpc('restore_library_story', { p_entry: entry, p_collections: collectionIds, p_tags: personalTags })
  failure(error)
}
export async function saveCollection(name: string, id?: string, appearance?: CollectionAppearance) {
  if (!name.trim()) throw new Error('A collection name is required.')
  if (appearance) validateCollectionAppearance(appearance)
  if (sampleMode) return (await import('./sample/repository')).saveSampleCollection(name, id, appearance)
  const changes = { name: name.trim(), ...appearance }
  const result = await (id ? client().from('collections').update(changes).eq('id', id) : client().from('collections').insert(changes)).select('id').single()
  failure(result.error)
  return result.data!.id
}
export async function deleteCollection(id: string) {
  if (sampleMode) return (await import('./sample/repository')).deleteSampleCollection(id)
  const { error } = await client().from('collections').delete().eq('id', id); failure(error)
}

export async function reorderCollections(ids: string[]) {
  if (sampleMode) return (await import('./sample/repository')).reorderSampleCollections(ids)
  const { error } = await client().rpc('reorder_collections', { p_ids: ids }); failure(error)
}
