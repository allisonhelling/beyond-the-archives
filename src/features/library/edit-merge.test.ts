import { expect, it } from 'vitest'
import { conflictFromError, mergeEdits } from './edit-merge'

it('merges unrelated edits symmetrically and accepts the same edit on both devices', () => {
 const base = { notes: 'Original', rating: 2, tags: ['A'] }
 for (const [local, saved] of [[{ ...base, notes: 'New' }, { ...base, rating: 5 }], [{ ...base, rating: 5 }, { ...base, notes: 'New' }]]) {
  expect(mergeEdits(base, local, saved)).toEqual({ merged: { notes: 'New', rating: 5, tags: ['A'] }, conflicts: [] })
 }
 expect(mergeEdits(base, { ...base, notes: 'Same' }, { ...base, notes: 'Same' }).conflicts).toEqual([])
})
it('retains both conflicting notes and detects deletions', () => {
 expect(mergeEdits({ notes: 'Original' }, { notes: '' }, { notes: 'Desktop' }).conflicts).toEqual([{ field: 'notes', base: 'Original', local: '', saved: 'Desktop' }])
})
it('compares membership lists as sets and merges metadata at the field level', () => {
 const base = { tags: ['A', 'B'], metadata: { title: 'Original', summary: 'Original' } }
 expect(mergeEdits(base, { tags: ['B', 'A'], metadata: { title: 'Mine' } }, { tags: ['A', 'B', 'C'], metadata: { title: 'Original', summary: 'Theirs' } })).toEqual({ merged: { tags: ['A', 'B', 'C'], metadata: { title: 'Mine', summary: 'Theirs' } }, conflicts: [] })
 expect(mergeEdits(base, { metadata: { title: 'Mine' } }, { metadata: { title: 'Theirs' } }).conflicts[0].field).toBe('metadata.title')
})
it('retries explicit resolutions against the snapshot that was reviewed', async () => {
 const review = { base: { notes: 'Theirs' }, merged: { notes: 'Mine', rating: 5 }, conflicts: [{ field: 'notes', base: 'Old', local: 'Mine', saved: 'Theirs' }] }
 const conflict = conflictFromError({ code: '40001', details: JSON.stringify(review) }, async (values, base) => ({ values, base }))!
 expect(await conflict.retry({ notes: 'Combined' })).toEqual({ values: { notes: 'Combined', rating: 5 }, base: { notes: 'Theirs' } })
 expect(conflictFromError({ code: '40001', details: 'invalid' }, async () => {})).toBeNull()
})
it('reviews status and chapter count together instead of combining incompatible reading positions', () => {
 const review = mergeEdits({ status: 'reading', progress: 3 }, { status: 'reading', progress: 5 }, { status: 'finished', progress: 10 })
 expect(review.conflicts).toEqual([{ field: 'reading', base: { status: 'reading', progress: 3 }, local: { status: 'reading', progress: 5 }, saved: { status: 'finished', progress: 10 } }])
 expect(review.merged).toEqual({ status: 'reading', progress: 5 })
})
