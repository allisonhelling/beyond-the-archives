import { useSummaryMode } from '../display/useDisplayPreference'
import { saveSummaryMode, type SummaryMode } from '../display/display-settings'
export function SummarySettings() {
 const mode = useSummaryMode()
 return <label>Work Tile Summaries<select aria-label="Work Tile Summaries" value={mode} onChange={event => saveSummaryMode(event.target.value as SummaryMode)}><option value="full">Always Show Full Summary</option><option value="expanded">Show More / Less · Expanded by Default</option><option value="collapsed">Show More / Less · Truncated by Default</option></select></label>
}
