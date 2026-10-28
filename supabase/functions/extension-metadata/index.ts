import { createClient } from 'npm:@supabase/supabase-js@2'
import { extensionHandler } from '../../../server/ao3/extension-handler.ts'
import { supabaseJobStore } from '../../../server/ao3/worker.ts'

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const store = supabaseJobStore(client)
Deno.serve(extensionHandler({
 async authenticate(token) { const { data, error } = await client.auth.getUser(token); return error ? null : data.user?.id ?? null },
 async job(id) {
  const { data, error } = await client.from('metadata_jobs').select('*, works(ao3_work_id)').eq('id', id).maybeSingle()
  if (error) throw error
  const source = data ? await client.rpc('metadata_job_archive_source', { p_job: data.id }) : null
  if (source?.error) throw source.error
  return data ? { sourceUrl: source?.data ?? undefined, id: data.id, userId: data.user_id, token: data.lease_token, workId: data.works.ao3_work_id, expiresAt: data.lease_until, status: data.status, mode: data.retrieval_mode, chapterDates: data.bookmark_import?.checkChapterDates !== false && data.bookmark_import?.status === 'reading' && Boolean(data.bookmark_import?.date) } : null
 },
 async finish(job, result) { return store.finish({ id: job.id, token: job.token, workId: job.workId, attempt: 0 }, result) },
}))
