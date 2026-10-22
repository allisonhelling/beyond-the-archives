import type { Database, Json } from '../../types/database'
import { backupFileLimit, backupTables, type SavedBackup } from '../../types/backups'
import { effectiveMetadata, effectiveWork, type Entry, type Work } from '../library/model'
import { groupLinks } from '../library/repository'
import { backupClient, backupBucket, BackupRequestError, browserPreferenceKeys, saveBackup } from './repository'

type Tables = Database['public']['Tables']
export type LibraryBackup = {
  format: 'between-chapters-backup'; version: 1; user_id: string; exported_at: string
  tables: { [K in typeof backupTables[number]]: Tables[K]['Row'][] }
  browser_preferences?: Record<string, string | null>
}
export type RestorePreview = { counts: Record<string, { current: number; backup: number }>; fingerprint: string; exported_at: string }
export type PreparedRestore = { backup: LibraryBackup; preview: RestorePreview; name: string }
const expandedLimit = 128 * 1024 * 1024

/** Preserve the source snapshot privately; account restore never rewrites public metadata. */
export function privateBackupMetadata(backup: LibraryBackup): LibraryBackup {
  const tables = backup.tables, works = new Map(tables.works.map(work => [work.id, work]))
  const tags = new Map(tables.tags.map(tag => [tag.id, tag]))
  const authors = new Map(tables.authors.map(author => [author.id, author]))
  const fandoms = new Map(tables.fandoms.map(fandom => [fandom.id, fandom]))
  const tagLinks = groupLinks([...tables.work_tags].sort((a, b) => (a.source_position ?? Infinity) - (b.source_position ?? Infinity) || a.tag_id.localeCompare(b.tag_id)), link => link.work_id, link => tags.get(link.tag_id)!)
  const authorLinks = groupLinks([...tables.work_authors].sort((a, b) => a.author_id.localeCompare(b.author_id)), link => link.work_id, link => authors.get(link.author_id)!)
  const fandomLinks = groupLinks([...tables.work_fandoms].sort((a, b) => a.fandom_id.localeCompare(b.fandom_id)), link => link.work_id, link => fandoms.get(link.fandom_id)!)
  const entries = tables.library_entries.map((entry: Entry) => {
    const shared = works.get(entry.work_id)
    if (!shared) throw new BackupRequestError('The backup contains a work with missing metadata.')
    const work: Work = effectiveWork(shared, entry)
    // Retain manual overrides separately so Clear correction can still reveal
    // the source snapshot that was present when the backup was created.
    const metadata = effectiveMetadata(work, {}, tagLinks.get(work.id)?.filter(Boolean), authorLinks.get(work.id)?.filter(Boolean), fandomLinks.get(work.id)?.filter(Boolean))
    const fields = Object.fromEntries(['title', 'summary', 'rating', 'word_count', 'published_chapters', 'total_chapters', 'is_complete', 'ao3_published_at', 'ao3_updated_at', 'last_metadata_check', 'last_metadata_success'].map(key => [key, work[key as keyof Work]]))
    return { ...entry, work_status: entry.work_status ?? 'unknown', source_bookmark: entry.source_bookmark ?? {}, extension_metadata: { ...fields, ...metadata } as Json, extension_chapters: work.verified_chapters }
  })
  return { ...backup, tables: { ...tables, library_entries: entries } }
}

export async function readBackup(file: Blob): Promise<LibraryBackup> {
  if (!file.size || file.size > backupFileLimit) throw new BackupRequestError('Choose a JSON or JSON.gz backup file up to 50 MiB.')
  try {
    const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer())
    let stream = file.stream()
    if (magic[0] === 0x1f && magic[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new BackupRequestError('This browser cannot open compressed backups. Use an uncompressed JSON backup or a newer browser.')
      stream = stream.pipeThrough(new DecompressionStream('gzip'))
    }
    let size = 0
    const bounded = stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
      size += chunk.byteLength
      if (size > expandedLimit) throw new BackupRequestError('The expanded backup exceeds the 128 MiB restore limit.')
      controller.enqueue(chunk)
    } }))
    const value = JSON.parse(await new Response(bounded).text())
    if (value?.format !== 'between-chapters-backup' || value.version !== 1 || typeof value.user_id !== 'string'
      || typeof value.exported_at !== 'string' || !Number.isFinite(Date.parse(value.exported_at))
      || !value.tables || backupTables.some(table => !Array.isArray(value.tables[table]) || value.tables[table].some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row)))) {
      throw new BackupRequestError('Unsupported or incomplete backup. Choose a version 1 JSON backup exported by this app.')
    }
    return privateBackupMetadata(value as LibraryBackup)
  } catch (error) {
    throw error instanceof BackupRequestError ? error : new BackupRequestError('The backup could not be read. Choose a valid JSON or JSON.gz backup exported by this app.')
  }
}

export async function prepareRestore(source: File | SavedBackup): Promise<PreparedRestore> {
  let file: Blob
  if ('path' in source) {
    const { data, error } = await backupClient().storage.from(backupBucket).download(source.path)
    if (error || !data) throw new BackupRequestError('Could not read the saved backup. Try again.')
    file = data
  } else file = source
  const backup = await readBackup(file)
  const { data, error } = await backupClient().rpc('preview_library_restore', { p_backup: backup as unknown as Json })
  if (error || !data) throw new BackupRequestError(error?.code === '42501' ? 'Choose a backup from your own account.' : 'This backup could not be validated. Check your connection and backup compatibility, then try again.')
  return { backup, preview: data as unknown as RestorePreview, name: source.name }
}

export async function restoreBackup(prepared: PreparedRestore): Promise<string> {
  // Failure to upload/retain the safety copy aborts before the database request.
  const safety = (await saveBackup())[0]
  if (!safety) throw new BackupRequestError('A safety backup could not be saved. Your library has not been restored.')
  const { data, error } = await backupClient().rpc('restore_own_library_backup', {
    p_backup: prepared.backup as unknown as Json, p_fingerprint: prepared.preview.fingerprint, p_safety_path: safety.path,
  })
  if (error) throw new BackupRequestError(error.code === '40001'
    ? 'Your library changed after preview. Cancel and preview the backup again.'
    : 'Restore did not return success. Reload and check your library before retrying. Your safety backup is available in Saved Backups.')
  // Account restore remaps private IDs to fence stale jobs and avoid collisions.
  const identities = data as Record<string, string> | null
  try {
    for (const key of browserPreferenceKeys) {
      let value = prepared.backup.browser_preferences?.[key]
      if (typeof value === 'string' && key.endsWith(':collection-sort:v1')) {
        const sort = JSON.parse(value)
        for (const field of ['hiddenAutomatic', 'hiddenCustom']) if (Array.isArray(sort?.[field])) sort[field] = sort[field].map((id: string) => identities?.[id] ?? id)
        value = JSON.stringify(sort)
      }
      if (value === null) localStorage.removeItem(key)
      else if (typeof value === 'string') localStorage.setItem(key, value)
    }
  } catch { return 'Your library was restored, but some browser preferences could not be applied. Reload to use your restored library.' }
  return 'Your library and available browser preferences were restored. Reload to use your restored library.'
}
