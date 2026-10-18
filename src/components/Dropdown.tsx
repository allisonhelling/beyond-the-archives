import { useId, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { useDismissible } from './useDismissible'

export type DropdownOption = { value: string; label: string }
export function Dropdown({ label, value, options, onChange, disabled = false, closeOnSelect = false, icon: Icon, compact = false, mobileIconOnly = false }: {
  label: string; value: string; options: DropdownOption[]; onChange: (value: string) => void; disabled?: boolean; closeOnSelect?: boolean; icon?: LucideIcon; compact?: boolean; mobileIconOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const id = useId(), labelId = `${id}-label`
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false))
  const selected = options.find(option => option.value === value)
  function focusOption(index: number) {
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('[role=option]')
    if (!buttons?.length) return
    buttons[(index + buttons.length) % buttons.length].focus()
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.dropdown-trigger')?.focus() }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        requestAnimationFrame(() => focusOption(event.key === 'ArrowUp' ? options.length - 1 : Math.max(0, options.findIndex(o => o.value === value))))
      } else focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1))
    }
  }
  return <div className={`custom-dropdown${compact ? ' dropdown-compact' : ''}${mobileIconOnly ? ' dropdown-mobile-icon-only' : ''}`} ref={ref} onKeyDown={keyboard}>
    <span className={compact ? 'sr-only' : 'filter-label'} id={labelId}><span className="dropdown-label">{Icon && <Icon size={16} aria-hidden="true" />}{label}</span></span>
    <button className={`${compact ? 'button secondary' : 'filter-input'} dropdown-trigger`} type="button" disabled={disabled} aria-label={label} title={mobileIconOnly ? label : undefined} aria-describedby={`${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      {compact && <span className="dropdown-label">{Icon && <Icon size={16} aria-hidden="true" />}<span className="dropdown-label-text">{label}</span></span>}
      <span id={`${id}-value`} className={compact ? 'sr-only' : undefined}>{selected?.label ?? 'Select an option'}</span><ChevronDown size={16} />
    </button>
    {open && <div className="dropdown-panel menu-surface" id={id} role="listbox" aria-labelledby={labelId}>
      {options.map(option => <button type="button" role="option" disabled={disabled} key={option.value} aria-selected={value === option.value} onClick={() => {
        onChange(option.value)
        if (closeOnSelect) { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.dropdown-trigger')?.focus() }
      }}><span>{option.label}</span>{value === option.value && <Check size={16} />}</button>)}
    </div>}
  </div>
}
