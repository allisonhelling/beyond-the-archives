import { useId } from 'react'
import { CalendarDays } from 'lucide-react'
import { filterDateText, isCalendarDate } from './model'

/** Keep dates editable on mobile while retaining the native calendar picker. */
export function DateFilterField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
 const id = useId()
 return <label htmlFor={id}><span className="filter-name">{label}</span><span className="date-filter-input"><input id={id} type="text" placeholder="dd-mm-yyyy" value={filterDateText(value)} aria-invalid={!!value && !isCalendarDate(value)} onChange={event => { const text = event.target.value; onChange(/^\d{2}-\d{2}-\d{4}$/.test(text) ? text.split('-').reverse().join('-') : text) }} /><span className="date-filter-calendar"><CalendarDays size={16} aria-hidden="true" /><input type="date" aria-label={`Choose ${label.toLowerCase()} date`} title={`Choose ${label.toLowerCase()} date`} value={isCalendarDate(value) ? value : ''} onChange={event => onChange(event.target.value)} /></span></span></label>
}
