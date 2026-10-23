import { parseSeries } from '../../src/features/imports/ao3-series'
import { load } from 'cheerio'
import { extractWorkMetadata } from '../../src/features/imports/ao3-metadata.ts'
import { blankMetadata, initialProgress, parseWorkUrl } from '../../src/features/library/model'

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
 const html = [...doc.querySelectorAll('h2.title, h3.byline, .summary.module, dl.work.meta, #selected_id')].map(node => node.outerHTML).join('')
 const { metadata: captured, chapters: chapterMap } = extractWorkMetadata(load(html), href)
 const published = captured.published_chapters ?? null
 const total = captured.total_chapters ?? null
 let current = identity.chapterId ? Number(Object.keys(chapterMap).find(key => chapterMap[key] === identity.chapterId)) || null : 1
 if (!identity.chapterId && url.searchParams.get('view_full_work') === 'true' && published !== 1) current = null
 const metadata = { ...blankMetadata, ...captured, publication_status: published === null ? 'unknown' : captured.is_complete ? 'complete' : 'in_progress' }
 const defaults = initialProgress(href, chapterMap)
 // Chapter 1 remains To Read even for a one-shot. Only a known final chapter
 // of a complete work defaults to Finished; the latest WIP chapter does not.
 const last = current > 1 && total !== null && current === total && published === total
 return { work: identity.workId, metadata, automaticMetadata: captured, chapters: chapterMap, current, defaults: { status: last ? 'finished' : defaults.status, chapter: current ?? 1, chapterFinished: last } }
}
