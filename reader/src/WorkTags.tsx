import { ExpandableMetadataTags } from '../../src/features/library/ExpandableMetadataTags'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { defaultTagAppearance, type ReaderMetadata } from './model'
import { workTagGroups } from '../../src/features/library/work-tags'
import { publicationStatusFromText } from './metadata'
export function WorkTags({ metadata, onSearch, limit = 7, appearance = defaultTagAppearance }: { metadata: ReaderMetadata; onSearch?: (tag: string) => void; limit?: number; appearance?: TagAppearance }) {
  return <ExpandableMetadataTags groups={workTagGroups(metadata, value => publicationStatusFromText(value) === undefined)} onTagClick={onSearch} limit={limit} appearance={appearance} className="tags" />
}
