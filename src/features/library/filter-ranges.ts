import { datePlaceholder, isCalendarDate } from '../../lib/dates'
import type { Story } from './model'

export const numericFilterFields = {
  word_count: 'Words', published_chapters: 'Published Chapters', kudos: 'Kudos',
  bookmark_count: 'Bookmarks', comment_count: 'Comments', hits: 'Hits',
} as const
export const dateFilterFields = { published: 'Published', updated: 'Updated', imported: 'Imported' } as const
export type RangeBound = 'min' | 'max'
export type RangeField = keyof typeof numericFilterFields | keyof typeof dateFilterFields
export type FilterRanges = Partial<Record<RangeField, Partial<Record<RangeBound, string>>>>
export const rangeBounds = ['min', 'max'] as const
export const filterRangeFields = { ...numericFilterFields, ...dateFilterFields }
const rangeKeys = Object.keys(filterRangeFields) as RangeField[]
export const isDateRange = (field: RangeField): field is keyof typeof dateFilterFields => Object.hasOwn(dateFilterFields, field)
export const rangeBoundLabel = (field: RangeField, bound: RangeBound) => isDateRange(field) ? bound === 'min' ? 'From' : 'Through' : bound === 'min' ? 'Min' : 'Max'

export function normalizeFilterRanges(value: unknown): FilterRanges {
  const result: FilterRanges = {}
  if (!value || typeof value !== 'object') return result
  for (const key of rangeKeys) {
    const range = (value as FilterRanges)[key]
    if (!range || typeof range !== 'object') continue
    const bounds = Object.fromEntries(rangeBounds.flatMap(bound => typeof range[bound] === 'string' && range[bound] ? [[bound, range[bound]]] : []))
    if (Object.keys(bounds).length) result[key] = bounds
  }
  return result
}

export function rangeMatcher(filters: { ranges?: FilterRanges; updatedAfter?: string; updatedBefore?: string }) {
  const ranges = normalizeFilterRanges(filters.ranges)
  const minUpdated = ranges.updated?.min ?? filters.updatedAfter
  const maxUpdated = ranges.updated?.max ?? filters.updatedBefore
  if (minUpdated || maxUpdated) ranges.updated = { min: minUpdated, max: maxUpdated }
  const checks = Object.entries(ranges).map(([key, bounds]) => {
    const field = key as RangeField, date = isDateRange(field)
    const { min, max } = bounds
    for (const bound of rangeBounds) {
      const value = bounds[bound]
      if (!value) continue
      if (date && !isCalendarDate(value)) throw new Error(`Enter a valid ${rangeBoundLabel(field, bound)} date (${datePlaceholder()}).`)
      if (!date && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new Error(`${filterRangeFields[field]} must use non-negative whole numbers.`)
    }
    if (date && min && max && min > max) throw new Error(`${filterRangeFields[field]} start date must be before the end date.`)
    if (!date && min && max && Number(min) > Number(max)) throw new Error(`${filterRangeFields[field]}: minimum must not exceed maximum.`)
    if (isDateRange(field)) return (story: Story) => {
      const raw = field === 'updated' ? story.work.ao3_updated_at : field === 'published' ? story.work.ao3_published_at : story.created_at
      const time = raw ? Date.parse(raw) : NaN
      if (!Number.isFinite(time)) return false
      const value = new Date(time).toISOString().slice(0, 10)
      return (!min || value >= min) && (!max || value <= max)
    }
    const lower = min ? Number(min) : 0
    const upper = max ? Number(max) : Infinity
    return (story: Story) => {
      const value = story.metadata[field]
      return typeof value === 'number' && value >= lower && value <= upper
    }
  })
  return (story: Story) => checks.every(check => check(story))
}
