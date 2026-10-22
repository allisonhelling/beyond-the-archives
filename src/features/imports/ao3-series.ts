import { load } from 'cheerio'
import { parseSeriesUrl, seriesPageUrl, parseWorkUrl, type SeriesPreview } from './urls.ts'
import { plainText } from './ao3-metadata.ts'

/** Read only the series listing. Never fetch or create its individual works. */
export function parseSeries(html: string, sourceUrl: string): SeriesPreview {
 const identity = parseSeriesUrl(sourceUrl)
 const $ = load(html)
 const title = $('#main h2.heading, h2.heading').first().text().trim()
 const list = $('.series.work.index')
 if (!title || !list.length || !$('dl.series.meta').length) throw new Error('Series preview is unavailable. Complete AO3 sign-in or confirmation in its tab, then retry, or skip this series.')
 const canonical = $('link[rel="canonical"]').attr('href')
 if (canonical && parseSeriesUrl(new URL(canonical, sourceUrl).href).seriesId !== identity.seriesId) throw new Error('AO3 returned a different series.')
 const next = $('.pagination a[rel="next"], .pagination li.next a').first()
 const nextUrl = next.length ? seriesPageUrl(new URL(next.attr('href') ?? '', sourceUrl).href, identity.seriesId) : undefined
 if (next.length && (!next.attr('href') || nextUrl === seriesPageUrl(sourceUrl))) throw new Error('Series preview returned an invalid Next link.')
 const field = (name: string) => $('dl.series.meta dt').filter((_, node) => $(node).text().trim().replace(/:$/, '').toLowerCase() === name.toLowerCase()).first().next('dd')
 const description = plainText(field('Description'))
 const creators = field('Creator').find('a[rel="author"]')
 const creatorNames = creators.toArray().map(node => $(node).text().trim()).filter(Boolean)
 const creatorLinks: Record<string, string> = {}
 creators.each((_, node) => { try { const link = new URL($(node).attr('href') ?? '', sourceUrl); if (link.origin === 'https://archiveofourown.org' && /^\/users\//.test(link.pathname)) creatorLinks[$(node).text().trim()] = link.href } catch { /* Preserve names without unsafe links. */ } })
 const count = (text: string) => { const value = text.replaceAll(',', '').trim(); return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null }
 const completeText = field('Complete').text().trim().toLowerCase()
 const complete = completeText === 'yes' ? true : completeText === 'no' ? false : null
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
  const names = (selector: string) => row.find(selector).toArray().map(tag => $(tag).text().trim()).filter(Boolean)
  const updated = Date.parse(row.find('p.datetime').text().trim())
  works.push({ workId, url, position, rating: row.find('.required-tags .rating').attr('title') ?? '', relationshipTags: names('.tags .relationships a.tag'), characterTags: names('.tags .characters a.tag'), additionalTags: names('.tags .freeforms a.tag'), archiveWarnings: names('.tags .warnings a.tag'), kudos: count(row.find('dd.kudos').first().text()), updated: Number.isFinite(updated) ? new Date(updated).toISOString().slice(0, 10) : '', title: heading.text().trim() || `AO3 work ${workId}`, authors: row.find('a[rel="author"]').toArray().map(author => $(author).text().trim()), summary: plainText(row.find('blockquote.summary')), fandoms: row.find('.fandoms a.tag').toArray().map(tag => $(tag).text().trim()).filter(Boolean), tags: row.find('.tags a.tag, .fandoms a.tag').toArray().map(tag => $(tag).text().trim()), wordCount: /^\d+$/.test(words) && Number.isSafeInteger(Number(words)) ? Number(words) : null, chapters, complete: chapterCounts ? chapterCounts[2] !== '?' && chapterCounts[1] === chapterCounts[2] : null })
 })
 return { ...identity, ...(nextUrl && { nextUrl }), title, description, complete, creators: creatorNames.length ? creatorNames : [...new Set(works.flatMap(work => work.authors))], creatorLinks, begun: field('Series Begun').text().trim(), updated: field('Series Updated').text().trim(), creatorNotes: plainText(field('Notes')), wordCount: count($('dl.series.meta dd.words').first().text()), workCount: count($('dl.series.meta dd.works').first().text()) ?? works.length, works }
}
