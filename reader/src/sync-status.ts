import { operationErrorMessage } from './errors'

export type SyncService = 'cloud' | 'organizer'
export type SyncPhase = 'idle' | 'syncing' | 'success' | 'failed' | 'attention' | 'signed-out'
export type SyncReport = { phase: SyncPhase; detail?: string; checkedAt?: number }
let snapshot: Record<SyncService, SyncReport> = { cloud: { phase: 'idle' }, organizer: { phase: 'idle' } }
const listeners = new Set<() => void>()
export const syncStatusSnapshot = () => snapshot
export function subscribeSyncStatus(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function reportSyncStatus(service: SyncService, phase: SyncPhase, detail?: string) {
  snapshot = { ...snapshot, [service]: { phase, detail, checkedAt: phase === 'success' ? Date.now() : snapshot[service].checkedAt } }
  for (const listener of listeners) listener()
}
export function reportSyncFailure(service: SyncService, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  const signedOut = service === 'cloud' && (status === 401 || ['PGRST301','PGRST303','READER_SIGN_IN_REQUIRED'].includes(String(code)))
  reportSyncStatus(service, signedOut ? 'signed-out' : 'failed', operationErrorMessage(error, 'Check your connection and retry sync.'))
}
