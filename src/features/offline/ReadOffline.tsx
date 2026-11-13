import { useSyncExternalStore } from 'react'
import { BookDown } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { safeBookFusionLink } from '../library/bookfusion/bookfusion'
import { displaySnapshot, offlineReadingPriority, subscribeDisplay } from '../library/display/display-settings'
import type { Story } from '../library/model'
import { useReaderDestination } from './useReaderDestination'

export function ReadOffline({ story, bookId }: { story: Story; bookId?: string }) {
 const { href: unfolded } = useReaderDestination({ workId: story.work.ao3_work_id, bookId })
 const bookfusion = safeBookFusionLink(story.metadata.bookfusion_link)?.url
 const priority = offlineReadingPriority(useSyncExternalStore(subscribeDisplay, displaySnapshot))
 const href = priority === 'bookfusion' ? bookfusion ?? unfolded : unfolded ?? bookfusion
 return <Tooltip description="Read Offline">{id => href
  ? <a className="spine-action" href={href} target="_blank" rel="noopener noreferrer" aria-label="Read Offline" aria-describedby={id}><BookDown size={16} aria-hidden="true" /></a>
  : <button className="spine-action" type="button" disabled aria-label="Read Offline" aria-describedby={id}><BookDown size={16} aria-hidden="true" /></button>
 }</Tooltip>
}
