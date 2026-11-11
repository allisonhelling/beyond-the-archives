import { useId, useState } from 'react'
import { TabList } from '../../../components/TabList'
import { FandomChoices, FandomSelect, type FandomOption } from '../FandomSelect'
import { SearchSuggestions } from '../SearchSuggestions'
import type { ReadingFilters } from '../reading-search'
import { TagGroupEditor } from './TagGroupEditor'
import { useTagGroupDraft } from './useTagGroupDraft'
import { changeTagMode, expressionTags, tagExpression, tagFilterConfig, withTagExpression, type CustomRestoration, type TagExpression, type TagFilterKey, type TagMatchMode } from './tag-expressions'

/** One controller owns conversion/restoration for every category's existing menu. */
export function TagFilterControl({ filters, onChange, category, label, placeholder = 'Search Fandoms', suggestions = [], fandomOptions = [], restorationKey }: {
  filters: ReadingFilters; onChange: (filters: ReadingFilters) => void; category: TagFilterKey; label: string; placeholder?: string; suggestions?: string[]; fandomOptions?: FandomOption[]; restorationKey: string
}) {
  const id = useId(), expression = tagExpression(filters, category)
  const [restoration, setRestoration] = useState<{ key: string; snapshot?: CustomRestoration }>({ key: restorationKey })
  function edit(next: TagExpression) {
    setRestoration({ key: restorationKey }) // Even an edit later reversed invalidates restoration.
    onChange(withTagExpression(filters, category, next))
  }
  const groupDraft = useTagGroupDraft(expression, edit)
  function mode(next: TagMatchMode) {
    const converted = changeTagMode(expression, next, restoration.key === restorationKey ? restoration.snapshot : undefined)
    setRestoration({ key: restorationKey, snapshot: converted.snapshot })
    onChange(withTagExpression(filters, category, converted.expression))
  }
  const tabs = <TabList prefix={id} className="tag-match-modes tab-bar" label={`${tagFilterConfig[category].label} Matching`} active={expression.mode} onChange={mode} tabs={tagFilterConfig[category].modes.map(mode => ({ id: mode, label: mode[0].toUpperCase() + mode.slice(1) }))} />
  const panelProps = { id: `${id}-panel-${expression.mode}`, role: 'tabpanel', 'aria-labelledby': `${id}-tab-${expression.mode}` }
  if (category !== 'fandoms') return <SearchSuggestions label={label} tagCategory={category === 'relationship' ? 'relationships' : category} placeholder={placeholder} value={expressionTags(expression).join(', ')} onChange={value => edit({ mode: expression.mode === 'any' ? 'any' : 'all', tags: value.split(',') })} groups={[{ label, values: suggestions }]} multiple chips keepOpen hideHeadings matchingControl={tabs} matchingPanel={{ id: panelProps.id, 'aria-labelledby': panelProps['aria-labelledby'] }} />
  const editor = expression.mode === 'custom' ? <div {...panelProps}>
    <TagGroupEditor label={tagFilterConfig[category].label} draft={groupDraft} renderChoices={props => <FandomChoices {...props} options={fandomOptions} />} />
  </div> : undefined
  return <FandomSelect label={`${label}${expression.mode === 'custom' ? ' · Custom' : ''}`} options={fandomOptions} selected={expressionTags(expression)} onChange={tags => edit(expression.mode === 'custom' ? { mode: 'custom', groups: [] } : { ...expression, tags })} modeControl={tabs} matchingPanel={{ id: panelProps.id, 'aria-labelledby': panelProps['aria-labelledby'] }} editor={editor} summary={expression.mode === 'custom' ? `Custom · ${expression.groups.length} Groups` : undefined} />
}

