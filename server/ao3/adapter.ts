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
 const { metadata, chapters } = extractWorkMetadata($, sourceUrl)
 const partial = !metadata.authors || metadata.published_chapters === undefined
 return {metadata,chapters,category:partial?'partial':null,message:partial?'Some metadata is unavailable. Unknown fields were preserved.':null,retryable:false,pauseSeconds:0,sourceUrl}
}
/** Fetch only an allowlisted normalized work URL. Redirects are inspected before following. No cookies/auth or restriction bypass. */
export async function retrieveMetadata(input: { workId: number; normalizedUrl: string }, fetcher: typeof fetch = fetch): Promise<RetrievalResult> {
 const expected=`https://archiveofourown.org/works/${input.workId}`
 if (!Number.isSafeInteger(input.workId) || input.workId<1 || input.normalizedUrl!==expected) return failure('invalid_identity','Invalid metadata identity.')
 const result = await retrieveAo3Document(expected, url => parseWorkUrl(url).workId === input.workId, fetcher)
 return 'html' in result ? parseMetadata(result.html, input.workId, result.sourceUrl) : result
}
/** Shared bounded AO3 retrieval. Callers supply an allowlisted URL and identity check. */
export async function retrieveAo3Document(expected: string, matches: (url: string) => boolean, fetcher: typeof fetch = fetch, followRedirects = true): Promise<RetrievalResult | { html: string; sourceUrl: string }> {
 let target=expected
 try {
  for(let redirects=0;redirects<3;redirects++) {
   const response=await fetcher(target,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'PrivateAO3Library/0.3 (public metadata; no authentication)','Accept':'text/html'}})
   if(response.status===429) { const retry=response.headers.get('retry-after'); const seconds=retry && /^\d+$/.test(retry)?Number(retry):retry?Math.ceil((Date.parse(retry)-Date.now())/1000):3600; return failure('rate_limited','AO3 rate-limited retrieval. All requests are paused; retry later.',true,Math.max(3600,Math.min(seconds||3600,2147483647))) }
   if(response.headers.get('cf-mitigated')==='challenge') return failure('blocked','AO3 returned a blocking challenge. Retrieval is paused.',true,86400)
   if(response.status===403) return failure('blocked','AO3 blocked retrieval. All requests are paused for 24 hours.',true,86400)
   if(response.status===401) return failure('restricted','AO3 authentication is required. Use manual metadata.')
   if([404,410].includes(response.status)) return failure('unavailable','AO3 work is deleted or unavailable. The saved work remains editable.')
   if(response.status>=500) return failure('temporary_unavailable','AO3 is temporarily unavailable.',true)
   if(response.status>=300 && response.status<400) {
    if (!followRedirects) return failure('redirect','AO3 redirected the preview. Use the browser extension or retry later.')
    const location=response.headers.get('location'); if(!location) return failure('redirect','AO3 returned an unverifiable redirect.')
    const next=new URL(location,target)
    if(next.origin!=='https://archiveofourown.org') return failure('redirect','AO3 redirected outside the allowed origin.')
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
