export const backupFileLimit = 50 * 1024 * 1024
export const backupRetentionCount = 3
export const backupBucket = 'library-backups'
export type SavedBackup = { name: string; path: string; createdAt: string; size: number }
export const backupTables = ['works', 'authors', 'fandoms', 'tags', 'work_authors', 'work_fandoms', 'work_tags',
  'metadata_preferences', 'library_entries', 'collections', 'personal_tags', 'library_series', 'collection_works',
  'library_entry_tags', 'collection_series', 'import_batches', 'import_items', 'metadata_jobs', 'processing_logs', 'reading_records'] as const
