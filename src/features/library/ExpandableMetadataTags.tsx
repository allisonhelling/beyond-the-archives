import { useId, useState, type ComponentProps } from 'react'
import { MetadataTags } from './MetadataTags'
import type { TagCategory } from './display/display-settings'

type TagGroup = { category?: TagCategory | null; values: string[] }
/** One wrapping, expandable list; category colors never require separate rows. */
export function ExpandableMetadataTags({ values = [], groups, limit = 7, className = '', ...props }: Omit<ComponentProps<typeof MetadataTags>, 'trailing' | 'values'> & { values?: string[]; groups?: TagGroup[]; limit?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false), id = useId()
  const categories = new Map<string, TagCategory | null | undefined>()
  for (const group of groups ?? [{ values, category: props.category }]) for (const value of group.values) if (!categories.has(value)) categories.set(value, group.category)
  const tags = [...categories.keys()], overflow = tags.length > limit
  return <div className={`expandable-metadata-tags ${className}`.trim()} id={id}><MetadataTags {...props} categoryFor={groups ? value => categories.get(value) : props.categoryFor} values={expanded ? tags : tags.slice(0, limit)} trailing={overflow && <button type="button" className="tags-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show Less' : `+${tags.length - limit} more`}</button>} /></div>
}
