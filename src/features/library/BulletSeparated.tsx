import { useContext } from 'react'
import { TagFilterContext } from './tag-filter-context'
import { Fragment, type ReactNode } from 'react'
import './metadata-tags.css'

/** Use the same dividers for metadata lists and grouped facts. */
export function BulletSeparated({ values, onSelect: suppliedSelect }: { values: readonly ReactNode[]; onSelect?: (value: string) => void }) {
  const filterTag = useContext(TagFilterContext)
  const onSelect = suppliedSelect ?? filterTag
  return values.map((value, index) => <Fragment key={index}>{index > 0 && <span className="info-separator"> • </span>}{onSelect && typeof value === 'string' ? <span role="button" tabIndex={0} className="metadata-link" onClick={() => onSelect(value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(value) } }}>{value}</span> : value}</Fragment>)
}
