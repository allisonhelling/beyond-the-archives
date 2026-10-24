import { useState } from 'react'
import { saveSeriesImportBehavior, useSeriesImportBehavior, type SeriesImportBehavior } from './series-import-preferences'
import { seriesImportSettingsSection } from './settings-sections'

const descriptions = { choose: 'Choose works from each series', all: 'Automatically save all available works in each series' }
export function SeriesImportOptions({ defaultBehavior, override, onChange, disabled = false }: {
 defaultBehavior: SeriesImportBehavior; override: boolean; onChange(value: boolean): void; disabled?: boolean
}) {
 return <div className="form-control series-import-options"><label className="check-label"><input type="checkbox" checked={override} disabled={disabled} onChange={event => onChange(event.target.checked)} />{defaultBehavior === 'all' ? 'Choose series works for this import only' : 'Automatically save all series works for this import only'}</label><p className="field-help">Current series default: {descriptions[defaultBehavior]}. {override && <>This import: {descriptions[defaultBehavior === 'all' ? 'choose' : 'all']}.</>}</p></div>
}
export function SeriesImportSettings() {
 const { defaultBehavior } = useSeriesImportBehavior()
 const [message, setMessage] = useState('')
 return <section id={seriesImportSettingsSection.id} tabIndex={-1} className="settings-card"><h2>{seriesImportSettingsSection.title}</h2><p>Choose how series links in list scans, CSV files, and pasted links are imported. This default is saved on this browser. Each import can temporarily use the opposite behavior without changing this setting. Existing library entries keep their personal data.</p><label>When a series is encountered<select value={defaultBehavior} onChange={event => {
  try { saveSeriesImportBehavior(event.target.value as SeriesImportBehavior); setMessage('Series import default saved.') }
  catch { setMessage('Could not save the series import default. Check browser storage and retry.') }
 }}>{Object.entries(descriptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{message && <p role="status">{message}</p>}</section>
}
