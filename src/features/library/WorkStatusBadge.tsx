import { Tooltip } from '../../components/Tooltip'
import type { Story } from './model'

export function WorkStatusBadge({ story }: { story: Pick<Story, 'work_status'> }) {
 if (story.work_status !== 'deleted') return null
 return <Tooltip description="This work is marked deleted on AO3. Saved metadata and personal data are preserved.">{id => <span className="work-status-badge" tabIndex={0} aria-describedby={id}>Deleted on AO3</span>}</Tooltip>
}
