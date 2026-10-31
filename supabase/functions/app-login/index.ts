import { createClient } from 'npm:@supabase/supabase-js@2'
import { appLoginHandler } from '../../../server/app-login.ts'
const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_ANON_KEY')!
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
const origins=[Deno.env.get('APP_ORIGIN')!,Deno.env.get('READER_ORIGIN')!].map(value=>new URL(value).origin)
Deno.serve(appLoginHandler(admin,origins,async tokenHash=>{
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data,error}=await client.auth.verifyOtp({token_hash:tokenHash,type:'email'})
 if(error||!data.session)throw new Error('Sign-in failed')
 return data.session
}))
