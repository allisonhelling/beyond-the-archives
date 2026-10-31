import { useLayout } from '../../lib/use-layout'
import type { Metadata } from './model'
import { ExpandableMetadataTags } from './ExpandableMetadataTags'
import { workTagGroups } from './work-tags'
import { useTagResolutions } from './tags/useTagResolutions'

export function WorkTileTags({ metadata }: { metadata: Metadata }) {
  const mobile = useLayout(650) === 'mobile'
  const { records } = useTagResolutions(undefined, [], false)
  return <ExpandableMetadataTags groups={workTagGroups(metadata, undefined, records, 'organizer')} limit={mobile ? 4 : 7} />
}
