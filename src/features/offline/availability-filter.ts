import { safeBookFusionLink } from '../library/bookfusion/bookfusion'
import type { Story } from '../library/model'

const platforms = [
  { value: 'any-offline', label: 'Any Offline Stories' },
  { value: 'online-only', label: 'Online Only' },
  { value: 'unfolded', label: 'Archives Unfolded' },
  { value: 'bookfusion', label: 'BookFusion' },
] as const

export type LibraryAvailability = typeof platforms[number]['value']

export const availabilityOptions = [
  { value: '', label: 'All Works' },
  ...platforms,
  ...['Apple Books', 'Kindle', 'PocketBook'].map(label => ({ value: label, label, disabled: true })),
]

export function parseLibraryAvailability(value: unknown): LibraryAvailability | undefined {
  return platforms.find(option => option.value === value)?.value
}

export function matchesLibraryAvailability(story: Story, availability: LibraryAvailability, downloaded: ReadonlySet<string>) {
  if (story.id.startsWith('series:')) return false
  const unfolded = downloaded.has(String(story.work.ao3_work_id))
  const bookfusion = Boolean(safeBookFusionLink(story.metadata.bookfusion_link))
  switch (availability) {
    case 'unfolded': return unfolded
    case 'bookfusion': return bookfusion
    case 'any-offline': return unfolded || bookfusion
    case 'online-only': return !unfolded && !bookfusion
  }
}
