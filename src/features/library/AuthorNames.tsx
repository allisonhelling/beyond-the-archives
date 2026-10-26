import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { authorPageUrl, type Metadata } from './model'

export function AuthorNames({ metadata, destination = 'library' }: { metadata: Pick<Metadata, 'authors' | 'author_links'>; destination?: 'library' | 'ao3' }) {
  return metadata.authors.length ? metadata.authors.map((name, index) => {
    const url = authorPageUrl(metadata.author_links?.[name])
    if (destination === 'ao3') return <Fragment key={name}>{index > 0 && ', '}{url ? <a className="clickable-text" href={url} target="_blank" rel="noreferrer">{name}</a> : name}</Fragment>
    return <Fragment key={name}>{index > 0 && ', '}<Link className="clickable-text" to={`/authors/${encodeURIComponent(name)}`}>{name}</Link>{url && <a className="clickable-text author-source-link" href={url} target="_blank" rel="noreferrer" aria-label={`View ${name} on AO3`} title={`View ${name} on AO3`}><ExternalLink size={14} aria-hidden="true" /></a>}</Fragment>
  }) : 'Author unknown'
}
