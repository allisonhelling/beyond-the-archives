import type { Collection, Status, Story } from '../model'
import { Anchor, BookOpen, BookOpenText, Bookmark, Check, Cloud, Compass, Feather, Flame, FlaskConical, Flower2, Gem, Heart, KeyRound, Leaf, Library, Layers3, Moon, Music, Pause, Sparkle, ScrollText, Star, Sun, Telescope, X, type LucideIcon } from 'lucide-react'

export const readingStatusIcons: Record<Status, LucideIcon> = { to_read: Bookmark, reading: BookOpenText, paused_reading: Pause, re_reading: BookOpenText, waiting_for_updates: BookOpenText, finished: Check, did_not_finish: X }
export const automaticCollectionIcons: Partial<Record<string, LucideIcon>> = { all: Library, series: Layers3, currently_reading: readingStatusIcons.reading, paused_reading: readingStatusIcons.paused_reading, to_read: readingStatusIcons.to_read, favorites: Star, recs: Heart, finished: readingStatusIcons.finished, did_not_finish: readingStatusIcons.did_not_finish }

export const defaultShelfColors = { all: '#970000', currently_reading: '#214921', paused_reading: '#92504e', to_read: '#243c5e', favorites: '#54254b', recs: '#8b491e', finished: '#4a1b0f', did_not_finish: '#25211f', series: '#07534a' } as const

export const collectionColors = [
  { label: 'Burgundy', value: defaultShelfColors.all }, { label: 'Forest', value: defaultShelfColors.currently_reading },
  { label: 'Navy', value: defaultShelfColors.to_read }, { label: 'Finished', value: defaultShelfColors.finished },
  { label: 'One Shots', value: '#721613' },
  { label: 'Plum', value: defaultShelfColors.favorites }, { label: 'Charcoal', value: defaultShelfColors.did_not_finish },
  { label: 'Rose', value: defaultShelfColors.paused_reading }, { label: 'Teal', value: defaultShelfColors.series },
] as const

export const collectionSymbols = [
  { value: 'flask', label: 'Flask', Icon: FlaskConical }, { value: 'moon', label: 'Moon', Icon: Moon },
  { value: 'feather', label: 'Feather', Icon: Feather }, { value: 'leaf', label: 'Leaf', Icon: Leaf },
  { value: 'flame', label: 'Flame', Icon: Flame }, { value: 'compass', label: 'Compass', Icon: Compass },
  { value: 'anchor', label: 'Anchor', Icon: Anchor }, { value: 'cloud', label: 'Cloud', Icon: Cloud },
  { value: 'music', label: 'Music', Icon: Music }, { value: 'key', label: 'Key', Icon: KeyRound },
  { value: 'sun', label: 'Sun', Icon: Sun }, { value: 'gem', label: 'Gem', Icon: Gem },
  { value: 'flower', label: 'Flower', Icon: Flower2 }, { value: 'telescope', label: 'Telescope', Icon: Telescope },
  { value: 'book', label: 'Book', Icon: BookOpen }, { value: 'reading', label: 'Reading', Icon: BookOpenText },
  { value: 'bookmark', label: 'Bookmark', Icon: Bookmark }, { value: 'heart', label: 'Heart', Icon: Heart },
  { value: 'check', label: 'Check', Icon: Check }, { value: 'cross', label: 'Cross', Icon: X },
  { value: 'library', label: 'Library', Icon: Library },
  { value: 'sparkle', label: 'Four-Pointed Star', Icon: Sparkle }, { value: 'scroll', label: 'Scroll With Text', Icon: ScrollText },
] as const

export type CollectionAppearance = { color: string; symbol: string }
export type CollectionChanges = Partial<CollectionAppearance> & { description?: string | null }

export function normalizeCollectionChanges(changes: CollectionChanges): CollectionChanges {
  validateCollectionAppearance({ color: changes.color ?? collectionColors[0].value, symbol: changes.symbol ?? collectionSymbols[0].value })
  return {
    ...(changes.color !== undefined && { color: changes.color }),
    ...(changes.symbol !== undefined && { symbol: changes.symbol }),
    ...(changes.description !== undefined && { description: changes.description?.trim() || null }),
  }
}

