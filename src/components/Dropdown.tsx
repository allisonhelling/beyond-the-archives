import { normalizeSearchText as normalize } from '../lib/search-text'
import { createPortal } from 'react-dom'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, X, type LucideIcon } from 'lucide-react'
import { useDismissible } from './useDismissible'

export type DropdownOption = { value: string; label: string }
type DropdownProps = {
  label: string; options: DropdownOption[]; disabled?: boolean; closeOnSelect?: boolean; icon?: LucideIcon; compact?: boolean; mobileIconOnly?: boolean; fitContent?: boolean; searchable?: boolean; showSelections?: boolean; textTrigger?: boolean; portal?: boolean; renderValue?: (label: string) => ReactNode
} & ({ multiple?: false; value: string; onChange: (value: string) => void } | { multiple: true; value: string[]; onChange: (value: string[]) => void })

export function Dropdown(props: DropdownProps) {
  const { label, value, options, disabled = false, closeOnSelect = false, icon: Icon, compact = false, mobileIconOnly = false, fitContent = false, textTrigger = false, portal = false } = props
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const term = normalize(query)
  const visibleOptions = options.filter(option => !props.searchable || normalize(option.label).includes(term))
  const id = useId(), labelId = `${id}-label`
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false), { additionalRefs: [panelRef] })
  useLayoutEffect(() => { if (portal) setPortalRoot(ref.current?.closest('dialog') ?? document.body) }, [portal, ref])
  useLayoutEffect(() => {
    if (!open || !portal) return
    function position() {
      const trigger = ref.current?.querySelector('.dropdown-trigger'), panel = panelRef.current
      if (!trigger || !panel) return
      const box = trigger.getBoundingClientRect(), viewport = trigger.ownerDocument.defaultView ?? window
      const width = Math.min(Math.max(box.width, 280), viewport.innerWidth - 32)
      const below = viewport.innerHeight - box.bottom - 14, above = box.top - 14, down = below >= Math.min(300, panel.scrollHeight) || below >= above
      panel.style.setProperty('--dropdown-width', `${width}px`)
      panel.style.setProperty('--dropdown-max-height', `${Math.max(0, Math.min(300, down ? below : above))}px`)
      panel.style.setProperty('--dropdown-left', `${Math.max(16, Math.min(box.left + (box.width - width) / 2, viewport.innerWidth - width - 16))}px`)
      panel.style.setProperty('--dropdown-top', `${down ? box.bottom + 6 : Math.max(8, box.top - panel.getBoundingClientRect().height - 6)}px`)
    }
    position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [open, portal, portalRoot, visibleOptions.length, ref])
  const isSelected = (option: DropdownOption) => Array.isArray(value) ? value.includes(option.value) : value === option.value
  const selected = options.filter(isSelected)
  const valueLabel = selected.length > 1 ? `${selected.length} selected` : selected[0]?.label ?? (props.multiple ? 'All' : 'Select an Option')
  const optionSelector = props.multiple ? 'input[type=checkbox]' : '[role=option]'
  function focusOption(index: number) {
    const buttons = panelRef.current?.querySelectorAll<HTMLElement>(optionSelector)
    if (!buttons?.length) return
    buttons[(index + buttons.length) % buttons.length].focus()
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const buttons = [...(panelRef.current?.querySelectorAll<HTMLElement>(optionSelector) ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.dropdown-trigger')?.focus() }
    if (event.target instanceof HTMLInputElement && event.target.type === 'search' && ['Home','End'].includes(event.key)) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (!open) {
        setQuery(''); setOpen(true)
        requestAnimationFrame(() => focusOption(event.key === 'ArrowUp' ? options.length - 1 : Math.max(0, options.findIndex(isSelected))))
      } else focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index < 0 ? event.key === 'ArrowUp' ? buttons.length - 1 : 0 : index + (event.key === 'ArrowUp' ? -1 : 1))
    }
  }
  const panel = open ? <div ref={panelRef} data-portal={portal || undefined} className="dropdown-panel menu-surface" id={id} role={props.multiple ? 'dialog' : 'listbox'} aria-labelledby={labelId}>
      {props.searchable && <input type="search" className="dropdown-search" aria-label={`Search ${label}`} placeholder={`Search ${label}`} autoFocus value={query} onChange={event => setQuery(event.target.value)} />}
      {!visibleOptions.length && <p className="dropdown-empty">No matching options.</p>}
      {props.multiple ? visibleOptions.map(option => <label key={option.value} className="check-label dropdown-check-option" onMouseDown={event => { if (event.target !== event.currentTarget.control) event.preventDefault() }}>
        <input type="checkbox" disabled={disabled} checked={isSelected(option)} onChange={event => props.onChange(event.target.checked ? [...props.value, option.value] : props.value.filter(value => value !== option.value))} />
        <span>{option.label}</span>
      </label>) : visibleOptions.map(option => <button type="button" role="option" disabled={disabled} key={option.value} aria-selected={value === option.value} onClick={() => {
        props.onChange(option.value)
        if (closeOnSelect) { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.dropdown-trigger')?.focus() }
      }}><span>{option.label}</span>{value === option.value && <Check size={16} />}</button>)}
    </div> : null
  return <div className={`custom-dropdown${props.renderValue ? ' dropdown-custom-value' : ''}${textTrigger ? ' dropdown-text' : ''}${compact ? ' dropdown-compact' : ''}${mobileIconOnly ? ' dropdown-mobile-icon-only' : ''}${fitContent ? ' dropdown-fit-content' : ''}`} ref={ref} onKeyDown={keyboard}>
    <span hidden={textTrigger} className={compact || textTrigger ? 'sr-only' : 'filter-label'} id={labelId}><span className="dropdown-label">{Icon && <Icon size={16} aria-hidden="true" />}{label}</span></span>
    <button className={`${compact ? 'button secondary' : 'filter-input'} dropdown-trigger`} type="button" disabled={disabled} aria-label={label} title={mobileIconOnly ? label : undefined} aria-describedby={`${id}-value`} aria-haspopup={props.multiple ? 'dialog' : 'listbox'} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { if (!open) setQuery(''); setOpen(!open) }}>
      {compact && <span className="dropdown-label">{Icon && <Icon size={16} aria-hidden="true" />}<span className="dropdown-label-text">{label}</span></span>}
      <span id={`${id}-value`} className={compact ? 'sr-only' : undefined}>{fitContent ? <><span>{valueLabel}</span><span className="dropdown-option-sizer" aria-hidden="true">{options.map(option => <span key={option.value} data-label={option.label} />)}</span></> : props.renderValue ? props.renderValue(valueLabel) : valueLabel}</span><ChevronDown size={16} />
    </button>
    {open && (portal ? createPortal(panel, portalRoot ?? document.body) : panel)}
    {props.multiple && props.showSelections && !open && selected.length > 0 && <div className="dropdown-selected" aria-label={`${label} Selected Filters`}>{selected.map(option => <button type="button" disabled={disabled} key={option.value} aria-label={`Remove ${label} Filter ${option.label}`} onClick={() => props.onChange(props.value.filter(value => value !== option.value))}>{option.label}<X size={14} aria-hidden="true" /></button>)}</div>}
  </div>
}
