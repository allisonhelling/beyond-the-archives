import { load } from 'cheerio'
import { parseWorkUrl } from '../../src/features/imports/urls.ts'
import { isCalendarDate, scraperDate } from '../../src/lib/dates.ts'

/** AO3's chapter index supplies explicit chapter positions and release dates. */
export function parseChapterDates(html: string, workId: number, published: number): Record<string, string> {
 const $ = load(html), dates: Record<string, string> = {}
 const links = $('a[href]')
 for (const node of links.toArray()) {
  const link = $(node), match = link.text().trim().match(/^(?:Chapter\s+)?(\d+)[.:]/i)
  if (!match) continue
  try {
   const identity = parseWorkUrl(new URL(link.attr('href')!, 'https://archiveofourown.org').href)
   if (identity.workId !== workId || !identity.chapterId) continue
  } catch { continue }
  const position = Number(match[1])
  if (position < 1 || position > published) continue
  const text = link.closest('li').find('.datetime').first().text().trim().replace(/^\(|\)$/g, '')
  let date: string | null = null
  try { date = scraperDate(text) } catch { /* Unknown release date stays unknown. */ }
  if (date && isCalendarDate(date)) {
   if (dates[position] && dates[position] !== date) throw new Error('Ambiguous chapter release dates.')
   dates[position] = date
  }
 }
 return dates
}
