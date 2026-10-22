export const backupFileLimit = 50 * 1024 * 1024
export const backupRetentionCount = 3
export const backupBucket = 'library-backups'
export type SavedBackup = { name: string; path: string; createdAt: string; size: number }
