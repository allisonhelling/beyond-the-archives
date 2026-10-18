import { readBoundedBody } from './read-body.ts'
import { parseSeriesUrl } from '../../src/features/imports/urls.ts'
import { parseSeries, retrieveSeries } from './series.ts'

type Dependencies = {
 authenticate(token: string): Promise<boolean>
 reserve(): Promise<boolean>
 pause(seconds: number, reason: string): Promise<void>
 retrieve?: typeof retrieveSeries
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
   try { url = parseSeriesUrl(input.url).normalizedUrl } catch { return reply({ error: 'Enter a valid AO3 series URL.' }, 400) }
   if (input.html !== undefined) {
    if (typeof input.html !== 'string') return reply({ error: 'Invalid snapshot.' }, 400)
    return reply({ preview: parseSeries(input.html, url) })
   }
   if (!await deps.reserve()) return reply({ error: 'AO3 retrieval is busy or paused. Retry this series shortly, or skip it and continue.' }, 429)
   const result = await (deps.retrieve ?? retrieveSeries)(url)
   if (result.failure) {
    if (result.failure.pauseSeconds) await deps.pause(result.failure.pauseSeconds, result.failure.category ?? 'series_preview')
    return reply({ error: 'Could not preview this series. AO3 may require sign-in or be unavailable. Retry later, use the browser extension, or skip this series.' }, 422)
   }
   return reply({ preview: result.preview })
  } catch (error) { return reply({ error: error instanceof Error && /Series preview|different series|more pages/.test(error.message) ? error.message : 'Could not preview this series. Retry or skip it to continue.' }, 422) }
 }
}
