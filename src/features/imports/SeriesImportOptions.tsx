import { InfoTooltip } from '../../components/InfoTooltip'
import { useState, type ReactNode } from 'react'
import { saveSeriesImportBehavior, useSeriesImportBehavior, type SeriesImportBehavior } from './series-import-preferences'
import { seriesImportSettingsSection } from './settings-sections'

const descriptions = { choose: 'Choose Works from Each Series', all: 'Automatically Save All Available Works in Each Series' }
export function SeriesImportOptions({ defaultBehavior, override, onChange, reviewRelatedSeries, onReviewRelatedSeriesChange, disabled = false, children }: {
 reviewRelatedSeries: boolean; onReviewRelatedSeriesChange(value: boolean): void
 defaultBehavior: SeriesImportBehavior; override: boolean; onChange(value: boolean): void; disabled?: boolean; children?: ReactNode
}) {
 return <div className="form-control series-import-options"><p className="field-help">Current series default: {descriptions[defaultBehavior]}.</p><div className="form-controls-row"><label className="check-label"><input type="checkbox" checked={override} disabled={disabled} onChange={event => onChange(event.target.checked)} />{defaultBehavior === 'all' ? 'Choose Series Works for This Import Only' : 'Automatically Save All Series Works for This Import Only'}</label>{children}</div><div className="editable-field-heading"><label className="check-label"><input type="checkbox" checked={reviewRelatedSeries} disabled={disabled} onChange={event => onReviewRelatedSeriesChange(event.target.checked)} />Check Series Containing Imported Works</label><InfoTooltip description="When unchecked, only directly bookmarked series or explicitly supplied series links are reviewed. Enable this to also check series that the imported works belong to. Your series import behavior applies to those series too." label="Related Series Information" size={14} /></div></div>
}
export function SeriesImportSettings() {
 const { defaultBehavior } = useSeriesImportBehavior()
 const [message, setMessage] = useState('')
 return <section id={seriesImportSettingsSection.id} tabIndex={-1} className="settings-card"><h2>{seriesImportSettingsSection.title}</h2><p>Choose how series links in list scans, CSV files, and pasted links are imported. This default is saved on this browser. Each import can temporarily use the opposite behavior without changing this setting. Related-series checks are off for each new import unless explicitly selected. Existing library entries keep their personal data.</p><label>When a Series Is Encountered<select value={defaultBehavior} onChange={event => {
  try { saveSeriesImportBehavior(event.target.value as SeriesImportBehavior); setMessage('Series import default saved.') }
  catch { setMessage('Could not save the series import default. Check browser storage and retry.') }
 }}>{Object.entries(descriptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{message && <p role="status">{message}</p>}</section>
}
