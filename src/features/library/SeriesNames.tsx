import { Fragment } from 'react'
import type { Metadata } from './model'

export function SeriesNames({ metadata }: { metadata: Metadata }) {
  return metadata.series?.length ? metadata.series.map((name, index) => {
    const membership = metadata.series_memberships?.find(series => series.name === name)
    const url = membership && Number.isSafeInteger(membership.id) && membership.id > 0 && membership.url === `https://archiveofourown.org/series/${membership.id}` ? membership.url : null
    const position = membership?.position && Number.isInteger(membership.position) && membership.position > 0 ? membership.position : '?'
    return <Fragment key={name}>{index > 0 && ' · '}<span className="series-membership">Part {position} of {url ? <a className="clickable-text" href={url} target="_blank" rel="noreferrer">{name}</a> : name}</span></Fragment>
  }) : 'None saved'
}
