import { Tooltip } from '../../components/Tooltip'
import type { Metadata } from './model'
import { publicationStatuses } from './publication-status'
import './publication-status.css'

export function PublicationStatusIndicator({ status, portal = false, placement = 'top' }: { status: Metadata['publication_status']; portal?: boolean; placement?: 'top' | 'bottom' }) {
  const { label: labelWithSource, Icon } = publicationStatuses[status]
  const label = status === 'unknown' ? 'Unknown' : labelWithSource.replace(/ on AO3$/, '')
  return <Tooltip description={`Publication Status: ${label}`} portal={portal} placement={placement}>{id => <span className="publication-icon" role="img" aria-label={label} aria-describedby={id} tabIndex={0}><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>}</Tooltip>
}
