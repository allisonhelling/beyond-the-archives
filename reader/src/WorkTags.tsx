import { ExpandableMetadataTags } from '../../src/features/library/ExpandableMetadataTags'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { defaultTagAppearance } from './model'
export function WorkTags({ tags, onSearch, limit = 7, appearance = defaultTagAppearance }: { tags: string[]; onSearch?: (tag: string) => void; limit?: number; appearance?: TagAppearance }) {
  return <ExpandableMetadataTags values={tags} onTagClick={onSearch} limit={limit} appearance={appearance} className="tags" />
}
