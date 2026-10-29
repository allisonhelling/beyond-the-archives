import { useId, useState } from 'react'
import { MetadataTags } from '../../src/features/library/MetadataTags'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { defaultTagAppearance } from './model'
export function WorkTags({ tags, onSearch, limit = 7, appearance = defaultTagAppearance }: { tags: string[]; onSearch?: (tag: string) => void; limit?: number; appearance?: TagAppearance }) {
  const [expanded, setExpanded] = useState(false), id = useId()
  const values = [...new Set(tags)], overflow = values.length > limit
  return <div className="tags" id={id}><MetadataTags values={expanded ? values : values.slice(0, limit)} appearance={appearance} onTagClick={onSearch} trailing={overflow && <button className="tags-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show Less' : `+${values.length - limit} more`}</button>} /></div>
}
