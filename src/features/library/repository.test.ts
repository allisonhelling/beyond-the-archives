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
