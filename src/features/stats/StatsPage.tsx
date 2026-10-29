import { useActivity } from '../../lib/use-activity'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Info, LockKeyhole } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import { Tooltip } from '../../components/Tooltip'
import { RetryError } from '../../components/RetryError'
import { savedDateFormat } from '../../lib/dates'
import { useLibrary } from '../library/LibraryProvider'
import { statuses } from '../library/model'
import { loadStatsWorks } from './repository'
import { savedReadingSpeed } from './preferences'
import { dimensions, distribution, favorites, heatmap, inPeriod, months, observations, parsePeriod, periodBounds, periodText, shiftPeriod, statusProgress, timeBuckets, totals, type Bucket, type Dimension, type Period, type StatsWork } from './stats'
import './stats.css'

const statsSections = [
 { id: 'volume', label: 'Volume & Progress' }, { id: 'profile', label: 'Your Reading Profile' },
 { id: 'favorites', label: 'Favorites & Familiar Worlds' }, { id: 'habits', label: 'Reading Habits' },
 { id: 'trends', label: 'Trends Over Time' },
] as const
type StatsSection = typeof statsSections[number]['id']

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
function periodLabel(period: Period) { return period.mode === 'all_time' ? 'All Time' : period.mode === 'yearly' ? String(period.year) : `${months[period.month]} ${period.year}` }

