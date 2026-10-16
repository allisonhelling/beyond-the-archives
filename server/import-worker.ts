import { createClient } from '@supabase/supabase-js'
import { runWorkerOnce, supabaseJobStore } from './ao3/worker.ts'
const url=process.env.SUPABASE_URL, secret=process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!secret) throw new Error('Set server-only SUPABASE_URL and SUPABASE_SECRET_KEY.')
const store=supabaseJobStore(createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}))
const once=process.argv.includes('--once')
do { try { const result=await runWorkerOnce(store); if(result.claimed) console.log('Metadata job processed.') } catch { console.error('Worker error. Persisted jobs will recover after lease expiry.'); if(once) process.exitCode=1 }
 if(!once) await new Promise(resolve=>setTimeout(resolve,15000))
} while(!once)
