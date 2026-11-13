// Trusted operator utility. Uses the same lease and retention implementation as
// save-backup, including physical deletion through the Storage API.
import { createClient } from '@supabase/supabase-js'
import { verifiedLocalTarget } from '../scripts/local-target.mjs'
import { backupBucket } from '../src/types/backups.ts'
import { supabaseBackupStore } from './backups/store.ts'
import { pruneAccountBackups } from './backups/prune.ts'

try {
 let url = process.env.SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY
 if (process.argv.slice(2).some(arg=>arg!=='--local')) throw new Error('Only local backup pruning is supported.')
 const target = await verifiedLocalTarget({url,secret})
 url=target.url; secret=target.secretKey
 const client = createClient(url,secret,{ auth:{ persistSession:false,autoRefreshToken:false } })
 const store = supabaseBackupStore(client)
 let accounts = 0, skipped = 0
 for (let offset = 0; ; offset += 1000) {
  const { data, error } = await client.storage.from(backupBucket).list('',{ limit:1000,offset,sortBy:{ column:'name',order:'asc' } })
  if (error) throw new Error('Could not list backup accounts. Apply the retention migration first.')
  for (const folder of data) {
   if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folder.name)) continue
   if (!await pruneAccountBackups(store,folder.name)) skipped++
   accounts++
  }
  if (data.length < 1000) break
 }
 console.log(`Backup retention checked for ${accounts} accounts; ${skipped} busy accounts require a retry.`)
 if (skipped) process.exitCode = 1
} catch { console.error('Backup cleanup failed. Existing newer copies are preserved. Check configuration and retry.'); process.exitCode = 1 }
