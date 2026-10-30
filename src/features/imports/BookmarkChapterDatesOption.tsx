import { InfoTooltip } from '../../components/InfoTooltip'

export function BookmarkChapterDatesOption({ checked, disabled, onChange, scan = false }: {
 checked: boolean; disabled: boolean; onChange: (checked: boolean) => void; scan?: boolean
}) {
 const option = <label className="check-label" aria-disabled={disabled}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />Check Chapter Publication Dates</label>
 return <div className="editable-field-heading">{option}<InfoTooltip description={scan ? "Estimates chapters read by comparing each chapter’s publication date with the bookmark date. Series works without an individual bookmark use the series bookmark date. Chapters published on the bookmark date or with missing dates remain unconfirmed. Uses the scan tab to open eligible works’ Chapter Index pages so scans will take longer than usual." : "Estimate chapters read by comparing each chapter’s publication date with the bookmark date. Chapters published on the bookmark date or with missing dates remain unconfirmed. Metadata processing may open extra AO3 pages, so imports take longer. Existing progress is kept unless you choose Overwrite for that bookmark."} label="Chapter Publication Dates Information" size={14} /></div>
}
