import { brandSlug } from '../../src/lib/brand.ts'
import { parseChapterDates } from './chapter-dates.ts'
import { load } from 'cheerio'
import { readBoundedBody } from './read-body.ts'
import { parseWorkUrl } from '../../src/features/imports/urls.ts'
import { extractWorkMetadata, type AutomaticMetadata } from '../../src/features/imports/ao3-metadata.ts'
export type { AutomaticMetadata } from '../../src/features/imports/ao3-metadata.ts'
export type RetrievalResult = { metadata: AutomaticMetadata | null; chapters: Record<string,string>; category: string | null; message: string | null; retryable: boolean; pauseSeconds: number; sourceUrl?: string }
export function failure(category: string, message: string, retryable = false, pauseSeconds = 0): RetrievalResult { return { metadata: null, chapters: {}, category, message, retryable, pauseSeconds } }
/** Pure fixture-testable parser. No database or personal reading data enters this adapter. */
export function parseMetadata(html: string, workId: number, sourceUrl: string): RetrievalResult {
 const $ = load(html)
 const { metadata, chapters } = extractWorkMetadata($, sourceUrl)
 // A missing page is evidence for a user decision, never an automatic deletion.
 if (!$('h2.title').length && /Error\s+404/i.test($('#main h2, #main h1').text()) && /The page you were looking for doesn['’]t exist\./i.test($('#main').text())) return failure('not_found', "Error 404: The page you were looking for doesn't exist.")
 if ($('#main #new_user, #main form[action="/users/login"]').length || /This work is only available to registered users|you must be logged in to access|This work could have adult content/i.test($.text())) return failure('restricted','AO3 sign-in is required. Edit this saved work manually.')
 const heading = $('h2.title').first().text().trim()
 if (!heading) return failure('parser_failure','Expected AO3 metadata was not found. The saved work is still editable.')
 // Confirm work identity from the fetched URL and a work-owned link, never the request alone.
 let identityVerified = false
 for (const node of $('a[href], link[rel="canonical"][href]').toArray()) {
  try { const identity = parseWorkUrl(new URL($(node).attr('href')!, sourceUrl).href); if (identity.workId === workId && ($(node).attr('rel') === 'canonical' || /\/navigate(?:[?#]|$)/.test($(node).attr('href')!) || $(node).closest('li.work, .work.navigation, .navigation.actions').length)) identityVerified = true } catch { /* Non-work link. */ }
 }
 // AO3 chapter navigation URL is not a supported import URL, but is strong page identity evidence.
 if ($(`a[href="/works/${workId}/navigate"], a[href="/works/${workId}?view_full_work=true"]`).length) identityVerified = true
 if (!identityVerified) return failure('parser_failure','The page did not provide verifiable work identity.')
 const partial = !metadata.authors || metadata.published_chapters === undefined
 return {metadata,chapters,category:partial?'partial':null,message:partial?'Some metadata is unavailable. Unknown fields were preserved.':null,retryable:false,pauseSeconds:0,sourceUrl}
}
/** Shared bounded AO3 retrieval. Callers supply an allowlisted URL and identity check. */
export async function retrieveAo3Document(expected: string, matches: (url: string) => boolean, fetcher: typeof fetch = fetch, followRedirects = true): Promise<RetrievalResult | { html: string; sourceUrl: string }> {
 let target=expected
 try {
  if (!['https://archiveofourown.org', 'https://web.archive.org'].includes(new URL(expected).origin)) return failure('invalid_identity', 'Unsupported metadata origin.')
  for(let redirects=0;redirects<3;redirects++) {
   const response=await fetcher(target,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':`${brandSlug}/0.3 (public metadata; no authentication)`,'Accept':'text/html'}})
   if(response.status===429) { const retry=response.headers.get('retry-after'); const seconds=retry && /^\d+$/.test(retry)?Number(retry):retry?Math.ceil((Date.parse(retry)-Date.now())/1000):3600; return failure('rate_limited','AO3 rate-limited retrieval. All requests are paused; retry later.',true,Math.max(3600,Math.min(seconds||3600,2147483647))) }
   if(response.headers.get('cf-mitigated')==='challenge') return failure('blocked','AO3 returned a blocking challenge. Retrieval is paused.',true,86400)
   if(response.status===403) return failure('blocked','AO3 blocked retrieval. All requests are paused for 24 hours.',true,86400)
   if(response.status===401) return failure('restricted','AO3 authentication is required. Use manual metadata.')
   if(response.status===404) {
    const body = await readBoundedBody(response.body, 4_000_000)
    if (!('error' in body)) {
     const missing = parseMetadata(body.text, 0, target)
     if (missing.category === 'not_found') return missing
    }
    return failure('unavailable','AO3 work is deleted or unavailable. The saved work remains editable.')
   }
   if(response.status===410) return failure('unavailable','AO3 work is deleted or unavailable. The saved work remains editable.')
   if(response.status>=500) return failure('temporary_unavailable','AO3 is temporarily unavailable.',true)
   if(response.status>=300 && response.status<400) {
    if (!followRedirects) return failure('redirect','AO3 redirected the preview. Use the browser extension or retry later.')
    const location=response.headers.get('location'); if(!location) return failure('redirect','AO3 returned an unverifiable redirect.')
    const next=new URL(location,target)
    if(next.origin!==new URL(expected).origin) return failure('redirect','AO3 redirected outside the allowed origin.')
    if(next.pathname.startsWith('/users/login')) return failure('restricted','AO3 sign-in is required. Use manual metadata.')
    try { if(!matches(next.href)) return failure('changed_identity','AO3 redirected to a different work. The saved identity was preserved.') } catch { return failure('redirect','AO3 redirected to an unsupported page.') }
    if(next.searchParams.has('view_adult')) return failure('restricted','AO3 requires an adult-content confirmation. Use manual metadata.')
    await new Promise(resolve=>setTimeout(resolve,15000))
    target=next.href; continue
   }
   if(!response.ok) return failure('http_error',`AO3 returned HTTP ${response.status}.`)
   if(!response.headers.get('content-type')?.includes('text/html')) return failure('parser_failure','AO3 did not return an HTML metadata page.')
   const body = await readBoundedBody(response.body, 4_000_000)
   if ('error' in body) return failure('parser_failure', body.error === 'missing' ? 'Empty AO3 response.' : 'AO3 response exceeded the metadata size limit.')
   const html = body.text
   if(/retry later|rate limit exceeded/i.test(html) && !html.includes('class="title')) return failure('rate_limited','AO3 requested that retrieval stop.',true,3600)
   if(/captcha|cf-chl-|checking your browser/i.test(html)) return failure('blocked','AO3 returned a blocking challenge. Retrieval is paused.',true,86400)
   return { html, sourceUrl: target }
  }
  return failure('redirect','Too many AO3 redirects.')
 } catch(error) { return failure(error instanceof Error && /timeout|abort/i.test(error.name)?'timeout':'network_error','Could not retrieve AO3 metadata. The work is saved and can be edited manually.',true) }
}


export function withChapterDates(result: RetrievalResult, html: string | undefined, workId: number): RetrievalResult {
 if (!result.metadata) return result
 if (result.metadata.published_chapters === 1 && result.metadata.ao3_published_at) return { ...result, metadata: { ...result.metadata, chapter_dates: { '1': result.metadata.ao3_published_at.slice(0, 10) } } }
 const published = result.metadata.published_chapters ?? 0
 let dates: Record<string, string> = {}
 try { dates = html ? parseChapterDates(html, workId, published) : {} } catch { /* Report an unverifiable index below. */ }
 if (!published || Object.keys(dates).length !== published) return { ...result, category: 'chapter_dates_unavailable', message: 'Chapter release dates could not be verified. Reading status is saved; chapter progress remains unconfirmed. Update the browser extension if needed, then retry metadata.', retryable: true }
 return { ...result, metadata: { ...result.metadata, chapter_dates: dates } }
}
