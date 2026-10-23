import { isCalendarDate, scraperDate } from '../../lib/dates'
export { scraperDate } from '../../lib/dates'
import { classifyUrl } from './urls'
import type { AutomaticMetadata } from './ao3-metadata'
import { bookmarkRec, type SourceBookmark } from '../library/model'

export type CsvWork = {
 importReadingStatus?: import('../library/model').Status; source: 'bookmarks' | 'marked_for_later'; url: string; workId: number | null; workStatus?: 'available' | 'deleted'; bookmarkId?: number; bookmarkStatus?: string; bookmarkUser?: string; bookmarkCount?: number; bookmarkRec?: boolean | null; metadata: AutomaticMetadata;
 bookmarkDate: string | null; updatedDate: string | null; notes: string; tags: string[];
}
export type CsvSource = Omit<CsvWork, 'workId'> & { workId?: number | null; seriesId?: number }
export type CsvConflict = { workId: number | null; bookmarkId?: number; id: string; version: string; title: string; status: string; progress: number; notes: string; tags: string[]; finishedAt?: string | null }
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
 const metadata: AutomaticMetadata = { title: row.title?.trim() ?? '', summary: row.summary ?? '', authors: list(row.author), fandoms: list(row.fandoms),
  categories: list(row.category), relationship_tags: list(row.relationships), character_tags: list(row.characters), additional_tags: list(row.freeforms), archive_warnings: list(row.warnings) }
 metadata.ao3_tags = [...new Set([...(metadata.categories ?? []), ...(metadata.relationship_tags ?? []), ...(metadata.character_tags ?? []), ...(metadata.additional_tags ?? []), ...(metadata.archive_warnings ?? [])])]
 if (row.rating?.trim()) metadata.rating = row.rating.trim()
 for (const [column, field] of [['words', 'word_count'], ['kudos', 'kudos'], ['bookmarks', 'bookmark_count'], ['comments', 'comment_count'], ['hits', 'hits']] as const) {
  const value = count(row[column]); if (value !== undefined) metadata[field] = value
 }
 const chapters = row.chapters?.trim().match(/^(\d+)\s*\/\s*(\d+|\?)$/)
 if (chapters) {
  const published = count(chapters[1]), total = count(chapters[2])
  if (published === undefined || total === 0 || total !== undefined && published > total) throw new Error('Invalid CSV chapter count.')
  metadata.published_chapters = published; metadata.is_complete = published === total
  if (total !== undefined) metadata.total_chapters = total
 }
 const updated = scraperDate(row.date ?? '')
 if (updated) metadata.ao3_updated_at = `${updated}T00:00:00Z`
 return nonemptyMetadata(metadata)
}
export function readAo3Csv(text: string): CsvSource[] {
 return readAo3Rows(parseCsv(text))
}
export function readAo3Rows(rows: Record<string, string>[]): CsvSource[] {
 return rows.map((row, index) => {
  const identity = classifyUrl(row.link)
  const deleted = row.work_status === 'deleted'
  const bookmarkId = Number(row['bookmark id'])
  const hasBookmark = Number.isSafeInteger(bookmarkId) && bookmarkId > 0
  const bookmarkUrl = `https://archiveofourown.org/bookmarks/${bookmarkId}`
  if (identity.kind !== 'valid' && identity.kind !== 'series' && !(deleted && hasBookmark && row.link === bookmarkUrl)) throw new Error(`CSV row ${index + 2}: unsupported AO3 link ${row.link}`)
  const source = row.source_list?.trim() || (Object.hasOwn(row, 'bookmark date') ? 'bookmarks' : 'marked_for_later')
  if (source !== 'bookmarks' && source !== 'marked_for_later') throw new Error(`CSV row ${index + 2}: unknown source_list ${source}`)
  if (deleted && (source !== 'bookmarks' || !hasBookmark)) throw new Error(`CSV row ${index + 2}: deleted bookmarks require a bookmark ID.`)
  if (row.work_status && !['available', 'deleted'].includes(row.work_status)) throw new Error(`CSV row ${index + 2}: unsupported work_status.`)
  const rec = row['bookmark rec']?.trim().toLowerCase()
  if (rec !== undefined && !['true', 'false', '', 'unknown'].includes(rec)) throw new Error(`CSV row ${index + 2}: invalid bookmark rec.`)
  const recommendation = bookmarkRec({ source_bookmark: { status: row['bookmark status'], ...(rec !== undefined && { rec: rec === 'true' ? true : rec === 'false' ? false : null }) } })
  const metadata = csvMetadata(row)
  if (row['chapter dates']) {
   const dates: unknown = JSON.parse(row['chapter dates'])
   if (!dates || typeof dates !== 'object' || Array.isArray(dates) || Object.entries(dates).some(([position, date]) => !/^[1-9]\d*$/.test(position) || Number(position) > (metadata.published_chapters ?? 0) || typeof date !== 'string' || !isCalendarDate(date))) throw new Error(`CSV row ${index + 2}: invalid chapter dates.`)
   metadata.chapter_dates = dates as Record<string, string>
  }
  if (!deleted && !metadata.title) throw new Error(`CSV row ${index + 2}: title is missing.`)
  return { source, url: identity.kind === 'valid' || identity.kind === 'series' ? identity.identity.normalizedUrl : bookmarkUrl, ...(identity.kind === 'valid' ? { workId: identity.identity.workId } : identity.kind === 'series' ? { seriesId: identity.identity.seriesId } : { workId: null }), workStatus: deleted ? 'deleted' : 'available', ...(hasBookmark ? { bookmarkId } : {}), bookmarkStatus: row['bookmark status'], metadata,
   bookmarkDate: source === 'bookmarks' ? scraperDate(row['bookmark date'] ?? '') : null, ...(source === 'bookmarks' && { bookmarkRec: recommendation }), bookmarkUser: row['bookmark user'], bookmarkCount: count(row['bookmark count']), updatedDate: scraperDate(row.date ?? ''), notes: row['bookmark notes'] ?? '', tags: list(row['bookmark tags']) }
 })
}
/** Keep each work once, preferring bookmarks and the most recent bookmark date. */
export function uniqueCsvWorks(rows: CsvWork[]): CsvWork[] {
 const works = new Map<string, CsvWork>()
 for (const row of rows) {
  const prior = works.get(csvWorkKey(row))
  if (!prior || prior.source === 'marked_for_later' && row.source === 'bookmarks' || prior.source === row.source && (row.bookmarkDate ?? '') > (prior.bookmarkDate ?? '')) works.set(csvWorkKey(row), row)
 }
 return [...works.values()]
}

