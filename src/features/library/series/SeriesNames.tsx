import { Link } from 'react-router-dom'
import { Fragment } from 'react'
import { seriesMemberships } from './series'
import type { Metadata } from '../model'

export function SeriesNames({ metadata }: { metadata: Metadata }) {
  const memberships = seriesMemberships({ metadata })
  const items = [...new Set(metadata.series ?? [])].flatMap(name => {
    const matching = memberships.filter(series => series.name === name)
    return (matching.length ? matching : [undefined]).map(membership => ({ name, membership }))
  })
  return items.length ? items.map(({ name, membership }, index) => {
    const position = membership?.position && Number.isInteger(membership.position) && membership.position > 0 ? membership.position : '?'
    return <Fragment key={membership ? `series:${membership.id}` : `name:${name}`}>{index > 0 && ' · '}<span className="series-membership">Part <strong>{position}</strong> of {membership ? <Link className="clickable-text" to={`/series/${membership.id}`}>{name}</Link> : name}</span></Fragment>
  }) : 'None saved'
}
