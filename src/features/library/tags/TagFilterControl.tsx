import { countNoun } from '../../../lib/count-noun'
import { useId, useState } from 'react'
import { TabList } from '../../../components/TabList'
import { FandomChoices, FandomSelect, type FandomOption } from '../FandomSelect'
import { SearchSuggestions } from '../SearchSuggestions'
import type { ReadingFilters } from '../reading-search'
import { TagGroupEditor } from './TagGroupEditor'
import { useTagGroupDraft } from './useTagGroupDraft'
import { changeTagMode, expressionTags, tagExpression, tagFilterConfig, withTagExpression, workTagFilters, uniqueTags, type WorkTagKey, type CustomRestoration, type TagExpression, type TagFilterKey, type TagMatchMode } from './tag-expressions'

/** Shared menu for searchable facets with Boolean selection modes. */
export function TagExpressionPicker({ expression, onChange, label, categoryLabel, options, restorationKey }: {
 expression: TagExpression; onChange: (next: TagExpression) => void; label: string; categoryLabel: string; options: FandomOption[]; restorationKey: string
}) {
 const id = useId()
 const [restoration, setRestoration] = useState<{ key: string; snapshot?: CustomRestoration }>({ key: restorationKey })
 function edit(next: TagExpression) {
  setRestoration({ key: restorationKey })
  onChange(next)
 }
 const groupDraft = useTagGroupDraft(expression, edit)
 function changeMode(mode: TagMatchMode) {
  const converted = changeTagMode(expression, mode, restoration.key === restorationKey ? restoration.snapshot : undefined)
  setRestoration({ key: restorationKey, snapshot: converted.snapshot })
  onChange(converted.expression)
 }
 const tabs = <TabList prefix={id} className="tag-match-modes tab-bar" label={`${categoryLabel} Matching`} active={expression.mode} onChange={changeMode} tabs={[{ id: 'any', label: 'Any' }, { id: 'all', label: 'All' }, { id: 'custom', label: 'Custom' }]} />
 const matchingPanel = { id: `${id}-panel-${expression.mode}`, 'aria-labelledby': `${id}-tab-${expression.mode}` }
 const editor = expression.mode === 'custom' ? <div {...matchingPanel} role="tabpanel"><TagGroupEditor label={categoryLabel} draft={groupDraft} renderChoices={props => <FandomChoices {...props} options={options} />} /></div> : undefined
 return <FandomSelect label={`${label}${expression.mode === 'custom' ? ' · Custom' : ''}`} searchLabel={`Search ${categoryLabel}`} options={options} selected={expressionTags(expression)} onChange={tags => edit(expression.mode === 'custom' ? { mode: 'custom', groups: [] } : { ...expression, tags })} modeControl={tabs} matchingPanel={matchingPanel} editor={editor} summary={expression.mode === 'custom' ? `Custom · ${expression.groups.length} ${countNoun(expression.groups.length, 'Group')}` : undefined} />
}

/** Organizer relationship, character, and tag search retains its text entry and suggestions. */
export function TagFilterControl({ filters, onChange, category, label, placeholder = 'Search Fandoms', suggestions = [], fandomOptions = [], restorationKey, excluded = false }: {
 filters: ReadingFilters; onChange: (filters: ReadingFilters) => void; category: TagFilterKey | WorkTagKey; label: string; placeholder?: string; suggestions?: string[]; fandomOptions?: FandomOption[]; restorationKey: string; excluded?: boolean
}) {
 const id = useId()
 if (category === 'fandoms') return <TagExpressionPicker expression={tagExpression(filters, category)} onChange={next => onChange(withTagExpression(filters, category, next))} label={label} categoryLabel={tagFilterConfig.fandoms.label} options={fandomOptions} restorationKey={restorationKey} />
 const expression = excluded ? filters.excludedTags?.[category] ?? { mode: 'any', tags: [] } satisfies TagExpression
  : category === 'personalTags' ? { mode: 'all', tags: (filters.personalTags ?? '').split(',') } as const : tagExpression(filters, category)
 const edit = (mode: 'any' | 'all', tags: string[]) => {
  if (excluded) onChange({ ...filters, excludedTags: { ...filters.excludedTags, [category]: { mode, tags: uniqueTags(tags) } } })
  else if (category === 'personalTags') onChange({ ...filters, personalTags: tags.join(', ') })
  else onChange(withTagExpression(filters, category, { mode, tags }))
 }
 const displaysModes = excluded || category !== 'personalTags'
 const mode = expression.mode === 'any' ? 'any' : 'all'
 const labelPrefix = excluded ? 'Exclude ' : ''
 const tabs = <TabList prefix={id} className="tag-match-modes tab-bar" label={`${excluded ? labelPrefix + label : category === 'tags' ? tagFilterConfig.tags.label : label} Matching`} active={mode} onChange={next => edit(next, expressionTags(expression))} tabs={[{ id: 'any', label: 'Any' }, { id: 'all', label: 'All' }]} />
 return <SearchSuggestions label={label} labelPrefix={labelPrefix} tagCategory={workTagFilters[category].category} placeholder={placeholder} value={expressionTags(expression).join(', ')} onChange={value => edit(mode, value.split(','))} groups={[{ label, values: suggestions }]} multiple chips keepOpen hideHeadings matchingControl={displaysModes ? tabs : undefined} matchingPanel={displaysModes ? { id: `${id}-panel-${mode}`, 'aria-labelledby': `${id}-tab-${mode}` } : undefined} />
}
