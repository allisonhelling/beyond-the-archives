import { useId } from 'react'
import { Info } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { statuses, type Status } from '../library/model'

export type ImportReadingStatusValue = Status | 'dynamic_bookmarks'

type ImportReadingStatusProps = { disabled: boolean; ariaLabel?: string; description?: string } & (
 { allowDynamic: true; value: ImportReadingStatusValue; onChange(value: ImportReadingStatusValue): void }
 | { allowDynamic?: false; value: Status; onChange(value: Status): void }
)

export function ImportReadingStatus(props: ImportReadingStatusProps) {
 const { value, disabled, ariaLabel, description, allowDynamic } = props
 const id = useId()
 const control = <select className="select-fit" id={id} aria-label={ariaLabel} value={value} disabled={disabled} onChange={event => props.allowDynamic ? props.onChange(event.target.value as ImportReadingStatusValue) : props.onChange(event.target.value as Status)}>{allowDynamic && <option value="dynamic_bookmarks">Dynamic (Bookmarks)</option>}{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
 return description ? <div className="form-control"><div className="editable-field-heading"><label htmlFor={id}>Reading Status</label><Tooltip pinOnClick description={description}>{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label="Reading Status Information" aria-describedby={descriptionId}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>{control}</div> : <label>Reading Status{control}</label>
}
