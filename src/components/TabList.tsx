export function TabList<T extends string>({ tabs, active, onChange, label, prefix, className = 'form-actions' }: {
 tabs: readonly { id: T; label: string; mobileLabel?: string }[]; active: T; onChange: (id: T) => void; label: string; prefix: string; className?: string
}) {
 return <div className={`${className} section-tabs`} role="tablist" aria-label={label} onKeyDown={event => {
  const index = tabs.findIndex(tab => tab.id === active)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null
  if (next === null) return
  event.preventDefault(); onChange(tabs[next].id)
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
 }}>{tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-label={tab.label} id={`${prefix}-tab-${tab.id}`} aria-controls={`${prefix}-panel-${tab.id}`} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1} className={`button ${active === tab.id ? 'primary' : 'secondary'}`} onClick={() => onChange(tab.id)}>{tab.mobileLabel ? <><span className="tab-desktop-label">{tab.label}</span><span className="tab-mobile-label">{tab.mobileLabel}</span></> : tab.label}</button>)}</div>
}
