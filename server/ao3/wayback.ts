import { load } from 'cheerio'
import { parseWorkUrl, waybackSnapshot } from '../../src/features/imports/urls.ts'
import { parseMetadata } from './adapter.ts'
import { readBoundedBody } from './read-body.ts'

export type WaybackResult = { url: string; kind: 'work' | 'adult_warning' | 'calendar'; checked: number; reason?: 'not_found' | 'unavailable' | 'unverified' }
const origin = 'https://web.archive.org'
export function classifyCapture(html: string, work: number, url: string): 'work' | 'adult_warning' | null {
 const $ = load(html)
 const main = $('#main').length ? $('#main') : $('body')
 // A login form in the site header is normal; only a login-only main page is rejected.
 if ((!main.find('h2.title').length && main.find('#new_user, form[action="/users/login"]').length) || /This work is only available to registered users|you must be logged in to access/i.test(main.text())) return null
 if (/This work could have adult content/i.test(main.text())) {
  for (const node of main.find('a[href]').toArray()) {
   try {
    const href = new URL($(node).attr('href')!, waybackSnapshot(url)!.targetUrl).href
    if (parseWorkUrl(href).workId === work && new URL(waybackSnapshot(href)?.targetUrl ?? href).searchParams.get('view_adult') === 'true') return 'adult_warning'
   } catch { /* Not a confirmation link to this work. */ }
  }
 }
 return parseMetadata(html, work, url).metadata ? 'work' : null
}
/** Public archive lookup only. Never sends cookies, user tokens, or requests to live AO3. */
export async function findWaybackSnapshot(input: string, fetcher: typeof fetch = fetch): Promise<WaybackResult> {
 const identity = parseWorkUrl(input), work = identity.workId, base = identity.normalizedUrl
 const calendar: WaybackResult = { url: `${origin}/web/*/${base}`, kind: 'calendar', checked: 0, reason: 'not_found' }
 const deadline = AbortSignal.timeout(25_000)
 const variants = [...new Set([base, `${base}?view_adult=true`, `${base}?view_full_work=true`, `${base}?view_adult=true&view_full_work=true`, `${base}?view_full_work=true&view_adult=true`, waybackSnapshot(input)?.targetUrl ?? input])]
 let unavailable = false, indexed = false, blocked = false
 const savedCapture = waybackSnapshot(input)
 const candidates: { timestamp: string; original: string }[] = savedCapture ? [{ timestamp: savedCapture.timestamp, original: savedCapture.targetUrl }] : []
 const request = (url: string) => fetcher(url, { redirect: 'manual', credentials: 'omit', signal: AbortSignal.any([deadline, AbortSignal.timeout(6_000)]), headers: { Accept: url.includes('/cdx/') ? 'application/json' : 'text/html' } })
 // Two index requests at a time, with small, bounded responses.
 for (let index = 0; index < variants.length && !deadline.aborted && !blocked; index += 2) {
  await Promise.all(variants.slice(index, index + 2).map(async value => {
   const query = new URL(`${origin}/cdx/search/cdx`)
   query.search = new URLSearchParams({ url: value, matchType: 'exact', output: 'json', fl: 'timestamp,original,statuscode,mimetype', limit: '-5', filter: 'statuscode:200' }).toString()
   try {
    const response = await request(query.href)
    if (!response.ok) { await response.body?.cancel(); unavailable = true; blocked ||= response.status === 429 || response.status === 403; return }
    const body = await readBoundedBody(response.body, 100_000)
    if ('error' in body) { unavailable = true; return }
    const rows: unknown = JSON.parse(body.text)
    if (Array.isArray(rows) && !rows.length) { indexed = true; return }
    if (!Array.isArray(rows) || !Array.isArray(rows[0]) || rows[0].join(',') !== 'timestamp,original,statuscode,mimetype') { unavailable = true; return }
    indexed = true
    for (const row of rows.slice(1, 6)) {
     if (!Array.isArray(row) || typeof row[0] !== 'string' || !/^\d{14}$/.test(row[0]) || row[2] !== '200' || row[3] !== 'text/html' || typeof row[1] !== 'string') continue
     try { if (parseWorkUrl(row[1]).workId === work && !waybackSnapshot(row[1])) candidates.push({ timestamp: row[0], original: row[1] }) } catch { /* Ignore mismatched or unsafe indexed URLs. */ }
    }
   } catch { unavailable = true }
  }))
 }
 const seen = new Set<string>()
 candidates.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
 for (const candidate of candidates) {
  if (calendar.checked >= 8 || deadline.aborted || blocked) break
  const replay = `${origin}/web/${candidate.timestamp}/${candidate.original}`
  if (seen.has(replay)) continue
  seen.add(replay); calendar.checked++
  let target = `${origin}/web/${candidate.timestamp}id_/${candidate.original}`
  try {
   for (let redirects = 0; redirects < 3; redirects++) {
    const response = await request(target)
    if (response.status >= 300 && response.status < 400) {
     const location = response.headers.get('location'); await response.body?.cancel()
     if (!location) break
     const next = new URL(location, target).href
     if (!waybackSnapshot(next) || parseWorkUrl(next).workId !== work) break
     target = next; continue
    }
    if (!response.ok) { await response.body?.cancel(); unavailable = true; blocked ||= response.status === 429 || response.status === 403; break }
    const body = await readBoundedBody(response.body, 4_000_000)
    if ('error' in body) { unavailable = true; break }
    const kind = classifyCapture(body.text, work, target)
    if (kind) return { url: target.replace(/(\/web\/\d{14})(?:id_|if_)\//, '$1/'), kind, checked: calendar.checked }
    break
   }
  } catch { unavailable = true }
 }
 return { ...calendar, reason: unavailable || !indexed ? 'unavailable' : candidates.length ? 'unverified' : 'not_found' }
}

type Dependencies = { authenticate(token: string): Promise<boolean>; lookup?: typeof findWaybackSnapshot; now?: () => number }
export function waybackHandler(deps: Dependencies) {
 const cache = new Map<string, { at: number; result: WaybackResult }>(), pending = new Map<string, Promise<WaybackResult>>()
 return async (request: Request): Promise<Response> => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' }
  const reply = (body: object, status = 200) => Response.json(body, { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  try {
   const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
   if (!token || !await deps.authenticate(token)) return reply({ error: 'Sign in to search Wayback Machine.' }, 401)
   const body = await readBoundedBody(request.body, 4096)
   if ('error' in body) return reply({ error: 'Invalid lookup request.' }, 400)
   let url: string
   try { const input = JSON.parse(body.text); if (typeof input?.url !== 'string') throw new Error(); parseWorkUrl(input.url); url = input.url } catch { return reply({ error: 'Enter a valid AO3 work URL.' }, 400) }
   const now = (deps.now ?? Date.now)(), saved = cache.get(url)
   if (saved && now - saved.at < 600_000) return reply(saved.result)
   let lookup = pending.get(url)
   if (!lookup) {
    if (pending.size >= 2) return reply({ error: 'Wayback lookup is busy. Try again shortly.' }, 429)
    lookup = (deps.lookup ?? findWaybackSnapshot)(url); pending.set(url, lookup)
   }
   try {
    const result = await lookup
    if (result.reason !== 'unavailable') { cache.delete(url); cache.set(url, { at: now, result }); if (cache.size > 100) cache.delete(cache.keys().next().value!) }
    return reply(result)
   } finally { if (pending.get(url) === lookup) pending.delete(url) }
  } catch { return reply({ error: 'Wayback Machine could not be checked. Try again later.' }, 503) }
 }
}
