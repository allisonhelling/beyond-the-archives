import { useId, useState, type KeyboardEvent } from 'react'
import { useDismissible } from '../../components/useDismissible'
import { normalize } from './reading-search'
import { MetadataTags } from './MetadataTags'
import type { TagCategory } from './display-settings'

export type SuggestionGroup = { label: string; values: string[] }
export function SearchSuggestions({ label, placeholder, value, onChange, groups, multiple = false, keepOpen = false, hideHeadings = false, hideLabel = false, chips = false, help, tagCategory }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void;
  groups: SuggestionGroup[]; multiple?: boolean; keepOpen?: boolean; hideHeadings?: boolean; hideLabel?: boolean; chips?: boolean; help?: string; tagCategory?: TagCategory
}) {
  const [focused, setFocused] = useState(false), id = useId()
  const [appendSuggestion, setAppendSuggestion] = useState(false)
  const [draft, setDraft] = useState('')
  const selected = chips ? value.split(',').map(text => text.trim()).filter(Boolean) : []
  const ref = useDismissible<HTMLDivElement>(focused, () => setFocused(false))
  const term = normalize((chips ? draft : multiple && appendSuggestion ? '' : multiple ? value.split(',').at(-1) ?? '' : value).trim())
  const chosen = chips ? selected.map(normalize) : multiple ? (appendSuggestion ? value.split(',') : value.split(',').slice(0, -1)).map(text => normalize(text.trim())) : []
  const suggestions = groups.map(group => ({ ...group, values: [...new Set(group.values)].filter(text => !chosen.includes(normalize(text)) && normalize(text).includes(term)).sort((a, b) => a.localeCompare(b)).slice(0, 8) }))
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (chips && event.key === 'Enter' && event.target instanceof HTMLInputElement && draft.trim()) { event.preventDefault(); choose(draft.trim()); return }
    if (event.key === 'Escape') { setFocused(false); return }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    if (!focused) { setFocused(true); return }
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.search-suggestions button') ?? [])]
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
    {focused && <div className="search-suggestions menu-surface" id={id} aria-label={`${label} suggestions`}>
      {suggestions.map(group => <section key={group.label} aria-label={`${group.label} suggestions`}>{!hideHeadings && <span className="suggestion-heading">{group.label}</span>}{group.values.length ? group.values.map(text => <button type="button" key={text} onClick={() => choose(text)}>{text}</button>) : <p>No matching saved {group.label.toLocaleLowerCase()}.</p>}</section>)}
    </div>}
    {selected.length > 0 && <div className="filter-chips" aria-label={`${label} selected filters`}><MetadataTags values={selected} category={tagCategory} removeLabel={text => `Remove ${label} filter ${text}`} onRemove={text => onChange(selected.filter(item => item !== text).join(', '))} /></div>}
    {help && <small className="suggestion-help">{help}</small>}
  </div>
}
