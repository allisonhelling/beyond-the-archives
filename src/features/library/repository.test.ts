import { beforeEach, expect, it, vi } from 'vitest'
import { blankMetadata } from './model'
const state = vi.hoisted(() => ({ data: {} as Record<string, Record<string, unknown>[]>, calls: [] as string[], fail: false }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: (table: string) => ({ select: () => {
  const query = { order: () => query, range: async (from: number, to: number) => {
    state.calls.push(`${table}:${from}`)
    return { data: (state.data[table] ?? []).slice(from, to + 1), error: state.fail ? { code: 'offline' } : null }
  } }; return query
} }) } }))
import { loadLibrary } from './repository'
beforeEach(() => { state.data = {}; state.calls = []; state.fail = false })
it('loads beyond the API response cap without losing private tags and memberships', async () => {
  state.data.library_entries = Array.from({ length: 1001 }, (_, n) => ({ id: `entry-${n}`, work_id: `work-${n}`, metadata_overrides: { ...blankMetadata, title: `Story ${n}`, authors: ['Manual author'] } }))
  state.data.works = Array.from({ length: 1001 }, (_, n) => ({ id: `work-${n}` }))
  state.data.collections = [{ id: 'shelf', name: 'My collection' }]
  state.data.collection_works = Array.from({ length: 1001 }, (_, n) => ({ library_entry_id: `entry-${n}`, collection_id: 'shelf' }))
  state.data.personal_tags = [{ id: 'tag', name: 'Private label' }]
  state.data.library_entry_tags = Array.from({ length: 1001 }, (_, n) => ({ library_entry_id: `entry-${n}`, personal_tag_id: 'tag' }))
  const result = await loadLibrary()
  expect(result.stories).toHaveLength(1001)
  expect(result.stories[1000]).toMatchObject({ metadata: { title: 'Story 1000' }, collectionIds: ['shelf'], personalTags: ['Private label'] })
  expect(state.calls).toContain('library_entry_tags:1000')
})
it('reports load failures instead of displaying an empty or partially loaded library', async () => {
  state.fail = true
  await expect(loadLibrary()).rejects.toThrow('Could not load your library')
})

it('overlays private extension metadata consistently while preserving manual corrections and shared data', async () => {
  state.data.library_entries = [{ id: 'entry', work_id: 'work', metadata_overrides: { title: 'My correction' }, extension_metadata: { title: 'Browser title', authors: ['Browser author'], published_chapters: 6, is_complete: false, ao3_updated_at: '2026-10-16T00:00:00Z', additional_tags: ['Zulu', 'Alpha'] }, extension_chapters: { 2: '920' } }]
  state.data.works = [{ id: 'work', title: 'Shared title', published_chapters: 3, is_complete: true, verified_chapters: {} }]
  const { stories } = await loadLibrary()
  expect(stories[0].metadata).toMatchObject({ title: 'My correction', authors: ['Browser author'], publication_status: 'in_progress', published_chapters: 6, additional_tags: ['Zulu', 'Alpha'] })
  expect(stories[0].work).toMatchObject({ ao3_updated_at: '2026-10-16T00:00:00Z', verified_chapters: { 2: '920' } })
  expect(state.data.works[0].title).toBe('Shared title')
})

it('loads AO3 tag categories per work and preserves private category overrides', async () => {
  state.data.library_entries = [{ id: 'entry', work_id: 'work', metadata_overrides: { ...blankMetadata, title: 'A story', additional_tags: ['Private freeform'] } }]
  state.data.works = [{ id: 'work' }]
  state.data.tags = [{ id: 'relationship', name: 'A/B', category: 'relationship' }, { id: 'character', name: 'A', category: 'character' }, { id: 'freeform', name: 'Adventure/Action', category: 'freeform' }, { id: 'other', name: 'Other work character', category: 'character' }]
  state.data.work_tags = [{ work_id: 'work', tag_id: 'relationship' }, { work_id: 'work', tag_id: 'character' }, { work_id: 'work', tag_id: 'freeform' }, { work_id: 'another-work', tag_id: 'other' }]
  const { stories } = await loadLibrary()
  expect(stories[0].metadata).toMatchObject({ relationship_tags: ['A/B'], character_tags: ['A'], additional_tags: ['Private freeform'] })
  expect(state.calls).toContain('work_tags:0')
})
