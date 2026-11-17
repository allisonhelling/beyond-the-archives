import { useSummaryMode } from '../display/useDisplayPreference'
import { saveSummaryMode, type SummaryMode } from '../display/display-settings'
import { exampleWork } from '../display/display-examples'
import { WorkSummary } from './WorkSummary'
const choices: { mode: SummaryMode; label: string }[] = [
 { mode: 'full', label: 'Always Show Full Summary' },
 { mode: 'expanded', label: 'Expanded by Default' },
 { mode: 'collapsed', label: 'Truncated by Default' },
]
export function SummarySettings() {
 const mode = useSummaryMode()
 return <fieldset className="settings-subsection summary-settings"><legend>Work Tile Summaries</legend><div className="summary-format-options">{choices.map(choice => <div className="summary-format-option" key={choice.mode} data-selected={mode === choice.mode}><label className="check-label"><input type="radio" name="summary-format" value={choice.mode} checked={mode === choice.mode} onChange={() => saveSummaryMode(choice.mode)} />{choice.label}</label><div className="story-summary"><WorkSummary tile mode={choice.mode} metadata={exampleWork.metadata} /></div></div>)}</div></fieldset>
}
