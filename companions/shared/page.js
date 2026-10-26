import { seriesWorkMetadata } from '../../src/features/library/series/series'
import { parseSeries, parseWorkBlurbs } from '../../src/features/imports/ao3-series'
import { load } from 'cheerio'
import { extractWorkMetadata } from '../../src/features/imports/ao3-metadata.ts'
import { blankMetadata, parseWorkUrl } from '../../src/features/library/model'

const workMetadata = captured => ({ ...blankMetadata, ...captured, publication_status: captured.published_chapters == null ? 'unknown' : captured.is_complete ? 'complete' : 'in_progress' })

/** Count only the loaded chapter, on an explicit read action. Never return its text. */
export function captureChapterRead(doc, page, href) {
 if (!page.current || page.series) return null
 const chapters = doc.querySelector('#chapters')
 const chapter = chapters?.querySelector(`#chapter-${page.current}`)
 const containers = chapters?.querySelectorAll('.chapter') ?? []
 const only = containers.length === 1 && !/^chapter-[0-9]+$/.test(containers[0].id) ? containers[0] : null
 const scope = chapter ?? only ?? (containers.length === 0 ? chapters : null)
 const body = scope?.querySelector(':scope > .userstuff')
 let wordCount = null
 if (body && typeof Intl.Segmenter === 'function') {
  const copy = body.cloneNode(true)
  copy.querySelectorAll('script, style, noscript, iframe, .summary, .notes, .landmark, [hidden], [aria-hidden="true"]').forEach(node => node.remove())
  // Block boundaries separate words; inline formatting must not split a word.
  copy.querySelectorAll('p, div, li, blockquote, br, hr, h1, h2, h3, h4, h5, h6, td, tr').forEach(node => { node.before(' '); node.after(' ') })
  const segments = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(copy.textContent ?? '')
  wordCount = 0
  for (const segment of segments) if (segment.isWordLike) wordCount++
 }
 return { chapter: page.current, chapter_id: page.chapters?.[page.current] ?? parseWorkUrl(href).chapterId ?? null, word_count: wordCount }
}

/** AO3 numbers full-work chapter containers by their reading order. */
export function readChapterSections(doc, href) {
 if (new URL(href).searchParams.get('view_full_work') !== 'true') return []
 return [...doc.querySelectorAll('#chapters > .chapter')].flatMap(element => {
  const current = Number(/^chapter-([1-9]\d*)$/.exec(element.id)?.[1])
  return current ? [{ element, current }] : []
 })
}

export function chapterDefaults(current, metadata) {
 // Only a known final chapter of a complete work defaults to Finished.
 const last = current > 1 && current === metadata.total_chapters && metadata.published_chapters === metadata.total_chapters
 return { status: last ? 'finished' : current > 1 ? 'reading' : 'to_read', chapter: current ?? 1, chapterFinished: last }
}

// Metadata capture never includes story text/forms. Read actions count text separately.
export function readPage(doc, href) {
 if (/^https:\/\/archiveofourown\.org\/series\/[1-9]\d*(?:[/?#]|$)/.test(href)) {
  try {
   const html = [...doc.querySelectorAll('#main h2.heading, dl.series.meta, .series.work.index, .pagination, link[rel="canonical"]')].map(node => node.outerHTML).join('')
   const preview = parseSeries(html, href)
   return { series: preview, work: preview.seriesId }
  } catch { return null }
 }
 let url, identity
 try { url = new URL(href); identity = parseWorkUrl(href) } catch { return null }
 if (url.origin !== 'https://archiveofourown.org' || !url.pathname.startsWith('/works/') || !doc.querySelector('h2.title')) return null
 // Parse only the metadata sections; chapter text and account forms stay out.
 // AO3 nests its chapter selector inside a navigation li.chapter, not story text.
 const html = [...doc.querySelectorAll('h2.title, h3.byline, .summary.module, dl.work.meta, #selected_id')].filter(node => node.id === 'selected_id' || !node.closest('#chapters, .chapter')).map(node => node.outerHTML).join('')
 const { metadata: captured, chapters: chapterMap } = extractWorkMetadata(load(html), href)
 for (const { element, current } of readChapterSections(doc, href)) {
  const link = element.querySelector('h3.title a[href*="/chapters/"]')
  if (!link) continue
  try {
   const chapter = parseWorkUrl(new URL(link.getAttribute('href'), href).href)
   if (chapter.workId === identity.workId && chapter.chapterId) chapterMap[current] = chapter.chapterId
  } catch { /* Ignore unrecognized chapter links. */ }
 }
 const published = captured.published_chapters ?? null
 let current = identity.chapterId ? Number(Object.keys(chapterMap).find(key => chapterMap[key] === identity.chapterId)) || null : 1
 if (!identity.chapterId && url.searchParams.get('view_full_work') === 'true' && published !== 1) current = null
 const metadata = workMetadata(captured)
 return { work: identity.workId, metadata, automaticMetadata: captured, chapters: chapterMap, current, defaults: chapterDefaults(current, metadata) }
}

/** Saving from a later chapter still needs the work's summary, not its chapter summary. */
export async function collectWorkPage(doc, href, fetcher = globalThis.fetch) {
 const current = readPage(doc, href)
 if (!current?.metadata?.title) throw new Error('AO3 metadata is unavailable. Reload this work and try again.')
 if (current.metadata.summary || !parseWorkUrl(href).chapterId) return current
 const url = `https://archiveofourown.org/works/${current.work}?view_adult=true`
 const response = await fetcher(url, { credentials: 'same-origin', signal: AbortSignal.timeout(20000) })
 if (!response.ok || parseWorkUrl(response.url).workId !== current.work) throw new Error('Could not collect the work metadata. Reload AO3 and try again; your draft is preserved.')
 const first = readPage(new DOMParser().parseFromString(await response.text(), 'text/html'), response.url)
 if (!first?.metadata?.title) throw new Error('Complete AO3 sign-in or confirmation, then retry. Your draft is preserved.')
 const automaticMetadata = { ...first.automaticMetadata, ...current.automaticMetadata }
 // An empty summary block on this chapter must not erase the fetched work summary.
 if (first.automaticMetadata.summary) Object.assign(automaticMetadata, { summary: first.automaticMetadata.summary, summary_html: first.automaticMetadata.summary_html })
 return { ...current, metadata: workMetadata(automaticMetadata), automaticMetadata }
}

/** Reuse series tile metadata on every AO3 page that lists works. */
export function readWorkTiles(doc, href, series) {
 if (new URL(href).origin !== 'https://archiveofourown.org') return []
 return [...doc.querySelectorAll('#main li.work.blurb, #main li.bookmark.blurb')].flatMap(element => {
  const work = parseWorkBlurbs(element.outerHTML, href, series?.seriesId)[0]
  if (!work) return []
  const automaticMetadata = seriesWorkMetadata(work, series)
  return [{ element, url: work.url, page: { work: work.workId, metadata: automaticMetadata, automaticMetadata, chapters: {}, current: null, defaults: { status: 'to_read', chapter: 1, chapterFinished: false } } }]
 })
}
