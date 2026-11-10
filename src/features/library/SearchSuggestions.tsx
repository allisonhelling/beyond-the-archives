import { compareTagSuggestions, tagSuggestionGroups, type Ao3TagCategory } from './tags/tag-resolution'
import { useTagResolutions } from './tags/useTagResolutions'
import { useId, useState, type ReactNode, type KeyboardEvent } from 'react'
import { useDismissible } from '../../components/useDismissible'
import { normalize } from './reading-search'
import { MetadataTags } from './MetadataTags'
import { type TagCategory } from './display/display-settings'

export type SuggestionGroup = { label: string; values: string[] }
export function SearchSuggestions({ label, placeholder, value, onChange, groups, multiple = false, keepOpen = false, hideHeadings = false, hideLabel = false, chips = false, help, tagCategory, matchingControl, matchingPanel }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void;
  matchingControl?: ReactNode; matchingPanel?: { id: string; 'aria-labelledby': string }; groups: SuggestionGroup[]; multiple?: boolean; keepOpen?: boolean; hideHeadings?: boolean; hideLabel?: boolean; chips?: boolean; help?: string; tagCategory?: TagCategory
}) {
  const [focused, setFocused] = useState(false), id = useId()
  const [appendSuggestion, setAppendSuggestion] = useState(false)
  const [draft, setDraft] = useState('')
  const selected = chips ? value.split(',').map(text => text.trim()).filter(Boolean) : []
  const ref = useDismissible<HTMLDivElement>(focused, () => setFocused(false), { outsideEvent: 'click' })
  const term = normalize((chips ? draft : multiple && appendSuggestion ? '' : multiple ? value.split(',').at(-1) ?? '' : value).trim())
  const chosen = chips ? selected.map(normalize) : multiple ? (appendSuggestion ? value.split(',') : value.split(',').slice(0, -1)).map(text => normalize(text.trim())) : []
  const category = ({ relationships: 'relationship', characters: 'character', tags: 'freeform' } as Partial<Record<TagCategory, Ao3TagCategory>>)[tagCategory!]
  const candidates = [...new Set(groups.flatMap(group => group.values))].filter(text => normalize(text).includes(term)).sort(compareTagSuggestions).slice(0,8)
  const { records, unavailable } = useTagResolutions(category, candidates, focused)
  const resolvedGroups = category ? tagSuggestionGroups(groups.flatMap(group => group.values), term, records, category) : groups
  const suggestions = resolvedGroups.map(group => ({ ...group, values: [...new Set(group.values)].filter(text => !chosen.includes(normalize(text)) && (category ? true : normalize(text).includes(term))).sort(compareTagSuggestions).slice(0, 8) }))
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (chips && event.key === 'Enter' && event.target instanceof HTMLInputElement && draft.trim()) { event.preventDefault(); choose(draft.trim()); return }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); ref.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }); setFocused(false); return }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    if (!focused) { setFocused(true); return }
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.suggestion-options button') ?? [])]
    if (!buttons.length) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus()
  }
  function choose(text: string) {
    const previous = chips ? selected : multiple ? (appendSuggestion ? value.split(',') : value.split(',').slice(0, -1)).map(part => part.trim()).filter(Boolean) : []
    onChange([...previous, ...(!previous.some(item => normalize(item) === normalize(text)) ? [text] : [])].join(', '))
    setDraft('')
    setAppendSuggestion(multiple && keepOpen)
    ref.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    setFocused(keepOpen)
  }
  return <div className="suggestion-search" ref={ref} onKeyDown={keyboard}>
    <label className={hideLabel ? 'unlabeled-filter' : undefined}><span className={hideLabel ? 'sr-only' : 'filter-name'}>{label}</span><input type="search" placeholder={placeholder} value={chips ? draft : value} aria-expanded={focused} aria-controls={focused ? id : undefined} onFocus={() => setFocused(true)} onClick={() => setFocused(true)} onChange={e => { if (chips) setDraft(e.target.value); else onChange(e.target.value); setAppendSuggestion(false); setFocused(true) }} /></label>
    {focused && <div role={category ? 'region' : undefined} className="search-suggestions menu-surface" id={id} aria-label={`${label} Suggestions`}>
      {matchingControl}
      <div className="suggestion-options" {...matchingPanel} role={matchingPanel ? 'tabpanel' : undefined}>
      {category && unavailable && <p role="status">Tag verification is unavailable. Saved tags can still be searched.</p>}
      {!suggestions.length && <p>No matching saved {label.toLocaleLowerCase()}.</p>}
      {suggestions.map(group => <section role={category ? 'group' : undefined} key={group.label} aria-label={`${group.label} Suggestions`}>{(!hideHeadings || category) && <span className="suggestion-heading">{group.label}</span>}{group.values.length ? group.values.map(text => <button type="button" key={text} onClick={() => choose(text)}>{text}</button>) : <p>No matching saved {group.label.toLocaleLowerCase()}.</p>}</section>)}
      </div>
    </div>}
    {help && <small className="suggestion-help">{help}</small>}
    {selected.length > 0 && <div className="filter-chips" aria-label={`${label} Selected Filters`}><MetadataTags values={selected} category={tagCategory} removeLabel={text => `Remove ${label} Filter ${text}`} onRemove={text => onChange(selected.filter(item => item !== text).join(', '))} /></div>}
  </div>
}
