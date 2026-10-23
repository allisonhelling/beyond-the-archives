import { parseSeries } from '../../src/features/imports/ao3-series'
import { load } from 'cheerio'
import { extractWorkMetadata } from '../../src/features/imports/ao3-metadata.ts'
import { blankMetadata, initialProgress, parseWorkUrl } from '../../src/features/library/model'

const workMetadata = captured => ({ ...blankMetadata, ...captured, publication_status: captured.published_chapters == null ? 'unknown' : captured.is_complete ? 'complete' : 'in_progress' })

// Read only AO3's work metadata and chapter navigation, never story text/forms.
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
 return { ...current, metadata: workMetadata(automaticMetadata), automaticMetadata }
}
