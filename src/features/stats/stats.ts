import type { Metadata, Story } from '../library/model'
import { chapterReadEvents, type ChapterReadEvent } from '../library/reading-history'
import { formatDate, type DateFormat } from '../../lib/dates'

export type Period = { year: number; month: number; mode: 'monthly' | 'yearly' | 'all_time' }
export type StatsWork = Pick<Story, 'id' | 'created_at' | 'reading_status' | 'reading_history' | 'personal_rating'> & { key: string; metadata: Metadata; archived: boolean }
export type Observation = { work: StatsWork; event: ChapterReadEvent; unique: boolean; pass: number }
export type Bucket = { label: string; value: number; key?: string }
export type Dimension = 'fandoms' | 'categories' | 'rating' | 'length' | 'personal_rating' | 'authors' | 'character_tags' | 'relationship_tags' | 'additional_tags'
export const dimensions: { key: Dimension; title: string }[] = [
 { key: 'fandoms', title: 'Fandoms' }, { key: 'categories', title: 'Relationship Types' }, { key: 'rating', title: 'Content Ratings' },
 { key: 'length', title: 'Length Classes' }, { key: 'personal_rating', title: 'Personal Ratings' }, { key: 'authors', title: 'Authors' },
 { key: 'character_tags', title: 'Characters' }, { key: 'relationship_tags', title: 'Relationships' }, { key: 'additional_tags', title: 'Additional Tags' },
]
export const months = Array.from({ length: 12 }, (_, index) => new Date(2024, index, 1).toLocaleString('en-US', { month: 'long' }))
export function periodBounds(period: Period): [number, number] {
 if (period.mode === 'all_time') return [-Infinity, Infinity]
 const start = new Date(0), end = new Date(0)
 start.setFullYear(period.year, period.mode === 'yearly' ? 0 : period.month, 1); start.setHours(0, 0, 0, 0)
 end.setFullYear(period.year + (period.mode === 'yearly' ? 1 : 0), period.mode === 'yearly' ? 0 : period.month + 1, 1); end.setHours(0, 0, 0, 0)
 return [start.getTime(), end.getTime()]
}
export function shiftPeriod(period: Period, offset: number): Period {
 if (period.mode === 'all_time') return period
 const month = period.month + (period.mode === 'monthly' ? offset : 0)
 return { ...period, year: period.year + (period.mode === 'yearly' ? offset : Math.floor(month / 12)), month: (month % 12 + 12) % 12 }
}
export function periodText(period: Period, format: DateFormat): string {
 return period.mode === 'all_time' ? 'All Time' : period.mode === 'yearly' ? String(period.year).padStart(4, '0') : format === 'YMD'
  ? `${String(period.year).padStart(4, '0')}-${String(period.month + 1).padStart(2, '0')}` : `${String(period.month + 1).padStart(2, '0')}/${String(period.year).padStart(4, '0')}`
}
export function parsePeriod(value: string, period: Period, format: DateFormat): Period | null {
 if (period.mode === 'all_time') return null
 const match = period.mode === 'yearly' ? /^(\d{4})$/.exec(value.trim()) : (format === 'YMD' ? /^(\d{4})-(\d{1,2})$/ : /^(\d{1,2})\/(\d{4})$/).exec(value.trim())
 if (!match) return null
 const year = Number(match[period.mode === 'yearly' || format === 'YMD' ? 1 : 2]), month = period.mode === 'yearly' ? period.month : Number(match[format === 'YMD' ? 2 : 1]) - 1
 return year >= 1 && year <= 9999 && month >= 0 && month < 12 ? { ...period, year, month } : null
}
/** Classify across the full history before filtering dates so a repeat never becomes unique. */
export function observations(works: StatsWork[]): Observation[] {
 const result: Observation[] = [], seen = new Set<string>(), ids = new Set<string>()
 const events = works.flatMap(work => chapterReadEvents(work.reading_history).map(event => ({ work, event }))).sort((a, b) => Date.parse(a.event.at) - Date.parse(b.event.at))
 const repeats = new Map<string, number>()
 for (const { work, event } of events) {
  const eventKey = `${work.key}:${event.id || `${event.at}:${event.chapter}`}`
  if (ids.has(eventKey)) continue
  ids.add(eventKey)
  const key = `${work.key}:${event.chapter}`
  const unique = !event.is_reread && !seen.has(key)
  seen.add(key)
  const pass = unique ? 0 : (repeats.get(key) ?? 0) + 1
  if (!unique) repeats.set(key, pass)
  result.push({ work, event, unique, pass })
 }
 return result
}
export function inPeriod(data: Observation[], period: Period): Observation[] {
 const [start, end] = periodBounds(period)
 return data.filter(({ event }) => Date.parse(event.at) >= start && Date.parse(event.at) < end)
}
export function totals(data: Observation[]) {
 let unique = 0, reread = 0, unknown = 0
 for (const row of data) {
  if (row.event.word_count === null) unknown++
  else if (row.unique) unique += row.event.word_count
  else reread += row.event.word_count
 }
 return { unique, reread, words: unique + reread, unknown, chapters: data.length, works: new Set(data.map(row => row.work.key)).size }
}
export function lengthClass(words: number | null): string {
 return words === null ? 'Unknown' : words < 1000 ? 'Flash Fiction / Drabble' : words < 10000 ? 'Short Story / One-Shot' : words < 40000 ? 'Novelette / Novella' : words <= 100000 ? 'Novel Length' : 'Epic Length'
}
function labels(work: StatsWork, dimension: Dimension): string[] {
 if (dimension === 'length') return [lengthClass(work.metadata.word_count)]
 if (dimension === 'personal_rating') return [work.personal_rating === null ? 'Unrated' : `${work.personal_rating} Star${work.personal_rating === 1 ? '' : 's'}`]
 const value = work.metadata[dimension]
 return [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(Boolean))]
}
/** Keep reading-pass selection and tag weighting shared by distributions and rankings. */
function rank(data: Observation[], dimension: Dimension, basis: 'words' | 'fics', includeRereads: boolean, splitCredit: boolean): Bucket[] {
 const values = new Map<string, number>(), seen = new Set<string>()
 for (const row of data) {
  if (!includeRereads && !row.unique) continue
  const key = `${row.work.key}:${row.pass}`
  if (basis === 'fics' && seen.has(key)) continue
  seen.add(key)
  const tags = labels(row.work, dimension), names = tags.length ? tags : splitCredit ? ['Unknown'] : []
  const weight = (basis === 'words' ? row.event.word_count ?? 0 : 1) / (splitCredit ? names.length : 1)
  for (const label of names) values.set(label, (values.get(label) ?? 0) + weight)
 }
 return [...values].map(([label, value]) => ({ label, value })).filter(row => row.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}
/** Split multi-tag credit equally so percentages sum to 100%, without duplicating consumption. */
export function distribution(data: Observation[], dimension: Dimension, basis: 'words' | 'fics', includeRereads: boolean): Bucket[] {
 return rank(data, dimension, basis, includeRereads, true)
}
/** Favorites give full credit to each tag; values represent appearances rather than percentages. */
export function favorites(data: Observation[], dimension: Dimension, basis: 'words' | 'fics', includeRereads = true): Bucket[] {
 return rank(data, dimension, basis, includeRereads, false)
}
export function statusProgress(works: StatsWork[], period: Period): Bucket[] {
 const [start, end] = periodBounds(period), counts = new Map<string, number>()
 for (const work of works) {
  const history = (work.reading_history ?? []).filter(event => Number.isFinite(Date.parse(event.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const activity = period.mode === 'all_time' || history.some(event => Date.parse(event.at) >= start && Date.parse(event.at) < end) || Date.parse(work.created_at) >= start && Date.parse(work.created_at) < end
  if (!activity) continue
  const status = history.filter(event => Date.parse(event.at) < end).at(-1)?.status ?? work.reading_status
  counts.set(status, (counts.get(status) ?? 0) + 1)
 }
 return [...counts].map(([label, value]) => ({ label, value }))
}
export function heatmap(data: Observation[]): number[][] {
 const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
 for (const { event } of data) { const date = new Date(event.at); grid[date.getDay()][date.getHours()]++ }
 return grid
}
export function timeBuckets(data: Observation[], period: Period, daily = false): Bucket[] {
 if (period.mode === 'all_time') {
  const values = new Map<string, number>()
  for (const { event } of data) {
   const date = new Date(event.at)
   const key = String(date.getFullYear()).padStart(4, '0') + (daily ? `-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '')
   values.set(key, (values.get(key) ?? 0) + (event.word_count ?? 0))
  }
  return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ label: daily ? formatDate(key) : key, value }))
 }
 const count = period.mode === 'yearly' && !daily ? 12 : Math.round((Date.UTC(period.year, period.mode === 'yearly' ? 12 : period.month + 1, 1) - Date.UTC(period.year, period.mode === 'yearly' ? 0 : period.month, 1)) / 86400000)
 const values = Array<number>(count).fill(0)
 for (const { event } of data) {
  const date = new Date(event.at)
  const index = period.mode === 'yearly' && !daily ? date.getMonth() : period.mode === 'monthly' ? date.getDate() - 1 : Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(period.year, 0, 1)) / 86400000)
  if (index >= 0 && index < count) values[index] += event.word_count ?? 0
 }
 return values.map((value, index) => {
  const date = new Date(period.year, period.mode === 'yearly' ? 0 : period.month, index + 1)
  return { label: period.mode === 'yearly' && !daily ? months[index] : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value }
 })
}
