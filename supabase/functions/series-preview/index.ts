import { createClient } from 'npm:@supabase/supabase-js@2'
import { seriesHandler } from '../../../server/ao3/series-handler.ts'
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(seriesHandler({
 async authenticate(token) {
  const { data, error } = await client.auth.getUser(token)
  return !error && !!data.user
 },
 async reserve() { const { data, error } = await client.rpc('reserve_series_preview'); if (error) throw error; return data === true },
 async pause(seconds, reason) { const { error } = await client.rpc('pause_series_preview', { p_seconds: seconds, p_reason: reason }); if (error) throw error },
}))
