import { Info } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'

export function BookmarkChapterDatesOption({ checked, disabled, onChange, scan = false }: {
 checked: boolean; disabled: boolean; onChange: (checked: boolean) => void; scan?: boolean
}) {
 const option = <label className="check-label"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />{scan ? 'Check chapter publication dates' : 'Check chapter publication dates for bookmarks'}</label>
 if (scan) return <div className="editable-field-heading">{option}<Tooltip pinOnClick description="Estimates chapters read by comparing each chapter’s publication date with the bookmark date. Chapters published on the bookmark date or with missing dates remain unconfirmed. Uses the scan tab to open eligible works’ Chapter Index pages so scans will take longer than usual.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Chapter publication dates information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></div>
 return <>{option}<p className="field-help">Optional: estimate chapters read by comparing each chapter’s publication date with the bookmark date. Chapters published on the bookmark date or with missing dates remain unconfirmed. Metadata processing may open extra AO3 pages, so imports take longer. Existing progress is kept unless you choose Overwrite for that bookmark. Marked for Later does not use this option.</p></>
}
