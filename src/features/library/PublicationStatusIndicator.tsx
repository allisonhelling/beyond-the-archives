import { Tooltip } from '../../components/Tooltip'
import type { Metadata } from './model'
import { publicationStatuses } from './publication-status'
import './publication-status.css'

export function PublicationStatusIndicator({ status, portal = false, placement = 'top', universal = false }: { status: Metadata['publication_status']; universal?: boolean; portal?: boolean; placement?: 'top' | 'bottom' }) {
  const { label: sourceLabel, Icon } = publicationStatuses[status]
  const label = universal ? sourceLabel.replace(' on AO3', '').replace('AO3 Status Unknown', 'Publication Status Unknown') : sourceLabel
  return <Tooltip description={status === 'deleted' ? universal ? 'You marked this story Deleted' : 'This work was deleted on AO3' : label} portal={portal} placement={placement}>{id => <span className="publication-icon" role="img" aria-label={label} aria-describedby={id} tabIndex={0}><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>}</Tooltip>
}
