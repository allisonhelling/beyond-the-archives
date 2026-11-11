import { normalizeSearchText as normalizeTag } from '../../../lib/search-text'

export const tagFilterConfig = {
  fandoms: { label: 'Fandoms', defaultMode: 'any', modes: ['any', 'all', 'custom'] },
  relationship: { label: 'Relationships', defaultMode: 'all', modes: ['any', 'all'] },
  characters: { label: 'Characters', defaultMode: 'all', modes: ['any', 'all'] },
  tags: { label: 'Additional Tags', defaultMode: 'all', modes: ['any', 'all'] },
} as const
export type TagFilterKey = keyof typeof tagFilterConfig
export type TagMatchMode = 'any' | 'all' | 'custom'
export type TagExpression = { mode: 'any' | 'all'; tags: string[] } | { mode: 'custom'; groups: string[][] }
export type TagExpressions = Partial<Record<TagFilterKey, TagExpression>>
type FilterInput = { fandoms: string[]; relationship: string; characters: string; tags: string; tagExpressions?: TagExpressions }

/** Preserve first spelling/order; identity normalization follows the existing matcher. */
export function uniqueTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.filter((tag): tag is string => {
    if (typeof tag !== 'string' || !tag.trim() || tag.length > 10000 || /\p{Cc}/u.test(tag)) return false
    const key = normalizeTag(tag.trim())
    if (seen.has(key)) return false
    seen.add(key); return true
  }).map(tag => tag.trim())
}
export function normalizeTagExpression(value: unknown): TagExpression | undefined {
  if (!value || typeof value !== 'object') return
  const expression = value as Record<string, unknown>
  if ((expression.mode === 'any' || expression.mode === 'all') && Array.isArray(expression.tags)) return { mode: expression.mode, tags: uniqueTags(expression.tags) }
  if (expression.mode === 'custom' && Array.isArray(expression.groups)) return { mode: 'custom', groups: expression.groups.map(uniqueTags).filter(group => group.length) }
}
export function normalizeTagExpressions(value: unknown): TagExpressions {
  const result: TagExpressions = {}
  if (!value || typeof value !== 'object') return result
  for (const key of Object.keys(tagFilterConfig) as TagFilterKey[]) {
    const expression = normalizeTagExpression((value as Record<string, unknown>)[key])
    if (expression) result[key] = expression
  }
  return result
}
export function tagExpression(filters: FilterInput, key: TagFilterKey): TagExpression {
  return normalizeTagExpression(filters.tagExpressions?.[key]) ?? {
    mode: tagFilterConfig[key].defaultMode,
    tags: key === 'fandoms' ? filters.fandoms : filters[key].split(',').map(tag => tag.trim()).filter(Boolean),
  }
}
export function expressionTags(expression: TagExpression) {
  return uniqueTags(expression.mode === 'custom' ? expression.groups.flat() : expression.tags)
}
export function convertTagExpression(expression: TagExpression, mode: TagMatchMode): TagExpression {
  if (mode === expression.mode) return expression
  const tags = expressionTags(expression)
  return mode === 'custom' ? { mode, groups: expression.mode === 'any' ? tags.map(tag => [tag]) : tags.length ? [tags] : [] } : { mode, tags }
}
/** The Boolean engine knows neither provider markup nor category-specific alias rules. */
export function matchesTagExpression(expression: TagExpression, matches: (tag: string) => boolean) {
  if (expression.mode !== 'custom') return !expression.tags.length || (expression.mode === 'any' ? expression.tags.some(matches) : expression.tags.every(matches))
  const groups = expression.groups.filter(group => group.length)
  return !groups.length || groups.some(group => group.every(matches))
}
/** Compatibility fields mirror the active expression for older readers only. */
export function withTagExpression<T extends FilterInput>(filters: T, key: TagFilterKey, expression: TagExpression): T {
  const normalized = normalizeTagExpression(expression)!
  const tags = expressionTags(normalized)
  return { ...filters, [key]: key === 'fandoms' ? tags : tags.join(', '), tagExpressions: { ...filters.tagExpressions, [key]: normalized } }
}
export type CustomRestoration = { groups: string[][]; signature: string }
const signature = (expression: TagExpression) => JSON.stringify(expressionTags(expression).map(normalizeTag).sort())
export function changeTagMode(expression: TagExpression, mode: TagMatchMode, snapshot?: CustomRestoration) {
  if (expression.mode === 'custom' && mode !== 'custom') snapshot = { groups: expression.groups.map(group => [...group]), signature: signature(expression) }
  const next: TagExpression = mode === 'custom' && snapshot?.signature === signature(expression) ? { mode, groups: snapshot.groups } : convertTagExpression(expression, mode)
  return { expression: next, snapshot }
}
