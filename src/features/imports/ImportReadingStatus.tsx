import { useId } from 'react'
import { Info } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { statuses, type Status } from '../library/model'

export function ImportReadingStatus({ value, onChange, disabled, ariaLabel, description }: { value: Status; onChange(value: Status): void; disabled: boolean; ariaLabel?: string; description?: string }) {
 const id = useId()
 const control = <select className="select-fit" id={id} aria-label={ariaLabel} value={value} disabled={disabled} onChange={event => onChange(event.target.value as Status)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
 return description ? <div className="form-control"><div className="editable-field-heading"><label htmlFor={id}>Reading Status</label><Tooltip description={description}>{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label="Reading status information" aria-describedby={descriptionId}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>{control}</div> : <label>Reading Status{control}</label>
}
