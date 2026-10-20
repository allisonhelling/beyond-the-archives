import type { Json } from '../../types/database'
import type { Story, StoryInput } from './model'

export type EditValues = Record<string, Json | undefined>
export type FieldConflict = { field: string; base: Json; local: Json; saved: Json }
export type MergeResult = { merged: EditValues; conflicts: FieldConflict[] }
export function editSnapshot(story: Story): EditValues {
  return { status: story.reading_status, progress: story.last_read_chapter, notes: story.notes, rating: story.personal_rating, favorite: story.is_favorite, tags: story.personalTags, collections: story.collectionIds, metadata: story.metadata_overrides }
}
function equal(a: Json | undefined, b: Json | undefined, set = false): boolean {
  if (set && Array.isArray(a) && Array.isArray(b)) return equal([...new Set(a)].sort(), [...new Set(b)].sort())
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key => equal(a[key], b[key]))
  return JSON.stringify(a) === JSON.stringify(b)
}
export function mergeEdits(base: EditValues, local: EditValues, saved: EditValues): MergeResult {
  const reading = Object.hasOwn(local, 'status') || Object.hasOwn(local, 'progress')
  if (reading) {
    const group = (values: EditValues, fallback: EditValues) => ({ status: values.status ?? fallback.status ?? null, progress: values.progress ?? fallback.progress ?? null })
    const withoutReading = (values: EditValues) => Object.fromEntries(Object.entries(values).filter(([key]) => !['status', 'progress'].includes(key)))
    const originalSaved = saved
    saved = { ...withoutReading(saved), reading: group(saved, {}) }
    local = { ...withoutReading(local), reading: group(local, { ...originalSaved, ...base }) }
    base = { ...withoutReading(base), reading: group(base, {}) }
  }
  const merged = { ...saved }, conflicts: FieldConflict[] = []
  for (const [field, value] of Object.entries(local)) {
    if (field === 'metadata') {
      const nested = mergeEdits((base.metadata ?? {}) as EditValues, (value ?? {}) as EditValues, (saved.metadata ?? {}) as EditValues)
      merged.metadata = nested.merged
      conflicts.push(...nested.conflicts.map(conflict => ({ ...conflict, field: `metadata.${conflict.field}` })))
    } else if (!equal(value, base[field], ['tags', 'collections'].includes(field)) && !equal(value, saved[field], ['tags', 'collections'].includes(field))) {
      merged[field] = value
      if (!equal(saved[field], base[field], ['tags', 'collections'].includes(field))) conflicts.push({ field, base: base[field] ?? null, local: value ?? null, saved: saved[field] ?? null })
    }
  }
  if (reading) {
    Object.assign(merged, merged.reading); delete merged.reading
  }
  return { merged, conflicts }
}
export function resolveEdits(merged: EditValues, choices: EditValues) {
  const result = { ...merged }
  for (const [field, value] of Object.entries(choices)) {
    if (field === 'reading') Object.assign(result, value)
    else if (field.startsWith('metadata.')) result.metadata = { ...(result.metadata as EditValues), [field.slice(9)]: value }
    else result[field] = value
  }
  return result
}
export class EditConflict<T = unknown> extends Error {
  constructor(public review: MergeResult & { base: EditValues }, public retry: (choices: EditValues) => Promise<T>) {
    super('This fic changed on another device. Review the conflicting fields before saving.')
  }
}
export function conflictFromError<T>(error: { code?: string; details?: string } | null, retry: (values: EditValues, base: EditValues) => Promise<T>): EditConflict<T> | null {
  if (error?.code !== '40001' || !error.details) return null
  try {
    const review = JSON.parse(error.details) as MergeResult & { base: EditValues }
    if (!Array.isArray(review.conflicts) || !review.merged || !review.base) return null
    return new EditConflict(review, choices => retry(resolveEdits(review.merged, choices), review.base))
  } catch { return null }
}

export function storyEdits(input: StoryInput): EditValues {
  return { metadata: input.metadataChanges ?? input.metadata, status: input.status, progress: input.progress, notes: input.notes, rating: input.personalRating, favorite: input.favorite, collections: input.collections, tags: input.tags }
}
export function applyStoryEdits(input: StoryInput, values: EditValues, base: EditValues): StoryInput {
  return { ...input, base, status: values.status as StoryInput['status'], progress: values.progress as number, notes: values.notes as string, personalRating: values.rating as number | null, favorite: values.favorite as boolean, collections: values.collections as string[], tags: values.tags as string[], metadata: { ...input.metadata, ...(values.metadata as object) }, metadataChanges: values.metadata as StoryInput['metadataChanges'] }
}
