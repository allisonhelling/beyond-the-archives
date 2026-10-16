import { Fragment } from 'react'
import { authorPageUrl, type Metadata } from './model'

export function AuthorNames({ metadata }: { metadata: Metadata }) {
  return metadata.authors.length ? metadata.authors.map((name, index) => {
    const url = authorPageUrl(metadata.author_links?.[name])
    return <Fragment key={name}>{index > 0 && ', '}{url ? <a className="clickable-text" href={url} target="_blank" rel="noreferrer">{name}</a> : name}</Fragment>
  }) : 'Author unknown'
}
