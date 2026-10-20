import { statuses, type Status } from '../library/model'

export function ImportReadingStatus({ value, onChange, disabled }: { value: Status; onChange(value: Status): void; disabled: boolean }) {
 return <label>Reading Status<select value={value} disabled={disabled} onChange={event => onChange(event.target.value as Status)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
}
