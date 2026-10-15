import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { accountHandler } from '../_shared/account-handler.ts'

const url = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SUPABASE_ANON_KEY')!
const origin = Deno.env.get('APP_ORIGIN')!
if (!url || !key || !origin) throw new Error('Missing server configuration')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(accountHandler(async token => {
  const { data, error } = await client.auth.getUser(token)
  return error ? null : data.user
}, origin))
