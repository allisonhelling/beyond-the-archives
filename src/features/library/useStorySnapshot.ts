import { useState } from 'react'
import type { Story } from './model'

/** Keep mounted editors/menus while a catalog refresh replaces their backing
 * record with a lightweight entry. The owning page still hydrates fresh data. */
export function useStorySnapshot(candidate: Story | undefined) {
  const [loaded, setLoaded] = useState(candidate?.detailsLoaded === false ? undefined : candidate)
  if (candidate && candidate.detailsLoaded !== false && candidate !== loaded) setLoaded(candidate)
  return candidate?.detailsLoaded === false && loaded?.id === candidate.id ? loaded : candidate
}
