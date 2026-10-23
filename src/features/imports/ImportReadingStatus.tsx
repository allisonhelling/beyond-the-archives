import { statuses, type Status } from '../library/model'

export function ImportReadingStatus({ value, onChange, disabled, ariaLabel }: { value: Status; onChange(value: Status): void; disabled: boolean; ariaLabel?: string }) {
 return <label>Reading Status<select aria-label={ariaLabel} value={value} disabled={disabled} onChange={event => onChange(event.target.value as Status)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
}
