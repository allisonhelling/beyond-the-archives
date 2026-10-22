import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { dateFormatKey } from '../../lib/dates'
import { displaySettingsKey } from '../library/display-settings'
import { readingPreferencesKey, collectionSortKey } from '../library/browsing'
import { pageSizeKey } from '../library/page-size'
import { backupBucket, backupFileLimit, type SavedBackup } from '../../types/backups'

// Explicit allowlist: never export Supabase sessions or device credentials.
export const browserPreferenceKeys = [dateFormatKey, displaySettingsKey, pageSizeKey,
  readingPreferencesKey, collectionSortKey] as const

export { backupBucket }
export type { SavedBackup }
export class BackupRequestError extends Error {}
function client() {
  if (!supabase || sampleMode) throw new Error('Backups require a connected library.')
  return supabase
}

async function createBackup() {
  // Read local preferences before requesting a snapshot: storage errors must not
  // silently produce a backup missing part of the user's settings.
  const browser_preferences = Object.fromEntries(browserPreferenceKeys.map(key => [key, localStorage.getItem(key)]))
  const { data, error } = await client().rpc('export_library_backup')
  if (error || !data || typeof data !== 'object' || Array.isArray(data)
    || data.format !== 'between-chapters-backup' || data.version !== 1 || !data.tables || typeof data.user_id !== 'string') {
    throw new Error('Backup snapshot unavailable.')
  }
  const backup = { ...data, browser_preferences }
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const filename = `between-chapters-backup-${String(data.exported_at).replace(/[^0-9TZ]/g, '-')}.json`
  return { blob, filename }
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  try { link.click() } finally {
    link.remove()
    // Give Safari time to consume the download before releasing the object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

export async function exportBackup() {
  const { blob, filename } = await createBackup()
  downloadFile(blob, filename)
}

export async function saveBackup() {
  const { blob } = await createBackup()
  // Native compression avoids a dependency and keeps the rich 10,000-work
  // fixture below 5 MB. Older browsers can still store an uncompressed JSON file.
  const compressed = typeof CompressionStream !== 'undefined'
  const content = compressed ? await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob() : blob
  if (content.size > backupFileLimit) throw new BackupRequestError('Backup exceeds the 50 MiB storage limit. Download a copy instead.')
  await backupService('POST', content, compressed ? 'application/gzip' : 'application/json')
}

async function backupService(method: 'GET' | 'POST', body?: Blob, contentType?: string): Promise<SavedBackup[]> {
  const { data, error } = await client().functions.invoke('save-backup', {
    method, ...(body && { body, headers: { 'Content-Type': contentType! } }),
  })
  if (error) {
    const response = error.context instanceof Response ? await error.context.json().catch(() => ({})) : {}
    const messages: Record<string, string> = {
      unauthorized: 'Sign in to view or save backups.',
      rate_limited: 'You can save one backup per minute. Wait a minute, then try again. Downloaded backups are unrestricted.',
      busy: 'Another backup request is still running. Try again shortly.',
      cleanup_pending: 'Your backup was uploaded, but older-copy cleanup could not finish. Refresh Saved Backups to retry cleanup.',
      too_large: 'Backup exceeds the 50 MiB storage limit. Download a copy instead.',
    }
    throw new BackupRequestError(messages[response.error] ?? 'Could not access saved backups. Check your connection and try again.')
  }
  if (!Array.isArray(data?.backups)) throw new BackupRequestError('Saved backups are unavailable. Please try again.')
  return data.backups as SavedBackup[]
}

export function listSavedBackups(): Promise<SavedBackup[]> {
  return backupService('GET')
}

export async function downloadSavedBackup(backup: SavedBackup) {
  const { data, error } = await client().storage.from(backupBucket).download(backup.path)
  if (error || !data) throw new Error('Could not download your saved backup. Please try again.')
  downloadFile(data, backup.name)
}

export async function deleteSavedBackup(backup: SavedBackup) {
  const { error } = await client().storage.from(backupBucket).remove([backup.path])
  if (error) throw new Error('Could not delete your saved backup. Please try again.')
}
