import { beforeEach, expect, it, vi } from 'vitest'
import { clearSeriesReviewDraft, readSeriesReviewDraft, saveSeriesReviewDraft, scanReviewScope, type SeriesReviewDraft } from './series-review-draft'
const draft: SeriesReviewDraft = { selected: { 7: [1, 2] }, page: 2, shownSeries: [7], importedIds: [3], readingStatus: 'reading' }
beforeEach(() => {
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
it('isolates drafts by account, scan and batch and clears only the finished review', () => {
 const scope = scanReviewScope('scan', 0), next = scanReviewScope('scan', 3)
 saveSeriesReviewDraft('alice', scope, draft)
 saveSeriesReviewDraft('alice', next, { ...draft, page: 1 })
 expect(readSeriesReviewDraft('bob', scope)).toBeUndefined()
 expect(readSeriesReviewDraft('alice', scanReviewScope('other'))).toBeUndefined()
 clearSeriesReviewDraft('alice', scope)
 expect(readSeriesReviewDraft('alice', scope)).toBeUndefined()
 expect(readSeriesReviewDraft('alice', next)?.page).toBe(1)
})
it('ignores corrupt drafts and bounds retained reviews', () => {
 localStorage.setItem('between-chapters:series-review:v1:alice', '{invalid')
 expect(readSeriesReviewDraft('alice', 'old')).toBeUndefined()
 for (let i = 0; i < 11; i++) saveSeriesReviewDraft('alice', String(i), draft)
 expect(readSeriesReviewDraft('alice', '0')).toBeUndefined()
 expect(readSeriesReviewDraft('alice', '10')).toEqual(draft)
 saveSeriesReviewDraft('alice', 'invalid', { ...draft, selected: { 7: [-1] } })
 expect(readSeriesReviewDraft('alice', 'invalid')).toBeUndefined()
})
