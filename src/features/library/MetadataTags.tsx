import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTagAppearance } from './display/useDisplayPreference'
import './metadata-tags.css'
import { tagColors, type TagAppearance, type TagCategory, type TagShape } from './display/display-settings'

/** Shared tag chips for tiles and information pages; category labels stay outside the chips. */
export function MetadataTags({ values, category = 'tags', shape, categoryFor, onRemove, removeLabel, appearance: suppliedAppearance, onTagClick, trailing }: { values: string[]; category?: TagCategory | null; shape?: TagShape; categoryFor?: (value: string) => TagCategory | null | undefined; onRemove?: (value: string) => void; removeLabel?: (value: string) => string; appearance?: TagAppearance; onTagClick?: (value: string) => void; trailing?: ReactNode }) {
  const savedPreference = useTagAppearance()
  const preference = suppliedAppearance ?? savedPreference
  const color = category === null ? 'var(--color-link)' : preference.colors?.[category] ?? tagColors[category].color
  const appearance = shape ?? preference.shape ?? 'bullets'
  return values.length ? <span className="metadata-tags categorized-tags" data-tag-category={category} data-tag-shape={appearance} style={{ '--tag-color': color, '--tag-filled-color': preference.colors?.tags ?? 'var(--color-text, inherit)' } as CSSProperties}>{[...new Set(values)].map((value, index) => { const kind = categoryFor ? categoryFor(value) : category; const tagColor = kind === null ? 'var(--color-link)' : preference.colors?.[kind ?? 'tags'] ?? tagColors[kind ?? 'tags'].color; const attributes = { 'data-tag-category': kind, style: categoryFor ? { '--tag-color': tagColor } as CSSProperties : undefined }; return <Fragment key={value}>{index > 0 && (onRemove ? ' ' : appearance === 'bullets' || appearance === 'commas' ? <span className={appearance === 'bullets' ? 'info-separator' : 'tag-separator'}>{appearance === 'bullets' ? ' • ' : ', '}</span> : ' ')}{onRemove ? <button type="button" className="metadata-tag" {...attributes} aria-label={removeLabel?.(value) ?? `Remove ${value}`} onClick={() => onRemove(value)}>{value}<X size={14} aria-hidden="true" /></button> : onTagClick ? <button type="button" className="metadata-tag" {...attributes} onClick={() => onTagClick(value)}>{value}</button> : <span className="metadata-tag" {...attributes}>{value}</span>}</Fragment> })}{trailing}</span> : <>None saved</>
}
