import { blankMetadata, initialProgress, parseWorkUrl } from '../src/features/library/model'

// Read only AO3's work metadata and chapter navigation, never story text/forms.
export function readPage(doc, href) {
 let url, identity
 try { url = new URL(href); identity = parseWorkUrl(href) } catch { return null }
 if (url.origin !== 'https://archiveofourown.org' || !url.pathname.startsWith('/works/') || !doc.querySelector('h2.title')) return null
 const text = selector => doc.querySelector(selector)?.textContent.trim() ?? ''
 const list = selector => [...doc.querySelectorAll(selector)].map(node => node.textContent.trim()).filter(Boolean)
 const counts = /^(\d+)\s*\/\s*(\d+|\?)$/.exec(text('dd.chapters').replaceAll(',', ''))
 const published = counts ? Number(counts[1]) : null
 const total = counts && counts[2] !== '?' ? Number(counts[2]) : null
 const options = [...doc.querySelectorAll('#selected_id option')]
 const chapterMap = Object.fromEntries(options.map((option, index) => [String(index + 1), option.value]))
 let current = identity.chapterId ? Number(Object.keys(chapterMap).find(key => chapterMap[key] === identity.chapterId)) || null : 1
 if (!identity.chapterId && url.searchParams.get('view_full_work') === 'true' && published !== 1) current = null
 const metadata = { ...blankMetadata, title: text('h2.title'), authors: list('h3.byline a[rel="author"]'), fandoms: list('dd.fandom.tags a.tag'), ao3_tags: list('dl.work.meta dd.tags a.tag'), rating: text('dd.rating.tags a.tag'), published_chapters: published, total_chapters: total, publication_status: total !== null && published === total ? 'complete' : 'in_progress' }
 const defaults = initialProgress(href, chapterMap)
 // Chapter 1 remains To Read even for a one-shot. Only a known final chapter
 // of a complete work defaults to Finished; the latest WIP chapter does not.
 const last = current > 1 && total !== null && current === total && published === total
 return { work: identity.workId, metadata, current, defaults: { status: last ? 'finished' : defaults.status, chapter: current ?? 1, chapterFinished: last } }
}
