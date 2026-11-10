import { useId, useState } from 'react'
import { TabList } from '../../../components/TabList'
import { FandomChoices, FandomSelect, type FandomOption } from '../FandomSelect'
import { SearchSuggestions } from '../SearchSuggestions'
import type { ReadingFilters } from '../reading-search'
import { changeTagMode, expressionTags, tagExpression, tagFilterConfig, uniqueTags, withTagExpression, type CustomRestoration, type TagExpression, type TagFilterKey, type TagMatchMode } from './tag-expressions'

/** One controller owns conversion/restoration for every category's existing menu. */
export function TagFilterControl({ filters, onChange, category, label, placeholder = 'Search Fandoms', suggestions = [], fandomOptions = [], restorationKey }: {
  filters: ReadingFilters; onChange: (filters: ReadingFilters) => void; category: TagFilterKey; label: string; placeholder?: string; suggestions?: string[]; fandomOptions?: FandomOption[]; restorationKey: string
}) {
  const id = useId(), expression = tagExpression(filters, category)
  const [restoration, setRestoration] = useState<{ key: string; snapshot?: CustomRestoration }>({ key: restorationKey })
  const [activeGroup, setActiveGroup] = useState(0)
  const [emptyGroups, setEmptyGroups] = useState(0)
  function edit(next: TagExpression) {
    setRestoration({ key: restorationKey }) // Even an edit later reversed invalidates restoration.
    onChange(withTagExpression(filters, category, next))
  }
  function mode(next: TagMatchMode) {
    const converted = changeTagMode(expression, next, restoration.key === restorationKey ? restoration.snapshot : undefined)
    setRestoration({ key: restorationKey, snapshot: converted.snapshot })
    setEmptyGroups(0); setActiveGroup(0)
    onChange(withTagExpression(filters, category, converted.expression))
  }
  const tabs = <TabList prefix={id} className="tag-match-modes" label={`${tagFilterConfig[category].label} Matching`} active={expression.mode} onChange={mode} tabs={tagFilterConfig[category].modes.map(mode => ({ id: mode, label: mode[0].toUpperCase() + mode.slice(1) }))} />
  const panelProps = { id: `${id}-panel-${expression.mode}`, role: 'tabpanel', 'aria-labelledby': `${id}-tab-${expression.mode}` }
  if (category !== 'fandoms') return <SearchSuggestions label={label} tagCategory={category === 'relationship' ? 'relationships' : category} placeholder={placeholder} value={expressionTags(expression).join(', ')} onChange={value => edit({ mode: expression.mode === 'any' ? 'any' : 'all', tags: value.split(',') })} groups={[{ label, values: suggestions }]} multiple chips keepOpen hideHeadings matchingControl={tabs} matchingPanel={{ id: panelProps.id, 'aria-labelledby': panelProps['aria-labelledby'] }} />
  const groups = expression.mode === 'custom' ? [...expression.groups, ...Array.from({ length: emptyGroups }, () => [] as string[])] : []
  function updateGroup(index: number, tags: string[]) {
    const next = groups.map((group, i) => i === index ? uniqueTags(tags) : group)
    // Keep placeholders in local editing state only; never execute/persist empty clauses.
    setEmptyGroups(next.filter(group => !group.length).length)
    edit({ mode: 'custom', groups: next.filter(group => group.length) })
    setActiveGroup(next.slice(0, index).filter(group => group.length).length)
  }
  const editor = expression.mode === 'custom' ? <div {...panelProps} className="tag-group-editor">
    <p>Match all fandoms in a group, or any group.</p>
    {groups.map((group, index) => <div key={index} className="tag-expression-group">
      {index > 0 && <p className="filter-label">OR</p>}
      <div className="form-actions"><button type="button" className={`button ${index === activeGroup ? 'primary' : 'secondary'}`} aria-pressed={index === activeGroup} onClick={() => setActiveGroup(index)}>Group {index + 1}</button><button type="button" className="button secondary" aria-label={`Remove Group ${index + 1}`} onClick={() => { const remaining = groups.filter((_, i) => i !== index); setEmptyGroups(remaining.filter(group => !group.length).length); edit({ mode: 'custom', groups: remaining.filter(group => group.length) }); setActiveGroup(0) }}>Remove Group</button></div>
      <p>{group.length ? group.join(' AND ') : 'Choose fandoms for this group.'}</p>
    </div>)}
    <button type="button" className="button secondary" onClick={() => { setEmptyGroups(emptyGroups + 1); setActiveGroup(groups.length) }}>Add Group</button>
    {groups.length > 0 && <div role="group" aria-label={`Group ${activeGroup + 1} Fandoms`}><FandomChoices options={fandomOptions} selected={groups[activeGroup] ?? []} label={`Search Group ${activeGroup + 1} Fandoms`} onChange={tags => updateGroup(activeGroup, tags)} /></div>}
  </div> : undefined
  return <FandomSelect label={`${label}${expression.mode === 'custom' ? ' · Custom' : ''}`} options={fandomOptions} selected={expressionTags(expression)} onChange={tags => edit(expression.mode === 'custom' ? { mode: 'custom', groups: [] } : { ...expression, tags })} modeControl={tabs} matchingPanel={{ id: panelProps.id, 'aria-labelledby': panelProps['aria-labelledby'] }} editor={editor} summary={expression.mode === 'custom' ? `Custom · ${expression.groups.length} Groups` : undefined} />
}

