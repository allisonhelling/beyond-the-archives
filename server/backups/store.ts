import type { SupabaseClient } from '@supabase/supabase-js'
import { backupBucket } from '../../src/types/backups.ts'
import type { BackupClaim, BackupDependencies, BackupFile } from './handler.ts'

/** Trusted service client only; reused by the endpoint and rollout maintenance. */
export function supabaseBackupStore(client: SupabaseClient): BackupDependencies {
 const bucket = client.storage.from(backupBucket)
 return {
  async authenticate(token) { const { data, error } = await client.auth.getUser(token); return error ? null : data.user?.id ?? null },
  async claim(user, create) {
   const { data, error } = await client.rpc('claim_backup_save', { p_user: user, p_create: create })
   if (error) throw error
   return data as BackupClaim
  },
  async release(user, token) { const { error } = await client.rpc('release_backup_save', { p_user: user, p_token: token }); if (error) throw error },
  async files(user) { const { data, error } = await client.rpc('backup_storage_files', { p_user: user }); if (error) throw error; return data as BackupFile[] },
  async upload(path, bytes, contentType) {
   const { error } = await bucket.upload(path, bytes, { contentType, cacheControl: '0', upsert: false })
   if (error) throw error
  },
  async remove(paths) { const { error } = await bucket.remove(paths); if (error) throw error },
 }
}
