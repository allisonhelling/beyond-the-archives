import { parseSeries } from '../../src/features/imports/ao3-series'
import { load } from 'cheerio'
import { extractWorkMetadata } from '../../src/features/imports/ao3-metadata.ts'
import { blankMetadata, initialProgress, parseWorkUrl } from '../../src/features/library/model'

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
 return { chapter: page.current, chapter_id: parseWorkUrl(href).chapterId ?? page.chapters?.[page.current] ?? null, word_count: wordCount }
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
 const html = [...doc.querySelectorAll('h2.title, h3.byline, .summary.module, dl.work.meta, #selected_id')].filter(node => !node.closest('#chapters, .chapter')).map(node => node.outerHTML).join('')
 const { metadata: captured, chapters: chapterMap } = extractWorkMetadata(load(html), href)
 const published = captured.published_chapters ?? null
 const total = captured.total_chapters ?? null
 let current = identity.chapterId ? Number(Object.keys(chapterMap).find(key => chapterMap[key] === identity.chapterId)) || null : 1
 if (!identity.chapterId && url.searchParams.get('view_full_work') === 'true' && published !== 1) current = null
 const metadata = workMetadata(captured)
 const defaults = initialProgress(href, chapterMap)
 // Chapter 1 remains To Read even for a one-shot. Only a known final chapter
 // of a complete work defaults to Finished; the latest WIP chapter does not.
 const last = current > 1 && total !== null && current === total && published === total
 return { work: identity.workId, metadata, automaticMetadata: captured, chapters: chapterMap, current, defaults: { status: last ? 'finished' : defaults.status, chapter: current ?? 1, chapterFinished: last } }
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
