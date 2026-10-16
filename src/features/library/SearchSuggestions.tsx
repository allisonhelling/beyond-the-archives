import { useId, useState, type KeyboardEvent } from 'react'
import { useDismissible } from '../../components/useDismissible'
import { normalize } from './reading-search'

export type SuggestionGroup = { label: string; values: string[] }
export function SearchSuggestions({ label, placeholder, value, onChange, groups, multiple = false, keepOpen = false, hideHeadings = false, help }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void;
  groups: SuggestionGroup[]; multiple?: boolean; keepOpen?: boolean; hideHeadings?: boolean; help?: string
}) {
  const [focused, setFocused] = useState(false), id = useId()
  const [appendSuggestion, setAppendSuggestion] = useState(false)
  const ref = useDismissible<HTMLDivElement>(focused, () => setFocused(false))
  const term = normalize((multiple && appendSuggestion ? '' : multiple ? value.split(',').at(-1) ?? '' : value).trim())
  const chosen = multiple ? (appendSuggestion ? value.split(',') : value.split(',').slice(0, -1)).map(text => normalize(text.trim())) : []
  const suggestions = groups.map(group => ({ ...group, values: [...new Set(group.values)].filter(text => !chosen.includes(normalize(text)) && normalize(text).includes(term)).sort((a, b) => a.localeCompare(b)).slice(0, 8) }))
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
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
    const previous = multiple ? (appendSuggestion ? value.split(',') : value.split(',').slice(0, -1)).map(part => part.trim()).filter(Boolean) : []
    onChange([...previous, text].join(', '))
    setAppendSuggestion(multiple && keepOpen)
    ref.current?.querySelector<HTMLInputElement>('input')?.focus()
    setFocused(keepOpen)
  }
  return <div className="suggestion-search" ref={ref} onKeyDown={keyboard}>
    <label>{label}<input type="search" placeholder={placeholder} value={value} aria-expanded={focused} aria-controls={focused ? id : undefined} onFocus={() => setFocused(true)} onClick={() => setFocused(true)} onChange={e => { onChange(e.target.value); setAppendSuggestion(false); setFocused(true) }} /></label>
    {focused && <div className="search-suggestions" id={id} aria-label={`${label} suggestions`}>
      {suggestions.map(group => <section key={group.label} aria-label={`${group.label} suggestions`}>{!hideHeadings && <strong>{group.label}</strong>}{group.values.length ? group.values.map(text => <button type="button" key={text} onClick={() => choose(text)}>{text}</button>) : <p>No matching saved {group.label.toLocaleLowerCase()}.</p>}</section>)}
    </div>}
    {help && <small className="suggestion-help">{help}</small>}
  </div>
}
