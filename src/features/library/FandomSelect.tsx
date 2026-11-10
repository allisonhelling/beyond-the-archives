import { useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useDismissible } from '../../components/useDismissible'
import { MetadataTags } from './MetadataTags'
import { normalize } from './reading-search'
export type FandomOption = { name: string; count: number; value?: string }

/** Shared saved fandom search/checklist for flat selection and Custom groups. */
export function FandomChoices({ options, selected, onChange, label = 'Search Fandoms', autoFocus = false }: { options: FandomOption[]; selected: string[]; onChange: (tags: string[]) => void; label?: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState(''), id = useId()
  const choices: FandomOption[] = [...options, ...selected.filter(value => !options.some(option => (option.value ?? option.name) === value)).map(name => ({ name, count: 0 }))]
  const matches = choices.filter(option => normalize(option.name).includes(normalize(query)))
  return <>
    <input aria-label={label} type="search" autoFocus={autoFocus} value={query} onChange={event => setQuery(event.target.value)} placeholder={label} />
    <div className="fandom-options">{matches.map(option => {
      const value = option.value ?? option.name
      return <label key={value} className="check-label" onMouseDown={event => { if (event.target !== event.currentTarget.control) event.preventDefault() }} htmlFor={`${id}-${encodeURIComponent(value)}`}><input id={`${id}-${encodeURIComponent(value)}`} type="checkbox" checked={selected.includes(value)} onChange={event => onChange(event.target.checked ? [...selected, value] : selected.filter(name => name !== value))} /><span className="fandom-option-label"><span>{option.name}</span>{' '}<span className="fandom-count">({option.count})</span></span></label>
    })}</div>
    {!matches.length && <p>No matching fandoms.</p>}
  </>
}
export function FandomSelect({ options, selected, onChange, label = 'Select Fandoms', matchingControl, modeControl, matchingPanel, editor, summary }: { label?: string; matchingControl?: ReactNode; modeControl?: ReactNode; matchingPanel?: { id: string; 'aria-labelledby': string }; editor?: ReactNode; summary?: string; options: FandomOption[]; selected: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false), id = useId()
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false), { outsideEvent: 'click' })
  useEffect(() => { if (open) ref.current?.querySelector<HTMLInputElement>('input[type=search]')?.focus() }, [open, ref])
  return <div className="fandom-select" ref={ref}>
    <button type="button" className="filter-input fandom-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span>{label} {selected.length ? `(${selected.length})` : ''}</span><ChevronDown size={16} /></button>
    {!open && selected.length > 0 && <div className="filter-chips"><MetadataTags values={summary ? [summary] : selected} removeLabel={name => `Remove Fandom ${name}`} onRemove={name => onChange(summary ? [] : selected.filter(f => f !== name))} /></div>}
    {open && <div id={id} className="fandom-panel menu-surface" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.fandom-trigger')?.focus() } }}>
      {modeControl}
      {editor ?? <div {...matchingPanel} role={matchingPanel ? 'tabpanel' : undefined}><FandomChoices options={options} selected={selected} onChange={onChange} /></div>}
    </div>}
    {matchingControl}
  </div>
}
