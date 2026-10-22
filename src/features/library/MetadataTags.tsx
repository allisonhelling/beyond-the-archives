import { Fragment, type CSSProperties } from 'react'
import { useTagAppearance } from './useDisplayPreference'
import { tagColors, type TagCategory, type TagShape } from './display-settings'

/** Shared tag chips for tiles and information pages; category labels stay outside the chips. */
export function MetadataTags({ values, category = 'tags', shape }: { values: string[]; category?: TagCategory; shape?: TagShape }) {
  const preference = useTagAppearance()
  const color = preference.colors?.[category] ?? tagColors[category].color
  const appearance = shape ?? preference.shape ?? 'bullets'
  return values.length ? <span className="metadata-tags categorized-tags" data-tag-category={category} data-tag-shape={appearance} style={{ '--tag-color': color } as CSSProperties}>{[...new Set(values)].map((value, index) => <Fragment key={value}>{index > 0 && (appearance === 'bullets' || appearance === 'commas' ? <span className={appearance === 'bullets' ? 'info-separator' : 'tag-separator'}>{appearance === 'bullets' ? ' • ' : ', '}</span> : ' ')}<span className="metadata-tag">{value}</span></Fragment>)}</span> : <>None saved</>
}