/** Empty observations preserve saved values; zero and false are meaningful data. */
export function nonemptyMetadata(metadata: AutomaticMetadata): AutomaticMetadata {
 const result = Object.fromEntries(Object.entries(metadata).filter(([, value]) => value != null && (typeof value !== 'string' || Boolean(value.trim())) && (typeof value !== 'object' || Object.keys(value).length > 0))) as AutomaticMetadata
 return result
}
export const csvWorkKey = (work: Pick<CsvWork, 'workId' | 'bookmarkId'>) => work.workId === null ? `bookmark:${work.bookmarkId}` : String(work.workId)
/** Keep source bookmark observations separate from editable personal fields. */
export function csvBookmark(work: CsvWork): SourceBookmark {
 if (!work.bookmarkId) return {}
 return { id: String(work.bookmarkId), url: `https://archiveofourown.org/bookmarks/${work.bookmarkId}`, notes: work.notes, tags: work.tags, rec: bookmarkRec({ source_bookmark: { status: work.bookmarkStatus, ...(work.bookmarkRec !== undefined && { rec: work.bookmarkRec }) } }),
  ...(work.bookmarkStatus ? { status: work.bookmarkStatus } : {}), ...(work.bookmarkDate ? { date: work.bookmarkDate } : {}),
  ...(work.bookmarkUser ? { user: work.bookmarkUser } : {}), ...(work.bookmarkCount !== undefined ? { count: work.bookmarkCount } : {}) }
}
/** Date-only AO3 timestamps cannot establish reading order on the same day. */
function chapterProgressBeforeBookmark(dates: Record<string, string> | undefined, published: number | undefined, bookmark: string | null): number {
 if (!dates || !published || !bookmark || !isCalendarDate(bookmark)) return 0
 let progress = 0
 for (let position = 1; position <= published && isCalendarDate(dates[String(position)] ?? '') && dates[String(position)] < bookmark; position++) progress = position
 return progress
}

export function bookmarkReadingState(work: CsvWork) {
 const datedProgress = work.source === 'bookmarks' ? chapterProgressBeforeBookmark(work.metadata.chapter_dates, work.metadata.published_chapters, work.bookmarkDate) : 0
 if (work.importReadingStatus) return { status: work.importReadingStatus, progress: work.importReadingStatus === 'finished' ? work.metadata.published_chapters ?? 0 : work.importReadingStatus === 'reading' ? datedProgress : 0, finishedAt: work.importReadingStatus === 'finished' ? new Date().toISOString() : null }
 const finished = work.source === 'bookmarks' && Boolean(work.bookmarkDate && work.updatedDate && work.bookmarkDate > work.updatedDate)
 return { status: work.source === 'marked_for_later' ? 'to_read' as const : finished ? 'finished' as const : 'reading' as const,
  progress: finished ? work.metadata.published_chapters ?? 0 : datedProgress, finishedAt: finished ? work.bookmarkDate : null }
}
/** Work metadata never participates in personal bookmark conflict review. */
export function bookmarkConflicts(works: CsvWork[], existing: CsvConflict[]) {
 return existing.filter(saved => {
  const incoming = works.find(work => work.workId !== null ? work.workId === saved.workId : work.bookmarkId === saved.bookmarkId)
  if (!incoming || incoming.source !== 'bookmarks') return false
  if (incoming.workStatus === 'deleted') return saved.notes !== incoming.notes || JSON.stringify([...saved.tags].sort()) !== JSON.stringify([...incoming.tags].sort())
  const reading = bookmarkReadingState(incoming)
  return saved.notes !== incoming.notes || JSON.stringify([...saved.tags].sort()) !== JSON.stringify([...incoming.tags].sort())
   || saved.status !== reading.status || (reading.status === 'finished' && incoming.metadata.published_chapters !== undefined && saved.progress !== reading.progress) || (saved.finishedAt?.slice(0, 10) ?? null) !== reading.finishedAt
 })
}
