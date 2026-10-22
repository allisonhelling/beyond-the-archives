import { scraperDate } from '../../lib/dates'
export { scraperDate } from '../../lib/dates'
import { classifyUrl } from './urls'
import type { AutomaticMetadata } from './ao3-metadata'

export type CsvWork = {
 source: 'bookmarks' | 'marked_for_later'; url: string; workId: number; metadata: AutomaticMetadata;
 bookmarkDate: string | null; updatedDate: string | null; notes: string; tags: string[];
}
export type CsvSource = Omit<CsvWork, 'workId'> & { workId?: number; seriesId?: number }
export type CsvConflict = { workId: number; id: string; version: string; title: string; status: string; progress: number; notes: string; tags: string[] }
export type CsvChoice = 'keep' | 'overwrite'

/** RFC 4180 fields, including escaped quotes, embedded newlines, BOM and CRLF. */
export function parseCsv(text: string): Record<string, string>[] {
 const rows: string[][] = [], row: string[] = []
 let cell = '', quoted = false, closed = false
 text = text.replace(/^\ufeff/, '')
 for (let i = 0; i < text.length; i++) {
  const ch = text[i]
  if (quoted) {
   if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true } }
   else cell += ch
  } else if (ch === '"' && !cell && !closed) quoted = true
  else if (ch === ',' || ch === '\n' || ch === '\r') {
   row.push(cell); cell = ''; closed = false
   if (ch !== ',') { if (row.some(value => value.trim())) rows.push([...row]); row.length = 0; if (ch === '\r' && text[i + 1] === '\n') i++ }
  } else { if (closed || ch === '"') throw new Error('Invalid CSV quoting. Export the file again.'); cell += ch }
 }
 if (quoted) throw new Error('The CSV ends inside a quoted field.')
 row.push(cell); if (row.some(value => value.trim())) rows.push(row)
 const headers = rows.shift()?.map(value => value.trim().toLowerCase()) ?? []
 if (!headers.includes('link') || !headers.includes('title') || new Set(headers).size !== headers.length) throw new Error('Choose an AO3 scraper CSV with unique title and link columns.')
 return rows.map((values, index) => {
  if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`)
  return Object.fromEntries(headers.map((header, i) => [header, values[i]]))
 })
}

const list = (text = '') => [...new Set(text.split(', ').map(value => value.trim()).filter(Boolean))]
function count(text = '') { const raw = text.replaceAll(',', '').trim(); const value = Number(raw); return /^\d+$/.test(raw) && Number.isSafeInteger(value) && value <= 2147483647 ? value : undefined }
export function csvMetadata(row: Record<string, string>): AutomaticMetadata {
 const metadata: AutomaticMetadata = { title: row.title.trim(), summary: row.summary ?? '', authors: list(row.author), fandoms: list(row.fandoms),
  categories: list(row.category), relationship_tags: list(row.relationships), character_tags: list(row.characters), additional_tags: list(row.freeforms), archive_warnings: list(row.warnings) }
 metadata.ao3_tags = [...new Set([...(metadata.categories ?? []), ...(metadata.relationship_tags ?? []), ...(metadata.character_tags ?? []), ...(metadata.additional_tags ?? []), ...(metadata.archive_warnings ?? [])])]
 if (row.rating?.trim()) metadata.rating = row.rating.trim()
 const words = count(row.words), kudos = count(row.kudos)
 if (words !== undefined) metadata.word_count = words
 if (kudos !== undefined) metadata.kudos = kudos
 const chapters = row.chapters?.trim().match(/^(\d+)\s*\/\s*(\d+|\?)$/)
 if (chapters) {
  const published = count(chapters[1]), total = count(chapters[2])
  if (published === undefined || total === 0 || total !== undefined && published > total) throw new Error('Invalid CSV chapter count.')
  metadata.published_chapters = published; metadata.is_complete = published === total
  if (total !== undefined) metadata.total_chapters = total
 }
 const updated = scraperDate(row.date ?? '')
 if (updated) metadata.ao3_updated_at = `${updated}T00:00:00Z`
 return metadata
}
export function readAo3Csv(text: string): CsvSource[] {
 return parseCsv(text).map((row, index) => {
  const identity = classifyUrl(row.link)
  if (identity.kind !== 'valid' && identity.kind !== 'series') throw new Error(`CSV row ${index + 2}: unsupported AO3 link ${row.link}`)
  const source = row.source_list?.trim() || (Object.hasOwn(row, 'bookmark date') ? 'bookmarks' : 'marked_for_later')
  if (source !== 'bookmarks' && source !== 'marked_for_later') throw new Error(`CSV row ${index + 2}: unknown source_list ${source}`)
  const metadata = csvMetadata(row)
  if (!metadata.title) throw new Error(`CSV row ${index + 2}: title is missing.`)
  return { source, url: identity.identity.normalizedUrl, ...(identity.kind === 'valid' ? { workId: identity.identity.workId } : { seriesId: identity.identity.seriesId }), metadata,
   bookmarkDate: source === 'bookmarks' ? scraperDate(row['bookmark date'] ?? '') : null, updatedDate: scraperDate(row.date ?? ''), notes: row['bookmark notes'] ?? '', tags: list(row['bookmark tags']) }
 })
}
/** Keep each work once, preferring bookmarks and the most recent bookmark date. */
export function uniqueCsvWorks(rows: CsvWork[]): CsvWork[] {
 const works = new Map<number, CsvWork>()
 for (const row of rows) {
  const prior = works.get(row.workId)
  if (!prior || prior.source === 'marked_for_later' && row.source === 'bookmarks' || prior.source === row.source && (row.bookmarkDate ?? '') > (prior.bookmarkDate ?? '')) works.set(row.workId, row)
 }
 return [...works.values()]
}
