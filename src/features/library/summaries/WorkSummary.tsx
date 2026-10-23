import { useMemo } from 'react'
import type { Metadata } from '../model'
import { readSummary } from './summary'

export function WorkSummary({ metadata, fallback = '' }: { metadata: Pick<Metadata, 'summary' | 'summary_html'>; fallback?: string }) {
 const formatted = useMemo(() => typeof metadata.summary_html === 'string' ? readSummary(metadata.summary_html) : null, [metadata.summary_html])
 // A manual plain-text correction takes precedence over older automatic markup.
 return formatted && formatted.summary === metadata.summary
  ? <div className="formatted-summary" dangerouslySetInnerHTML={{ __html: formatted.summary_html }} />
  : <>{metadata.summary || fallback}</>
}
