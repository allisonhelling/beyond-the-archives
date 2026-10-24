import { useId, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { useDismissible } from './useDismissible'

export type DropdownOption = { value: string; label: string }
type DropdownProps = {
  label: string; options: DropdownOption[]; disabled?: boolean; closeOnSelect?: boolean; icon?: LucideIcon; compact?: boolean; mobileIconOnly?: boolean; fitContent?: boolean
} & ({ multiple?: false; value: string; onChange: (value: string) => void } | { multiple: true; value: string[]; onChange: (value: string[]) => void })

export function Dropdown(props: DropdownProps) {
  const { label, value, options, disabled = false, closeOnSelect = false, icon: Icon, compact = false, mobileIconOnly = false, fitContent = false } = props
  const [open, setOpen] = useState(false)
  const id = useId(), labelId = `${id}-label`
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false))
  const isSelected = (option: DropdownOption) => Array.isArray(value) ? value.includes(option.value) : value === option.value
  const selected = options.filter(isSelected)
  const valueLabel = selected.length > 1 ? `${selected.length} selected` : selected[0]?.label ?? (props.multiple ? 'All' : 'Select an Option')
  const optionSelector = props.multiple ? 'input[type=checkbox]' : '[role=option]'
  function focusOption(index: number) {
    const buttons = ref.current?.querySelectorAll<HTMLElement>(optionSelector)
    if (!buttons?.length) return
    buttons[(index + buttons.length) % buttons.length].focus()
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>(optionSelector) ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.dropdown-trigger')?.focus() }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        requestAnimationFrame(() => focusOption(event.key === 'ArrowUp' ? options.length - 1 : Math.max(0, options.findIndex(isSelected))))
      } else focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1))
    }
  }
  return <div className={`custom-dropdown${compact ? ' dropdown-compact' : ''}${mobileIconOnly ? ' dropdown-mobile-icon-only' : ''}${fitContent ? ' dropdown-fit-content' : ''}`} ref={ref} onKeyDown={keyboard}>
    <span className={compact ? 'sr-only' : 'filter-label'} id={labelId}><span className="dropdown-label">{Icon && <Icon size={16} aria-hidden="true" />}{label}</span></span>
    <button className={`${compact ? 'button secondary' : 'filter-input'} dropdown-trigger`} type="button" disabled={disabled} aria-label={label} title={mobileIconOnly ? label : undefined} aria-describedby={`${id}-value`} aria-haspopup={props.multiple ? 'dialog' : 'listbox'} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      {compact && <span className="dropdown-label">{Icon && <Icon size={16} aria-hidden="true" />}<span className="dropdown-label-text">{label}</span></span>}
      <span id={`${id}-value`} className={compact ? 'sr-only' : undefined}>{fitContent ? <><span>{valueLabel}</span><span className="dropdown-option-sizer" aria-hidden="true">{options.map(option => <span key={option.value} data-label={option.label} />)}</span></> : valueLabel}</span><ChevronDown size={16} />
    </button>
    {open && <div className="dropdown-panel menu-surface" id={id} role={props.multiple ? 'dialog' : 'listbox'} aria-labelledby={labelId}>
      {props.multiple ? options.map(option => <label key={option.value} className="check-label dropdown-check-option" onMouseDown={event => { if (event.target !== event.currentTarget.control) event.preventDefault() }}>
        <input type="checkbox" disabled={disabled} checked={isSelected(option)} onChange={event => props.onChange(event.target.checked ? [...props.value, option.value] : props.value.filter(value => value !== option.value))} />
        <span>{option.label}</span>
      </label>) : options.map(option => <button type="button" role="option" disabled={disabled} key={option.value} aria-selected={value === option.value} onClick={() => {
        props.onChange(option.value)
        if (closeOnSelect) { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.dropdown-trigger')?.focus() }
      }}><span>{option.label}</span>{value === option.value && <Check size={16} />}</button>)}
    </div>}
  </div>
}
