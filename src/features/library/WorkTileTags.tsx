import type { Metadata } from './model'
import { ExpandableMetadataTags } from './ExpandableMetadataTags'
import { workTagGroups } from './work-tags'
import { useTagResolutions } from './tags/useTagResolutions'

export function WorkTileTags({ metadata }: { metadata: Metadata }) {
  const { records } = useTagResolutions(undefined, [], false)
  return <ExpandableMetadataTags groups={workTagGroups(metadata, undefined, records)} />
}
