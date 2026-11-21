import { useSummaryMode } from '../display/useDisplayPreference'
import { saveSummaryMode, type SummaryMode } from '../display/display-settings'
const choices: { mode: SummaryMode; label: string }[] = [
 { mode: 'full', label: 'Always Show Full Summary' },
 { mode: 'expanded', label: 'Expanded by Default' },
 { mode: 'collapsed', label: 'Truncated by Default' },
]
export function SummarySettings({ onApply }: { onApply: () => void }) {
 const mode = useSummaryMode()
 return <fieldset className="settings-subsection summary-settings"><legend>Work Tile Summaries</legend><div className="summary-format-options">{choices.map(choice => <label className="check-label" key={choice.mode}><input type="radio" name="summary-format" value={choice.mode} checked={mode === choice.mode} onChange={() => saveSummaryMode(choice.mode)} onClick={onApply} />{choice.label}</label>)}</div></fieldset>
}
