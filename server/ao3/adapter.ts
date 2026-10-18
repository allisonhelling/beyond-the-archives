import { load } from 'cheerio'
import { readBoundedBody } from './read-body.ts'
import { parseWorkUrl } from '../../src/features/imports/urls.ts'
export type AutomaticMetadata = {
 title?: string; summary?: string; authors?: string[]; author_links?: Record<string,string>; fandoms?: string[];
 ao3_tags?: string[]; relationship_tags?: string[]; character_tags?: string[]; additional_tags?: string[]; archive_warnings?: string[]; categories?: string[];
 rating?: string; word_count?: number; published_chapters?: number; total_chapters?: number; is_complete?: boolean;
 ao3_published_at?: string; ao3_updated_at?: string; series?: string[]; series_memberships?: { id: number; name: string; url: string; position: number | null }[];
}
export type RetrievalResult = { metadata: AutomaticMetadata | null; chapters: Record<string,string>; category: string | null; message: string | null; retryable: boolean; pauseSeconds: number; sourceUrl?: string }
export function failure(category: string, message: string, retryable = false, pauseSeconds = 0): RetrievalResult { return { metadata: null, chapters: {}, category, message, retryable, pauseSeconds } }
function count(text: string) { const value = text.replaceAll(',', '').trim(); const n = Number(value); return /^\d+$/.test(value) && Number.isSafeInteger(n) && n <= 2147483647 ? n : undefined }
function date(text: string) { return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? `${text}T00:00:00Z` : undefined }
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
 const metadata: AutomaticMetadata = { title: heading }
 const summary = $('.summary.module blockquote').first().clone()
 if (summary.length) {
  // HTML source whitespace is not a displayed break. Preserve the breaks supplied
  // by markup before storing plain text for the shared pre-wrap summary display.
  summary.find('script, style').remove()
  summary.find('*').addBack().contents().each((_, node) => {
   if (node.type === 'text') node.data = node.data.replace(/[\t\n\f\r ]+/g, ' ')
  })
  summary.find('br').replaceWith('\n')
  summary.find('p, div, blockquote, h1, h2, h3, h4, h5, h6, ul, ol, pre, hr').before('\n\n').after('\n\n')
  summary.find('li').before('\n').after('\n')
  metadata.summary = summary.text().replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
 }
 const authors = $('h3.byline a[rel="author"]')
 if (authors.length) { metadata.authors=[]; metadata.author_links={}; authors.each((_, node) => { const name=$(node).text().trim(); if (!name) return; metadata.authors!.push(name); try { const u=new URL($(node).attr('href')!,sourceUrl); if (u.origin==='https://archiveofourown.org' && /^\/users\//.test(u.pathname)) metadata.author_links![name]=u.href } catch { /* Name is still useful. */ } }) }
 const groups = { fandoms:'fandom', relationship_tags:'relationship', character_tags:'character', additional_tags:'freeform', archive_warnings:'warning', categories:'category' } as const
 for (const [field, css] of Object.entries(groups)) { const section=$(`dd.${css}.tags`); if (section.length) Object.assign(metadata,{[field]:section.find('a.tag').toArray().map(node=>$(node).text().trim()).filter(Boolean)}) }
 const tags = Object.keys(groups).filter(k=>k!=='fandoms').flatMap(k=>metadata[k as keyof AutomaticMetadata] as string[] ?? [])
 if (tags.length) metadata.ao3_tags=[...new Set(tags)]
 const rating=$('dd.rating.tags a.tag').first().text().trim(); if (rating) metadata.rating=rating
 const words=count($('dd.words').first().text()); if(words!==undefined) metadata.word_count=words
 const chapterText=$('dd.chapters').first().text().trim().match(/^(\d+)\s*\/\s*(\d+|\?)$/)
 if (chapterText) { metadata.published_chapters=count(chapterText[1]); if(chapterText[2]!=='?') metadata.total_chapters=count(chapterText[2]); if(metadata.total_chapters) metadata.is_complete=metadata.published_chapters===metadata.total_chapters; else metadata.is_complete=false }
 const published=date($('dd.published').first().text().trim()), updated=date($('dd.status').first().text().trim())
 if(published) metadata.ao3_published_at=published
 if(updated) metadata.ao3_updated_at=updated
 const memberships: NonNullable<AutomaticMetadata['series_memberships']>=[]
 $('dd.series .position').each((_,node)=>{ const link=$(node).find('a[href*="/series/"]').first(); const m=link.attr('href')?.match(/^\/series\/([1-9]\d*)$/); const position=$(node).text().match(/Part\s+(\d+)\s+of/i); if(m && Number.isSafeInteger(Number(m[1]))) memberships.push({id:Number(m[1]),name:link.text().trim(),url:`https://archiveofourown.org/series/${m[1]}`,position:position?count(position[1])??null:null}) })
 if(memberships.length) { metadata.series_memberships=memberships; metadata.series=memberships.map(s=>s.name) }
 const chapters: Record<string,string>={}
 // Only explicit numbered options verify position. Never use chapter IDs or DOM index as chapter numbers.
 $('#selected_id option').each((_,node)=>{ const id=$(node).attr('value'), label=$(node).text().match(/^\s*(\d+)\./); if(id && /^[1-9]\d*$/.test(id) && label && Number(label[1])>0 && metadata.published_chapters && Number(label[1])<=metadata.published_chapters) chapters[label[1]]=id })
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
