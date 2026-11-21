import { TagFilterContext } from './tag-filter-context'
import { useContext, Fragment, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTagAppearance } from './display/useDisplayPreference'
import './metadata-tags.css'
import { defaultAllTagColor, tagColors, tagTextColor, type TagAppearance, type TagCategory, type TagShape } from './display/display-settings'

/** Shared tag chips for tiles and information pages; category labels stay outside the chips. */
export function MetadataTags({ values, category = 'tags', shape, categoryFor, onRemove, removeLabel, appearance: suppliedAppearance, onTagClick, trailing }: { values: string[]; category?: TagCategory | null; shape?: TagShape; categoryFor?: (value: string) => TagCategory | null | undefined; onRemove?: (value: string) => void; removeLabel?: (value: string) => string; appearance?: TagAppearance; onTagClick?: (value: string) => void; trailing?: ReactNode }) {
  const filterTag = useContext(TagFilterContext)
  const clickTag = onTagClick ?? filterTag
  const savedPreference = useTagAppearance()
  const preference = suppliedAppearance ?? savedPreference
  const colorFor = (kind: TagCategory | null | undefined) => kind === null ? 'var(--color-link)' : preference.colorMode === 'mono' ? preference.allColor ?? defaultAllTagColor : preference.colors?.[kind ?? 'tags'] ?? tagColors[kind ?? 'tags'].color
  const color = colorFor(category)
  const appearance = shape ?? preference.shape ?? 'bullets'
  const textOnly = appearance === 'bullets' || appearance === 'commas'
  return <span className="metadata-tags categorized-tags" data-tag-category={category} data-tag-shape={appearance} data-tag-text-color={onRemove || category === 'personalTags' || category === 'collections' ? undefined : tagTextColor(preference, appearance)} style={{ '--tag-color': color } as CSSProperties}>{[...new Set(values.length ? values : ['No Tags Saved'])].map((value, index) => { const kind = categoryFor ? categoryFor(value) : category; const tagColor = colorFor(kind); const lastWord = value.lastIndexOf(' ') + 1; const attributes = { 'data-tag-category': kind, style: categoryFor ? { '--tag-color': tagColor } as CSSProperties : undefined }; return <Fragment key={value}>{index > 0 && (onRemove ? ' ' : textOnly ? <span className={appearance === 'bullets' ? 'info-separator' : 'tag-separator'}>{appearance === 'bullets' ? ' • ' : ', '}</span> : ' ')}{onRemove && values.length ? <button type="button" className="metadata-tag removable-tag" {...attributes} aria-label={removeLabel?.(value) ?? `Remove ${value}`} onClick={() => onRemove(value)}>{value.slice(0, lastWord)}<span className="tag-remove-tail">{value.slice(lastWord)}<X size={14} aria-hidden="true" /></span></button> : clickTag && values.length ? textOnly ? <span role="button" tabIndex={0} className="metadata-tag" {...attributes} onClick={() => clickTag(value)} onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); clickTag(value) }
  }}>{value}</span> : <button type="button" className="metadata-tag" {...attributes} onClick={() => clickTag(value)}>{value}</button> : <span className="metadata-tag" {...attributes}>{value}</span>}</Fragment> })}{trailing}</span>
}
