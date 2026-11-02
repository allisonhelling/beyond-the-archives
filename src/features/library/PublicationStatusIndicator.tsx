import { Tooltip } from '../../components/Tooltip'
import type { Metadata } from './model'
import { publicationStatuses } from './publication-status'
import './publication-status.css'

export function PublicationStatusIndicator({ status, portal = false, placement = 'top' }: { status: Metadata['publication_status']; portal?: boolean; placement?: 'top' | 'bottom' }) {
  const { label, Icon } = publicationStatuses[status]
  return <Tooltip description={status === 'deleted' ? 'This work was deleted on AO3' : label} portal={portal} placement={placement}>{id => <span className="publication-icon" role="img" aria-label={label} aria-describedby={id} tabIndex={0}><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>}</Tooltip>
}
