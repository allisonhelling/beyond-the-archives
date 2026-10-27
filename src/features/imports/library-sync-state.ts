import type { LibrarySyncState, SyncRepairCounts } from './extension'

export const librarySyncSafetyLimitError = 'Reached the 500-page safety limit. Prepare the saved batch to import it and continue scanning.'

export function isLibrarySyncSafetyLimit(state: { attention?: string; error?: string } | null | undefined) {
 // Recognize checkpoints saved before the companion had a distinct attention type.
 return state?.attention === 'safety_limit' || Boolean(state?.error?.startsWith('Reached the 500-page safety limit.'))
}

/** A work may appear in a bookmark page and several series checkpoints. */
export function librarySyncRepairs(state: Pick<LibrarySyncState, 'repairPages'>): SyncRepairCounts {
 const totals = { metadata: 0, series: 0, reading: 0 }
 for (const key of ['metadata', 'series', 'reading'] as const) {
  const ids = new Set<string>()
  for (const page of Object.values(state.repairPages ?? {})) {
   if (page.ids) for (const id of page.ids[key]) ids.add(id)
   else totals[key] += page[key]
  }
  totals[key] += ids.size
 }
 return totals
}

export function mergeLibrarySyncRepairs(previous: SyncRepairCounts | undefined, next: SyncRepairCounts): SyncRepairCounts {
 const merged = { metadata: Math.max(previous?.metadata ?? 0, next.metadata), series: Math.max(previous?.series ?? 0, next.series), reading: Math.max(previous?.reading ?? 0, next.reading) }
 return next.ids ? { ...merged, ids: Object.fromEntries((['metadata', 'series', 'reading'] as const).map(key => [key, [...new Set([...(previous?.ids?.[key] ?? []), ...next.ids![key]])]])) as NonNullable<SyncRepairCounts['ids']> } : merged
}