function PeriodControls({ period, onChange }: { period: Period; onChange: (period: Period) => void }) {
 const format = savedDateFormat(), [draft, setDraft] = useState<string | null>(null), [error, setError] = useState('')
 const [picker, setPicker] = useState(false), [pickerYear, setPickerYear] = useState(period.year)
 const input = useRef<HTMLInputElement>(null)
 const text = periodText(period, format), placeholder = period.mode === 'yearly' ? 'yyyy' : format === 'YMD' ? 'yyyy-mm' : 'mm/yyyy'
 function select(next: Period) { onChange(next); setDraft(null); setError('') }
 function openPicker() { setPickerYear(period.year); setDraft(null); setError(''); setPicker(true) }
 return <section className="stats-period settings-card" aria-label="Statistics Period">
  <div className="stats-controls"><label>View <select className="filter-input select-fit" value={period.mode} onChange={event => select({ ...period, mode: event.target.value as Period['mode'] })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="all_time">All Time</option></select></label>
   {period.mode === 'all_time' ? <strong>All Time</strong> : <div className="stats-period-navigation">
    <button className="icon-button" aria-label="Previous Period" disabled={period.year === 1 && (period.mode === 'yearly' || period.month === 0)} onClick={() => select(shiftPeriod(period, -1))}><ChevronLeft aria-hidden="true" /></button>
    <button className="text-button stats-period-label" aria-haspopup="dialog" aria-expanded={picker} onClick={openPicker}>{periodLabel(period)}</button>
    <button className="icon-button" aria-label="Choose Period" title="Choose Period" aria-haspopup="dialog" aria-expanded={picker} onClick={openPicker}><CalendarDays size={18} aria-hidden="true" /></button>
    <button className="icon-button" aria-label="Next Period" disabled={period.year === 9999 && (period.mode === 'yearly' || period.month === 11)} onClick={() => select(shiftPeriod(period, 1))}><ChevronRight aria-hidden="true" /></button>
   </div>}
   <button className="text-button stats-today" title={`Go to current ${period.mode === 'yearly' ? 'year' : 'month'}`} onClick={() => { const now = new Date(); select({ mode: period.mode === 'all_time' ? 'monthly' : period.mode, year: now.getFullYear(), month: now.getMonth() }) }}><CalendarCheck size={18} aria-hidden="true" />Today</button>
  </div>
  {picker && <Dialog title={period.mode === 'yearly' ? 'Choose a Year' : 'Choose a Month'} className="stats-period-dialog" initialFocusRef={input} onClose={() => setPicker(false)}>
   <form className="stats-controls" onSubmit={event => {
    event.preventDefault()
    const next = parsePeriod(draft ?? text, period, format)
    if (next) { select(next); setPicker(false) }
    else setError(`Enter a valid ${placeholder} between years 0001 and 9999.`)
   }}>
    <label htmlFor="stats-period-input">Exact {period.mode === 'yearly' ? 'Year' : 'Month and Year'} <span className="muted">({placeholder})</span></label>
    <input ref={input} id="stats-period-input" className="filter-input" placeholder={placeholder} value={draft ?? text} aria-invalid={Boolean(error)} aria-describedby={error ? 'stats-period-error' : undefined} onChange={event => { setDraft(event.target.value); setError('') }} />
    <button className="button secondary" type="submit">Go</button>
   </form>
   {error && <p role="alert" id="stats-period-error">{error}</p>}
   <div className="stats-controls stats-picker-heading"><button className="icon-button" aria-label="Previous Calendar Years" disabled={pickerYear <= 1} onClick={() => setPickerYear(Math.max(1, pickerYear - (period.mode === 'monthly' ? 1 : 12)))}><ChevronLeft /></button><strong>{period.mode === 'monthly' ? pickerYear : `${Math.max(1, pickerYear - 5)}–${Math.min(9999, pickerYear + 6)}`}</strong><button className="icon-button" aria-label="Next Calendar Years" disabled={pickerYear >= 9999} onClick={() => setPickerYear(Math.min(9999, pickerYear + (period.mode === 'monthly' ? 1 : 12)))}><ChevronRight /></button></div>
   <div className="stats-calendar-grid">{(period.mode === 'monthly' ? months.map((label, month) => ({ label, year: pickerYear, month })) : Array.from({ length: 12 }, (_, index) => pickerYear - 5 + index).filter(year => year >= 1 && year <= 9999).map(year => ({ label: String(year), year, month: period.month }))).map(item => <button key={item.label} className={`button ${item.year === period.year && (period.mode === 'yearly' || item.month === period.month) ? 'primary' : 'secondary'}`} aria-pressed={item.year === period.year && (period.mode === 'yearly' || item.month === period.month)} onClick={() => { select({ ...period, year: item.year, month: item.month }); setPicker(false) }}>{item.label}</button>)}</div>
  </Dialog>}
 </section>
}

function Breakdown({ title, rows, unit = '', percent = false }: { title: string; rows: Bucket[]; unit?: string; percent?: boolean }) {
 const [expanded, setExpanded] = useState(false), total = rows.reduce((sum, row) => sum + row.value, 0), max = rows[0]?.value || 1
 return <section className="settings-card stats-breakdown"><h3>{title}</h3>{rows.length ? <><ul>{(expanded ? rows : rows.slice(0, 6)).map(row => <li key={row.key ?? row.label}><div><span>{row.label}</span><strong>{number(row.value)}{unit && ` ${unit}`}{percent && <small> · {(row.value / total * 100).toFixed(1)}%</small>}</strong></div><meter min={0} max={percent ? total : max} value={row.value} aria-label={`${title}: ${row.label}`} /></li>)}</ul>{rows.length > 6 && <button className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show Less' : `Show All ${rows.length}`}</button>}</> : <p className="muted">No recorded activity for this selection.</p>}</section>
}

function VolumeChart({ title, rows }: { title: string; rows: Bucket[] }) {
 const maximum = Math.max(1, ...rows.map(row => row.value))
 return <section className="settings-card stats-chart"><h3>{title}</h3><p className="muted">Known words from chapters marked read. Hover or focus a bar for its total.</p><div className="stats-chart-scroll"><div className={`stats-bars${rows.length > 31 ? ' stats-bars-daily-year' : ''}`} role="group" aria-label={title}>{rows.map(row => <div className="stats-bar-column" key={row.label}><svg viewBox="0 0 20 100" preserveAspectRatio="none" role="img" tabIndex={0} aria-label={`${row.label}: ${number(row.value)} words`}><title>{row.label}: {number(row.value)} words</title><rect x="2" y={100 - row.value / maximum * 100} width="16" height={row.value / maximum * 100} rx="1" /></svg><span>{row.label}</span></div>)}</div></div><details><summary>View Chart Data</summary><div className="stats-table-scroll"><table><caption>{title}</caption><thead><tr><th scope="col">Period</th><th scope="col">Words</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{number(row.value)}</td></tr>)}</tbody></table></div></details></section>
}

export function StatsPage() {
 const { revision } = useLibrary()
 const [activeSection, setActiveSection] = useState<StatsSection>('volume')
 const panelProps = (id: StatsSection) => ({ role: 'tabpanel', id: `stats-panel-${id}`, 'aria-labelledby': `stats-tab-${id}`, hidden: activeSection !== id, tabIndex: 0 })
 const [period, setPeriod] = useState<Period>(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth(), mode: 'monthly' } })
 const [{ works, all }, setData] = useState<{ works: StatsWork[]; all: ReturnType<typeof observations> }>({ works: [], all: [] }), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0)
 useActivity(Boolean(loading), 'Loading reading statistics…')
 const [basis, setBasis] = useState<'words' | 'fics'>('fics'), [includeRereads, setIncludeRereads] = useState(true), [trendDimension, setTrendDimension] = useState<Dimension>('fandoms')
 useEffect(() => {
  let active = true
  void loadStatsWorks().then(data => { if (active) { setData({ works: data, all: observations(data) }); setError('') } }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load reading statistics.') }).finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [revision, retry])
 const selected = inPeriod(all, period)
 const volume = totals(selected), previousPeriod = period.mode === 'all_time' ? null : shiftPeriod(period, -1), previous = totals(previousPeriod ? inPeriod(all, previousPeriod) : []), speed = savedReadingSpeed()
 const minutes = Math.round(volume.words / speed), status = statusProgress(works, period), grid = heatmap(selected), maxHeat = Math.max(1, ...grid.flat())
 const rereads = selected.filter(row => !row.unique), rereadWorks = new Map<string, { label: string; passes: Set<number> }>()
 for (const row of rereads) { const item = rereadWorks.get(row.work.key) ?? { label: row.work.metadata.title || 'Untitled Fic', passes: new Set<number>() }; item.passes.add(row.pass); rereadWorks.set(row.work.key, item) }
 const rereadRanking = [...rereadWorks].map(([key, row]) => ({ key, label: row.label, value: row.passes.size })).sort((a, b) => b.value - a.value)
 const trendPeriods: Period[] = period.mode === 'all_time' ? [...new Set(all.map(({ event }) => new Date(event.at).getFullYear()))].sort((a, b) => a - b).map(year => ({ year, month: 0, mode: 'yearly' })) : Array.from({ length: period.mode === 'monthly' ? 6 : 5 }, (_, index) => shiftPeriod(period, index - (period.mode === 'monthly' ? 5 : 4))).filter(item => item.year >= 1)
 const trendRows = trendPeriods.map(item => ({ period: item, rows: distribution(inPeriod(all, item), trendDimension, basis, includeRereads) }))
 const trendWeights = new Map<string, number>()
 for (const item of trendRows) for (const row of item.rows) trendWeights.set(row.label, (trendWeights.get(row.label) ?? 0) + row.value)
 const trendLabels = [...trendWeights].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([label]) => label)
 const delta = previous.words ? `${volume.words >= previous.words ? '+' : ''}${((volume.words - previous.words) / previous.words * 100).toFixed(1)}%` : 'No prior baseline'
 return <div className="stats-page"><div className="page-heading"><div><h1>Reading Stats</h1></div><span className="private-badge"><LockKeyhole size={13} />Only You</span></div>
  <PeriodControls period={period} onChange={setPeriod} />
  {loading ? <p role="status">Loading Reading Stats…</p> : error ? <RetryError message={error} onRetry={() => { setLoading(true); setRetry(value => value + 1) }} /> : <>
   <p className="muted">{period.mode === 'all_time' ? 'All metrics include all recorded dates in your local time zone.' : `All metrics follow ${periodLabel(period)} in your local time zone. Comparisons and trends end with this period.`} Recorded chapter activity includes archived DNF attempts; missing history is never backfilled.</p>
   <div className="stats-controls stats-tabs" role="tablist" aria-label="Reading Statistics Sections" onKeyDown={event => {
    const index = statsSections.findIndex(section => section.id === activeSection)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? statsSections.length - 1 : event.key === 'ArrowRight' ? (index + 1) % statsSections.length : event.key === 'ArrowLeft' ? (index - 1 + statsSections.length) % statsSections.length : null
    if (next === null) return
    event.preventDefault()
    setActiveSection(statsSections[next].id)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
   }}>{statsSections.map(section => <button key={section.id} type="button" role="tab" id={`stats-tab-${section.id}`} aria-controls={`stats-panel-${section.id}`} aria-selected={activeSection === section.id} tabIndex={activeSection === section.id ? 0 : -1} className={`button ${activeSection === section.id ? 'primary' : 'secondary'}`} onClick={() => setActiveSection(section.id)}>{section.label}</button>)}</div>
   {selected.length === 0 && <section className="settings-card" role="status"><h2>No Chapter Activity Yet</h2><p>There are no dated chapter completions in this period. Mark chapters read with the AO3 companion to start tracking words and habits, or choose another period. Status activity can still appear below.</p><Link className="text-button" to="/settings#ios-safari-userscript">Set Up the AO3 Browser Bar</Link></section>}
   <div {...panelProps('volume')} className="stats-volume-panel"><section aria-labelledby="volume-heading"><h2 id="volume-heading">Volume & Progress</h2><div className="stats-metrics">{[
    ['Total Words Read', number(volume.words), 'Unique words + re-read words'], ['Unique Words Read', number(volume.unique), 'First recorded read of each chapter'], ['Re-Read Words', number(volume.reread), 'Words consumed again'], ['Estimated Reading Time', `${Math.floor(minutes / 60)}h ${minutes % 60}m`, `At ${speed} words per minute`], ['Fics Read', number(volume.works), 'Distinct fics with chapter activity'], ['Re-Read Passes', number(rereadRanking.reduce((sum, row) => sum + row.value, 0)), 'Recorded repeat passes, including partial reads'], ['Chapters Marked Read', number(volume.chapters), `${volume.unknown} with unknown word counts`],
   ].map(([label, value, detail]) => <div className="settings-card stats-metric" key={label}><h3 aria-label={label}>{label}{label === 'Total Words Read' && <> <Tooltip pinOnClick description="Word totals count completed chapters, rather than the full length of partially read works. Unknown chapter word counts are excluded.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Total Words Read Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></>}</h3><strong>{value}</strong><p className="muted">{detail}{label === 'Estimated Reading Time' && <><br /><Link className="clickable-text" to="/settings#settings-reading-stats">Change Reading Speed</Link></>}</p></div>)}</div></section>
   {volume.unknown > 0 && <p className="error-message" role="status">{number(volume.unknown)} chapter records have unknown word counts. Word totals, charts, and time estimates are incomplete.</p>}
   <section className="settings-card"><h3>Completion Status Progression</h3><p className="muted">{period.mode === 'all_time' ? 'All works, grouped by their latest recorded status.' : 'Works added or updated in this period, grouped by their last recorded status before the period ended.'} Archived attempts remain separate.</p><div className="stats-statuses">{Object.entries(statuses).map(([key, label]) => <div key={key}><strong>{number(status.find(row => row.label === key)?.value ?? 0)}</strong><span>{label}</span></div>)}</div><p className="muted">{number(status.find(row => row.label === 'finished')?.value ?? 0)} works {period.mode === 'all_time' ? 'are' : 'ended this period'} finished. Current metadata and personal ratings apply to historical breakdowns.</p></section>
   </div>
   <section {...panelProps('profile')}><h2 id="taxonomy-heading">Your Reading Profile</h2><div className="stats-controls"><label>Calculate By <select className="filter-input select-fit" value={basis} onChange={event => setBasis(event.target.value as 'words' | 'fics')}><option value="fics">Number of Fics</option><option value="words">Words Read</option></select></label><label className="check-label"><input type="checkbox" checked={includeRereads} onChange={event => setIncludeRereads(event.target.checked)} />Include Re-Reads</label></div><p className="muted">These controls apply to profiles, tag/author favorites, and trends. Re-read rankings always use repeat reads. Fic counts include each recorded reading pass once per period; partial passes count. Repeated chapters identify additional passes. Multi-tag works split their credit equally in distributions, so percentages total 100%. Length classes use full fic length: under 1,000; 1,000–9,999; 10,000–39,999; 40,000–100,000; over 100,000 words.</p><div className="stats-grid">{dimensions.slice(0, 5).map(item => <Breakdown key={item.key} title={item.title} rows={distribution(selected, item.key, basis, includeRereads)} percent unit={basis === 'words' ? 'words' : ''} />)}</div></section>
   <section {...panelProps('favorites')}><h2 id="favorites-heading">Favorites & Familiar Worlds</h2><p className="muted">Tags receive one appearance per fic/pass, or all its read words. Ties are listed together. Archived DNF records retain authors and fandoms; other tags and personal ratings may be unavailable.</p><div className="stats-grid"><Breakdown title="Most Re-Read Fics" rows={rereadRanking} unit="passes" /><Breakdown title="Most Re-Read Fandoms" rows={favorites(rereads, 'fandoms', basis)} unit={basis === 'words' ? 'words' : 'appearances'} />{dimensions.slice(5).map(item => <Breakdown key={item.key} title={`Most Read ${item.title}`} rows={favorites(selected, item.key, basis, includeRereads)} unit={basis === 'words' ? 'words' : 'appearances'} />)}</div></section>
   <section {...panelProps('habits')}><h2 id="habits-heading">Reading Habits</h2>{previousPeriod && <div className="settings-card"><h3>Compared With {periodLabel(previousPeriod)}</h3><p className="stats-comparison"><strong>{delta}</strong> · {number(volume.words)} words versus {number(previous.words)} words</p><p className="muted">Full calendar periods, including recorded re-reads. The current period may still be underway.</p></div>}<VolumeChart title="Daily Word Velocity" rows={timeBuckets(selected, period, true)} />{period.mode !== 'monthly' && <VolumeChart title={period.mode === 'all_time' ? 'Yearly Reading Volume' : 'Monthly Reading Volume'} rows={timeBuckets(selected, period)} />}{period.mode === 'all_time' && <p className="muted">All Time charts show recorded days and years; dates without recorded chapters are omitted.</p>}
   <section className="settings-card"><h3>Activity by Day & Hour</h3><p className="muted">Chapter completion records, including re-reads, in your local time zone. Batch completions share the time they were marked.</p><div className="stats-table-scroll"><table className="stats-heatmap"><caption className="sr-only">Chapter Completions by Weekday and Hour</caption><thead><tr><th scope="col">Day</th>{grid[0].map((_, hour) => <th key={hour} scope="col">{String(hour).padStart(2, '0')}</th>)}</tr></thead><tbody>{grid.map((hours, day) => <tr key={day}><th scope="row">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}</th>{hours.map((count, hour) => <td key={hour} data-level={count === 0 ? 0 : Math.ceil(count / maxHeat * 4)} title={`${count} chapter completions at ${hour}:00`}>{count || '·'}</td>)}</tr>)}</tbody></table></div><p className="muted">Darker cells mean more chapter completions.</p></section></section>
   <section {...panelProps('trends')} className="settings-card"><h2>Trends Over Time</h2><label className="stats-controls">Track <select className="filter-input select-fit" value={trendDimension} onChange={event => setTrendDimension(event.target.value as Dimension)}>{dimensions.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label><p className="muted">{period.mode === 'all_time' ? 'Top tags across all recorded years.' : `Top tags across ${period.mode === 'monthly' ? 'six months' : 'five years'} ending in the selected period.`} Uses the profile controls above; historical periods show complete calendar totals.</p><div className="stats-table-scroll"><table><caption>{dimensions.find(item => item.key === trendDimension)?.title} · {basis === 'words' ? 'Words Read' : 'Fic Credit'}</caption><thead><tr><th scope="col">Tag</th>{trendRows.map(item => <th key={periodLabel(item.period)} scope="col">{periodLabel(item.period)}</th>)}</tr></thead><tbody>{trendLabels.length ? trendLabels.map(label => <tr key={label}><th scope="row">{label}</th>{trendRows.map(item => <td key={periodLabel(item.period)}>{number(item.rows.find(row => row.label === label)?.value ?? 0)}</td>)}</tr>) : <tr><td colSpan={trendRows.length + 1}>No recorded activity in these periods.</td></tr>}</tbody></table></div></section>
   <details className="settings-card"><summary>How These Statistics Work</summary><p className="muted">Each chapter’s first recorded non-re-read completion contributes to unique words once across all dates. Later reads contribute to re-read words. Re-reading never creates another library entry. Progress edits and imported finished dates do not supply chapter word counts or exact reading times. Time estimates divide known words by your reading speed; elapsed days between starting and finishing are not time spent reading. Reading sessions are not recorded yet. Archived attempts retain their original chapter history, but some taxonomy is unavailable. Deleted entries without an archived record cannot contribute.</p><p className="muted">Selected range: {period.mode === 'all_time' ? 'All recorded dates.' : `${new Date(periodBounds(period)[0]).toLocaleDateString()} through ${new Date(periodBounds(period)[1] - 1).toLocaleDateString()}.`}</p></details>
  </>}
 </div>
}
