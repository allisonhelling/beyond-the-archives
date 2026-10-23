import { browsingSettingsSection } from './settings-sections'
import { ao3Date, formatDate, saveDateFormat, savedDateFormat, type DateFormat } from '../../../lib/dates'
import { useState } from 'react'
import { pageSize, pageSizes, pageSizeKey, savedPageSize } from './page-size'

const exampleDate = '2026-10-20'
export function BrowsingSettings() {
  const [size, setSize] = useState(savedPageSize)
  const [dateFormat, setDateFormat] = useState(savedDateFormat)
  return <section id={browsingSettingsSection.id} tabIndex={-1} className="settings-card browsing-settings"><h2>{browsingSettingsSection.title}</h2><label><span>Works per page</span><select className="filter-input select-fit" value={size} onChange={event => { const next = pageSize(event.target.value)!; setSize(next); try { localStorage.setItem(pageSizeKey, String(next)) } catch { /* Keep this selection when storage is unavailable. */ } }}>{pageSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label><label><span>Date format</span><select className="filter-input select-fit" value={dateFormat} onChange={event => { const next = event.target.value as DateFormat; saveDateFormat(next); setDateFormat(next) }}><option value="MDY">Month/Day/Year (MDY)</option><option value="DMY">Day/Month/Year (DMY)</option><option value="YMD">Year-Month-Day (YMD)</option></select></label><p className="date-format-examples" aria-live="polite">Dates will appear: {formatDate(exampleDate, dateFormat)}<br />Date Updated: {ao3Date(exampleDate, dateFormat)}</p><p className="muted">Saved on this browser. Native calendar inputs follow your device settings.</p></section>
}
