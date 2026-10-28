import { statuses, type Status } from '../library/model'
import { extractUrls } from './urls'

export type SeriesReviewDraft = { selected: Record<number, number[]>; page: number; shownSeries: number[]; importedIds: number[]; readingStatus: Status }
export const seriesReviewScope = (text: string) => `links:${[...new Set(extractUrls(text))].sort().join('\n')}`
export const scanReviewScope = (id: string, batchStart = 0) => `scan:${id}:${batchStart}`
const storageKey = (owner: string) => `between-chapters:series-review:v1:${owner}`
function drafts(owner: string): Record<string, SeriesReviewDraft> {
 try { const value = JSON.parse(localStorage.getItem(storageKey(owner)) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} }
}
const validIds = (value: unknown): value is number[] => Array.isArray(value) && value.every(id => Number.isSafeInteger(id) && id > 0)
export function readSeriesReviewDraft(owner: string, scope: string): SeriesReviewDraft | undefined {
 const draft = drafts(owner)[scope]
 if (!draft || !Number.isSafeInteger(draft.page) || draft.page < 1 || !validIds(draft.shownSeries) || !validIds(draft.importedIds)
  || !Object.hasOwn(statuses, draft.readingStatus) || !draft.selected || typeof draft.selected !== 'object'
  || !Object.entries(draft.selected).every(([id, ids]) => /^[1-9]\d*$/.test(id) && validIds(ids))) return undefined
 return draft
}
export function saveSeriesReviewDraft(owner: string, scope: string, draft: SeriesReviewDraft): boolean {
 try {
  const entries = Object.entries(drafts(owner)).filter(([key]) => key !== scope).slice(-9)
  localStorage.setItem(storageKey(owner), JSON.stringify(Object.fromEntries([...entries, [scope, draft]])))
  return true
 } catch { return false }
}
export function clearSeriesReviewDraft(owner: string, scope: string) {
 try { const saved = drafts(owner); delete saved[scope]; localStorage.setItem(storageKey(owner), JSON.stringify(saved)) } catch { /* A stale draft cannot import works without confirmation. */ }
}
