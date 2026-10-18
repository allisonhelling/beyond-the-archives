import { load } from 'cheerio'
import { parseSeriesUrl, parseWorkUrl, type SeriesPreview } from '../../src/features/imports/urls.ts'
import { retrieveAo3Document } from './adapter.ts'

/** Read only the series listing. Never fetch or create its individual works. */
export function parseSeries(html: string, sourceUrl: string): SeriesPreview {
 const identity = parseSeriesUrl(sourceUrl)
 const $ = load(html)
 const title = $('#main h2.heading, h2.heading').first().text().trim()
 const list = $('.series.work.index')
 if (!title || !list.length || !$('dl.series.meta').length) throw new Error('Series preview is unavailable. Complete AO3 sign-in or confirmation in its tab, then retry, or skip this series.')
 const canonical = $('link[rel="canonical"]').attr('href')
 if (canonical && parseSeriesUrl(new URL(canonical, sourceUrl).href).seriesId !== identity.seriesId) throw new Error('AO3 returned a different series.')
 if ($('.pagination a[rel="next"], .pagination li.next a').length) throw new Error('This series listing has more pages. Import individual work links to avoid an incomplete preview.')
 const description = $('dl.series.meta dt').filter((_, node) => $(node).text().trim().replace(/:$/, '') === 'Description').first().next('dd').text().trim()
 const seen = new Set<number>()
 const works: SeriesPreview['works'] = []
 list.find('li.work.blurb').each((_, node) => {
  const row = $(node)
  const heading = row.find('h4.heading a[href*="/works/"]').first()
  let workId: number, url: string
  try { const work = parseWorkUrl(new URL(heading.attr('href') ?? '', sourceUrl).href); workId = work.workId; url = work.normalizedUrl } catch { return }
  if (seen.has(workId)) return
  seen.add(workId)
  let position: number | null = null
  row.find('.series a[href]').each((_, link) => {
   try {
    if (parseSeriesUrl(new URL($(link).attr('href')!, sourceUrl).href).seriesId !== identity.seriesId) return
    const part = $(link).parent().text().match(/Part\s+(\d+)\s+of/i)
    if (part && Number.isSafeInteger(Number(part[1])) && Number(part[1]) > 0) position = Number(part[1])
   } catch { /* Other series memberships are irrelevant to this preview. */ }
  })
  const words = row.find('dd.words').text().trim().replaceAll(',', '')
  const chapters = row.find('dd.chapters').text().trim()
  const chapterCounts = chapters.match(/^(\d+)\/(\d+|\?)$/)
  works.push({ workId, url, position, title: heading.text().trim() || `AO3 work ${workId}`, authors: row.find('a[rel="author"]').toArray().map(author => $(author).text().trim()), summary: row.find('blockquote.summary').text().trim(), tags: row.find('.tags a.tag, .fandoms a.tag').toArray().map(tag => $(tag).text().trim()), wordCount: /^\d+$/.test(words) && Number.isSafeInteger(Number(words)) ? Number(words) : null, chapters, complete: chapterCounts ? chapterCounts[2] !== '?' && chapterCounts[1] === chapterCounts[2] : null })
 })
 return { ...identity, title, description, works }
}
export async function retrieveSeries(url: string, fetcher: typeof fetch = fetch) {
 const identity = parseSeriesUrl(url)
 const result = await retrieveAo3Document(identity.normalizedUrl, next => parseSeriesUrl(next).seriesId === identity.seriesId, fetcher, false)
 if (!('html' in result)) return { preview: null, failure: result }
 return { preview: parseSeries(result.html, result.sourceUrl), failure: null }
}
