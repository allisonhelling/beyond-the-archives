export const backupFileLimit = 50 * 1024 * 1024
export const backupRetentionCount = 3
export const backupBucket = 'library-backups'
const libraryBackupVersions = [1, 2, 3] as const
export type LibraryBackupVersion = typeof libraryBackupVersions[number]
export function isLibraryBackupVersion(value: unknown): value is LibraryBackupVersion {
 return libraryBackupVersions.some(version => version === value)
}
export type SavedBackup = { name: string; path: string; createdAt: string; size: number }
export const backupTables = ['works', 'authors', 'fandoms', 'tags', 'work_authors', 'work_fandoms', 'work_tags',
  'metadata_preferences', 'library_entries', 'collections', 'personal_tags', 'library_series', 'collection_works',
  'library_entry_tags', 'collection_series', 'import_batches', 'import_items', 'metadata_jobs', 'processing_logs', 'reading_records'] as const
