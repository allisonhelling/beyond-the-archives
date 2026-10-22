import { backupRetentionCount } from '../../src/types/backups.ts'
import { retainLatestBackups, type BackupDependencies } from './handler.ts'

/** Used for existing accounts at rollout and retryable maintenance thereafter. */
export async function pruneAccountBackups(store: BackupDependencies, user: string) {
 if ((await store.files(user)).length <= backupRetentionCount) return true
 const claim = await store.claim(user,false)
 if ('error' in claim) return false
 try { await retainLatestBackups(store,user); return true }
 finally { await store.release(user,claim.token) }
}
