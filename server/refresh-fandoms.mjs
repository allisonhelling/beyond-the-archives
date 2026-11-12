// Trusted bounded scheduled pass. Credentials remain in the host environment.
import { createClient } from '@supabase/supabase-js'
import { supabaseFandomWorker } from './ao3/fandom-store.ts'
import { processFandomWork } from './ao3/fandom-worker.ts'
try {
 const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY
 if(!url||!secret)throw new Error('Missing configuration')
 const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data,error}=await client.rpc('pending_fandom_owners',{p_limit:20})
 if(error)throw error
 const worker=supabaseFandomWorker(client)
 let classified=0,fetched=0
 for(const owner of data??[]){const result=await processFandomWork(owner,worker);classified+=result.classified;fetched+=result.fetched}
 console.log(`Fandom enrichment: ${classified} observation sets classified; ${fetched} profiles fetched.`)
}catch{console.error('Fandom enrichment unavailable. Check scheduler configuration and retry.');process.exitCode=1}
