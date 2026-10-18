import { Anchor, BookOpen, BookOpenText, Bookmark, Check, Cloud, Compass, Feather, Flame, FlaskConical, Flower2, Gem, Heart, KeyRound, Leaf, Library, Moon, Music, Sun, Telescope, X } from 'lucide-react'

export const collectionColors = [
  { label: 'Burgundy', value: '#970000' }, { label: 'Forest', value: '#354a35' },
  { label: 'Navy', value: '#2e415c' }, { label: 'Amber', value: '#8b491e' },
  { label: 'Plum', value: '#56324f' }, { label: 'Charcoal', value: '#37312f' },
  { label: 'Rose', value: '#92504e' },
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
] as const

export type CollectionAppearance = { color: string; symbol: string }

export function compareCollections(a: { name: string; sort_position?: number | null }, b: { name: string; sort_position?: number | null }) {
  return (a.sort_position ?? Number.MAX_SAFE_INTEGER) - (b.sort_position ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)
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
