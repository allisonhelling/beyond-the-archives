import { readBoundedBody } from './read-body.ts'
import { seriesPageUrl } from '../../src/features/imports/urls.ts'
import { parseSeries } from './series.ts'

type Dependencies = {
 authenticate(token: string): Promise<boolean>

}
/** Previews do not write works, entries, notes, or reading progress. */
export function seriesHandler(deps: Dependencies) {
 return async (request: Request): Promise<Response> => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' }
  const reply = (body: object, status = 200) => Response.json(body, { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  try {
   const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
   if (!token || !await deps.authenticate(token)) return reply({ error: 'Sign in to preview series.' }, 401)
   const body = await readBoundedBody(request.body, 1_000_000)
   if ('error' in body) return reply({ error: body.error === 'missing' ? 'Missing request.' : 'Series snapshot too large.' }, body.error === 'missing' ? 400 : 413)
   const input = JSON.parse(body.text)
   let url: string
   try { url = seriesPageUrl(input.url) } catch { return reply({ error: 'Enter a valid AO3 series URL.' }, 400) }
   if (input.html !== undefined) {
    if (typeof input.html !== 'string') return reply({ error: 'Invalid snapshot.' }, 400)
    return reply({ preview: parseSeries(input.html, url) })
   }
   return reply({ error: 'A desktop companion snapshot is required. Hosted series retrieval has retired.' }, 410)
  } catch (error) { return reply({ error: error instanceof Error && /Series preview|different series|more pages/.test(error.message) ? error.message : 'Could not preview this series. Retry or skip it to continue.' }, 422) }
 }
}