export function compareCollections(a: { created_at?: string; sort_position?: number | null }, b: { created_at?: string; sort_position?: number | null }) {
  return (a.sort_position ?? Number.MAX_SAFE_INTEGER) - (b.sort_position ?? Number.MAX_SAFE_INTEGER) || (a.created_at ?? '').localeCompare(b.created_at ?? '')
}

export const collectionOrderOptions = [
  { value: 'manual', label: 'Manual Order' },
  { value: 'manual_reverse', label: 'Manual Order (Reversed)' },
  { value: 'alphabetical', label: 'Alphabetical (A–Z)' },
  { value: 'alphabetical_reverse', label: 'Alphabetical (Z–A)' },
  { value: 'created', label: 'Date Created (Oldest First)' },
  { value: 'created_newest', label: 'Date Added' },
  { value: 'edited', label: 'Last Edited (Story Added)' },
  { value: 'edited_reverse', label: 'Last Edited (Oldest First)' },
  { value: 'updated', label: 'Last Story Updated (Newest First)' },
  { value: 'updated_reverse', label: 'Last Story Updated (Oldest First)' },
] as const
export type CollectionOrder = typeof collectionOrderOptions[number]['value']

export function orderCollections(collections: Collection[], stories: Pick<Story, 'collectionIds' | 'updated_at'>[], order: CollectionOrder) {
  const reverse = order.endsWith('_reverse')
  const baseOrder = order.replace(/_reverse$/, '')
  const latest = new Map<string, number>()
  if (baseOrder === 'updated') for (const story of stories) {
    for (const id of story.collectionIds) latest.set(id, Math.max(latest.get(id) ?? 0, Date.parse(story.updated_at) || 0))
  }
  const sorted = [...collections].sort((a, b) => {
    if (baseOrder === 'alphabetical') return a.name.localeCompare(b.name) || compareCollections(a, b)
    if (baseOrder === 'created') return (a.created_at ?? '').localeCompare(b.created_at ?? '') || compareCollections(a, b)
    if (baseOrder === 'created_newest') return (b.created_at ?? '').localeCompare(a.created_at ?? '') || compareCollections(a, b)
    if (baseOrder === 'edited') return (Date.parse(b.last_story_added_at ?? '') || 0) - (Date.parse(a.last_story_added_at ?? '') || 0) || compareCollections(a, b)
    if (baseOrder === 'updated') return (latest.get(b.id) ?? 0) - (latest.get(a.id) ?? 0) || compareCollections(a, b)
    return compareCollections(a, b)
  })
  return reverse ? sorted.reverse() : sorted
}

export function moveCollectionIds(ids: string[], sourceId: string, targetId: string, selectedIds: string[] = []) {
  const source = ids.indexOf(sourceId), target = ids.indexOf(targetId)
  if (source < 0 || target < 0) return ids
  const moving = selectedIds.includes(sourceId) ? ids.filter(id => selectedIds.includes(id)) : [sourceId]
  if (moving.includes(targetId)) return ids
  const remaining = ids.filter(id => !moving.includes(id))
  remaining.splice(remaining.indexOf(targetId) + (source < target ? 1 : 0), 0, ...moving)
  return remaining
}

export const collectionColorPattern = '^#[0-9a-fA-F]{6}$'

export function getCollectionColors(collections: { color: string | null; default_key: string | null }[]) {
  const colors: { label: string; value: string }[] = [...collectionColors]
  const seen = new Set(colors.map(option => option.value))
  const validColor = new RegExp(collectionColorPattern)
  for (const collection of collections) {
    const value = collection.color?.toLowerCase()
    if (collection.default_key || !value || !validColor.test(value) || seen.has(value)) continue
    seen.add(value)
    colors.push({ label: value, value })
  }
  return colors
}

export function validateCollectionAppearance(appearance: CollectionAppearance) {
  if (!new RegExp(collectionColorPattern).test(appearance.color)) throw new Error('Choose a valid collection color.')
  if (!collectionSymbols.some(option => option.value === appearance.symbol)) throw new Error('Choose a collection symbol.')
}
