import { Fragment, type ReactNode } from 'react'
import './metadata-tags.css'

/** Use the same dividers for metadata lists and grouped facts. */
export function BulletSeparated({ values }: { values: readonly ReactNode[] }) {
  return values.map((value, index) => <Fragment key={index}>{index > 0 && <span className="info-separator"> • </span>}{value}</Fragment>)
}
