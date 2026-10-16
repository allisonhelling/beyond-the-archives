import { createClient } from 'npm:@supabase/supabase-js@2'
import { runWorkerOnce, supabaseJobStore } from '../../../server/ao3/worker.ts'
// Scheduling uses a dedicated random secret, never a browser token or caller-supplied owner ID.
Deno.serve(async (request: Request) => {
 const token = Deno.env.get('IMPORT_WORKER_TOKEN')
 if (!token || request.headers.get('Authorization') !== `Bearer ${token}`) return new Response('Unauthorized', { status: 401 })
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
 try {
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await runWorkerOnce(supabaseJobStore(client))
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
 } catch { return new Response('Worker failed; persisted lease recovery will resume processing.', { status: 503 }) }
})
