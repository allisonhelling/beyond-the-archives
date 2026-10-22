import { createClient } from 'npm:@supabase/supabase-js@2'
import { backupHandler } from '../../../server/backups/handler.ts'
import { supabaseBackupStore } from '../../../server/backups/store.ts'

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
 auth: { persistSession: false, autoRefreshToken: false },
 global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(90_000) }) },
})
Deno.serve(backupHandler(supabaseBackupStore(client)))
