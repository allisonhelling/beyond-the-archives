import { failure, parseMetadata, type RetrievalResult } from './adapter.ts'
import { validateMetadata } from './metadata-service.ts'
import { parseWorkUrl } from '../../src/features/imports/urls.ts'

export type ExtensionJob = { id: string; userId: string; token: string; workId: number; expiresAt: string; status: string; mode: string }
type Dependencies = {
 authenticate(token: string): Promise<string | null>
 job(id: string): Promise<ExtensionJob | null>
 finish(job: ExtensionJob, result: RetrievalResult): Promise<boolean>
}
/** Authentication and an owner-bound live lease precede all parsing and writes. */
export function extensionHandler(deps: Dependencies) {
 return async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin') ?? ''
  const headers = { 'Access-Control-Allow-Origin': /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ? origin : 'null', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', Vary: 'Origin' }
  const reply = (body: object, status = 200) => Response.json(body, { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  try {
   const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
   const user = token ? await deps.authenticate(token) : null
   if (!user) return reply({ error: 'Sign in to your library again.' }, 401)
   // Bound streamed input even without a trustworthy Content-Length.
   const reader = request.body?.getReader()
   if (!reader) return reply({ error: 'Missing request.' }, 400)
   const decoder = new TextDecoder()
   let body = '', bytes = 0
   for (;;) {
    const part = await reader.read()
    if (part.done) break
    bytes += part.value.byteLength
    if (bytes > 1_000_000) { await reader.cancel(); return reply({ error: 'Snapshot too large.' }, 413) }
    body += decoder.decode(part.value, { stream: true })
   }
   body += decoder.decode()
   let input: { jobId?: unknown; token?: unknown; url?: unknown; html?: unknown; timedOut?: unknown }
   try { input = JSON.parse(body) } catch { return reply({ error: 'Invalid request.' }, 400) }
   if (!input || typeof input.jobId !== 'string' || typeof input.token !== 'string') return reply({ error: 'Invalid request.' }, 400)
   const job = await deps.job(input.jobId)
   if (!job || job.userId !== user || job.mode !== 'extension' || job.status !== 'processing' || job.token !== input.token || Date.parse(job.expiresAt) <= Date.now()) return reply({ error: 'Request expired, cancelled, or unavailable.' }, 409)
   let result: RetrievalResult
   if (input.timedOut === true) result = failure('extension_waiting', 'The browser did not supply a loaded work within five minutes. Complete AO3 sign-in or confirmation, then retry from import history.', true)
   else {
    if (typeof input.url !== 'string' || typeof input.html !== 'string') return reply({ error: 'Missing page snapshot.' }, 400)
    try { if (parseWorkUrl(input.url).workId !== job.workId) return reply({ error: 'Work identity mismatch.' }, 400) }
    catch { return reply({ error: 'Unsupported work URL.' }, 400) }
    result = validateMetadata(parseMetadata(input.html, job.workId, input.url))
    if (!result.metadata) return reply({ waiting: true, category: result.category })
   }
   const committed = await deps.finish(job, result)
   return reply({ committed }, committed ? 200 : 409)
  } catch { return reply({ error: 'Could not process browser metadata. Retry shortly.' }, 503) }
 }
}
