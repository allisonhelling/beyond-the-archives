import { browsingSettingsSection } from './settings-sections'
import { ao3Date, formatDate, saveDateFormat, savedDateFormat, type DateFormat } from '../../../lib/dates'
import { useState, useSyncExternalStore } from 'react'
import { displaySnapshot, subscribeDisplay, offlineReadingOptions, offlineReadingPriority, saveOfflineReadingPriority, type OfflineReadingPriority } from '../display/display-settings'
import { pageSize, pageSizes, pageSizeKey, savedPageSize } from './page-size'

const exampleDate = '2026-10-20'
export function BrowsingSettings() {
  const [size, setSize] = useState(savedPageSize)
  const [dateFormat, setDateFormat] = useState(savedDateFormat)
  const [error, setError] = useState('')
  const offlinePriority = offlineReadingPriority(useSyncExternalStore(subscribeDisplay, displaySnapshot))
  return <section id={browsingSettingsSection.id} tabIndex={-1} className="settings-card browsing-settings"><h2>{browsingSettingsSection.title}</h2><label><span>Works per Page</span><select className="filter-input select-fit" value={size} onChange={event => { const next = pageSize(event.target.value)!; setSize(next); try { localStorage.setItem(pageSizeKey, String(next)) } catch { /* Keep this selection when storage is unavailable. */ } }}>{pageSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label><label><span>Date Format</span><select className="filter-input select-fit" value={dateFormat} onChange={event => { const next = event.target.value as DateFormat; saveDateFormat(next); setDateFormat(next) }}><option value="MDY">Month/Day/Year (MDY)</option><option value="DMY">Day/Month/Year (DMY)</option><option value="YMD">Year-Month-Day (YMD)</option></select></label><p className="date-format-examples" aria-live="polite">Dates will appear: {formatDate(exampleDate, dateFormat)}<br />Date Updated: {ao3Date(exampleDate, dateFormat)}</p><label><span>Read Offline Priority</span><select className="filter-input select-fit" value={offlinePriority} onChange={event => { setError(''); try { saveOfflineReadingPriority(event.target.value as OfflineReadingPriority) } catch { setError('Could not save the offline reader priority. Check browser storage and try again.') } }}>{Object.entries(offlineReadingOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{error && <p role="alert" className="error-message">{error}</p>}<p className="field-help">Read Offline opens your preferred available reader, falling back to the other when needed. Reader reports or a saved BookFusion link do not confirm a download on this device.</p><p className="muted">Saved on this browser. Native calendar inputs follow your device settings.</p></section>
}
