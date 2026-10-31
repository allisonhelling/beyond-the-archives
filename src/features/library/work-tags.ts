import { allTagOrder } from './display/display-settings'
import { tagNames, type Metadata } from './model'
import { normalizeSearchText } from '../../lib/search-text'
import { prioritizeVerifiedTags, type TagResolution } from './tags/tag-resolution'

/** Keep raw fallback tags without repeating categorized values or fandoms. */
export function workTagGroups(metadata: Metadata, include: (value: string) => boolean = () => true, records: TagResolution[] = []) {
  const seen = new Set(metadata.fandoms.map(value => normalizeSearchText(value.trim())))
  const unique = (values: string[]) => values.map(value => value.trim()).filter(value => {
    const key = normalizeSearchText(value)
    if (!value || !include(value) || seen.has(key) || /^fandoms?\s*:/i.test(value)) return false
    seen.add(key); return true
  })
  const groups = [
    { label: 'AO3 Warnings', category: 'warnings' as const, values: unique(metadata.archive_warnings ?? []) },
    { label: 'Relationships', category: 'relationships' as const, values: unique(tagNames(metadata, 'relationship')) },
    { label: 'Characters', category: 'characters' as const, values: unique(tagNames(metadata, 'character')) },
    { label: 'Categories', category: null, values: unique(metadata.categories ?? []) },
    { label: 'Additional Tags', category: 'tags' as const, values: unique(tagNames(metadata, 'freeform')) },
  ]
  groups[groups.length - 1].values.push(...unique(metadata.ao3_tags))
  const categories = { relationships: 'relationship', characters: 'character', tags: 'freeform', warnings: undefined } as const
  const order = allTagOrder()
  return groups.sort((a,b) => order.indexOf(a.category??'categories') - order.indexOf(b.category??'categories')).filter(group => group.values.length).map(group => {
    const category = group.category && categories[group.category]
    return { ...group, values: category ? prioritizeVerifiedTags(group.values, records, category) : group.values }
  })
}

