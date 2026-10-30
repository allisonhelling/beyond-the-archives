import { useId, useState, type ComponentProps } from 'react'
import { MetadataTags } from './MetadataTags'

/** One expandable tag list for organizer tiles and reader works. */
export function ExpandableMetadataTags({ values, limit = 7, className = '', ...props }: Omit<ComponentProps<typeof MetadataTags>, 'trailing'> & { limit?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false), id = useId()
  const tags = [...new Set(values)], overflow = tags.length > limit
  return <div className={`expandable-metadata-tags ${className}`.trim()} id={id}><MetadataTags {...props} values={expanded ? tags : tags.slice(0, limit)} trailing={overflow && <button type="button" className="tags-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show Less' : `+${tags.length - limit} more`}</button>} /></div>
}
