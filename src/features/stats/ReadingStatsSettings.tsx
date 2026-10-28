import { useState } from 'react'
import { readingStatsSettingsSection } from '../settings/settings-sections'
import { readingSpeedKey, savedReadingSpeed, validReadingSpeed } from './preferences'

export function ReadingStatsSettings() {
 const [speed, setSpeed] = useState(() => String(savedReadingSpeed())), [message, setMessage] = useState(''), [error, setError] = useState('')
 return <section id={readingStatsSettingsSection.id} tabIndex={-1} className="settings-card"><h2>{readingStatsSettingsSection.title}</h2><p>Estimated reading time divides known chapter words by your reading speed. The default is 225 words per minute. This is an estimate; chapter timestamps do not measure time spent reading.</p><form className="story-form" onSubmit={event => {
  event.preventDefault(); setError(''); setMessage('')
  const value = Number(speed)
  if (!validReadingSpeed(value)) { setError('Enter a whole number between 1 and 2,000 words per minute.'); return }
  try { localStorage.setItem(readingSpeedKey, String(value)); setMessage('Reading speed saved on this browser.') } catch { setError('Could not save reading speed. Check browser storage permissions.') }
 }}><label>Reading Speed (Words per Minute)<input type="number" min={1} max={2000} step={1} required value={speed} onChange={event => { setSpeed(event.target.value); setMessage('') }} /></label><button className="button primary" type="submit">Save Reading Speed</button>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}</form><p className="muted">Saved on this browser and included in library backup preferences. Reading sessions are not recorded yet.</p></section>
}
