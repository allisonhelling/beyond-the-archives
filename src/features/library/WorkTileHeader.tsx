import type { ReactNode } from 'react'
import { Tooltip } from '../../components/Tooltip'
import type { Metadata } from './model'
import { PublicationStatusIndicator } from './PublicationStatusIndicator'

export function WorkTileHeader({ status, source, children }: { status: Metadata['publication_status']; source?: string; children: ReactNode }) {
  return <header className="work-tile-bar">
    <div className="work-tile-source">
      <PublicationStatusIndicator status={status} portal />
      {source && <Tooltip description={`Published on ${source}`} portal>{id =>
        <span className="work-tile-origin" tabIndex={0} aria-describedby={id}>{source}</span>
      }</Tooltip>}
    </div>
    <div className="story-quick-actions">{children}</div>
  </header>
}
