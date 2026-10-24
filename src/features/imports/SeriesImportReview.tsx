import { Dialog } from '../../components/Dialog'
import { WorkSummary } from '../library/summaries/WorkSummary'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useLibrary } from '../library/LibraryProvider'
import { rememberSeries } from '../library/series/series-repository'
import { Tooltip } from '../../components/Tooltip'
import type { Status } from '../library/model'
import { ImportReadingStatus } from './ImportReadingStatus'
import { previewSeries } from './repository'
import { classifyUrl, extractUrls, groupWorks, type SeriesPreview } from './urls'

export type SeriesWorkSelection = { seriesId: number; works: SeriesPreview['works'] }

type Review = { preview?: SeriesPreview; selected: Set<number>; error?: string; skipped?: boolean; closed?: Partial<Record<'summary' | 'tags', Set<number>>>; detailsSaved?: boolean }

function SeriesScopeAction({ label, scope, disabled, expanded, onClick }: { label: string; scope: string; disabled?: boolean; expanded?: boolean; onClick(): void }) {
 return <Tooltip description={`Applies to ${scope}`}>{id => <button type="button" className="text-button clickable-text" aria-describedby={id} aria-expanded={expanded} disabled={disabled} onClick={onClick}>{label}</button>}</Tooltip>
}

export function SeriesImportReview({ text, savedIds, busy, onConfirm, onCancel, initialPreviews = [], initialReadingStatus = 'to_read', onReadingStatusChange, onBusyChange, showReadingStatus = true, confirmLabel = 'Import selected', cancelLabel = 'Cancel', allowEmpty = false, automatic = false, embedded = false, singleSeries = false, error = '', previewCache, onPreview }: {
 previewCache?: ReadonlyMap<number, SeriesPreview>; onPreview?(preview: SeriesPreview): void
 embedded?: boolean; singleSeries?: boolean; error?: string
 automatic?: boolean
 allowEmpty?: boolean
 showReadingStatus?: boolean; confirmLabel?: string; cancelLabel?: string
 onBusyChange?(busy: boolean): void
 initialReadingStatus?: Status; onReadingStatusChange?(status: Status): void
 text: string; initialPreviews?: SeriesPreview[]; savedIds: Set<number>; busy: boolean
 onConfirm(works: SeriesPreview['works'], readingStatus: Status, seriesIds: number[], selections: SeriesWorkSelection[]): void; onCancel(): void
}) {
 const { refreshSeries } = useLibrary()
 const [readingStatus, setReadingStatus] = useState<Status>(initialReadingStatus)
 const series = useMemo(() => new Map(extractUrls(text).flatMap(url => {
  const result = classifyUrl(url)
  return result.kind === 'series' ? [[result.identity.seriesId, result.identity.normalizedUrl] as const] : []
 })), [text])
 const direct = groupWorks(extractUrls(text))
 const [reviews, setReviews] = useState<Record<number, Review>>(() => Object.fromEntries([...initialPreviews, ...(previewCache?.values() ?? [])].map(preview => [preview.seriesId, { preview, selected: new Set<number>() }])))
 const [loading, setLoading] = useState<number>()
 const [savingAll, setSavingAll] = useState(false)
 const saveDescription = 'Load and save full series details from AO3'
 const selections: SeriesWorkSelection[] = [...series.keys()].filter(id => !reviews[id]?.skipped).map(id => ({
  seriesId: id,
  works: (reviews[id]?.preview?.works ?? []).filter(work => (automatic || reviews[id].selected.has(work.workId)) && !direct.has(work.workId) && !savedIds.has(work.workId)),
 }))
 const selected = new Map(selections.flatMap(selection => selection.works.map(work => [work.workId, work] as const)))
 const automaticStarted = useRef(false)
 const ready = [...series.keys()].every(id => reviews[id]?.preview || reviews[id]?.skipped)
 const canConfirm = allowEmpty || direct.size + selected.size > 0
 const load = useCallback(async (id: number, url: string) => {
  setLoading(id)
  setReviews(current => ({ ...current, [id]: { ...current[id], selected: new Set(), error: undefined, skipped: false } }))
  try {
   const preview = await previewSeries(url)
   onPreview?.(preview)
   setReviews(current => ({ ...current, [id]: { preview, selected: new Set() } }))
  } catch (error) { setReviews(current => ({ ...current, [id]: { selected: new Set(), error: error instanceof Error ? error.message : 'Could not preview series. Retry or skip it.' } })) }
  finally { setLoading(undefined) }
 }, [onPreview])
 const requested = useRef(new Set([...initialPreviews.map(preview => preview.seriesId), ...(previewCache?.keys() ?? [])]))
 useEffect(() => {
  if (loading !== undefined || savingAll) return
  const next = [...series].find(([id]) => !requested.current.has(id))
  if (next) { const [id, url] = next; requested.current.add(id); void load(id, url) }
 }, [series, load, loading, savingAll, reviews])
 useEffect(() => { onBusyChange?.(loading !== undefined || savingAll); return () => onBusyChange?.(false) }, [loading, savingAll, onBusyChange])
 function confirmImport() { onConfirm([...selected.values()], readingStatus, [...series.keys()].filter(id => reviews[id]?.preview && !reviews[id]?.skipped), selections) }
 const confirmAutomatic = useEffectEvent(() => confirmImport())
 useEffect(() => {
  if (automatic && ready && canConfirm && loading === undefined && !savingAll && !busy && !automaticStarted.current) { automaticStarted.current = true; confirmAutomatic() }
 }, [automatic, ready, canConfirm, loading, savingAll, busy])
 async function saveDetails(id: number, url: string) {
  setLoading(id)
  setReviews(current => ({ ...current, [id]: { ...current[id], selected: current[id]?.selected ?? new Set(), error: undefined, skipped: false } }))
  try {
   const cached = previewCache?.get(id) ?? reviews[id]?.preview
   const preview = cached && !cached.basic ? cached : await previewSeries(url)
   onPreview?.(preview)
   await rememberSeries(preview)
   await refreshSeries(id)
   setReviews(current => ({ ...current, [id]: { ...current[id], preview, detailsSaved: true } }))
  } catch (error) {
   setReviews(current => ({ ...current, [id]: { ...current[id], error: error instanceof Error ? error.message : 'Could not save series details.' } }))
  } finally { setLoading(undefined) }
 }
 function setVisibility(show: boolean, seriesId?: number) {
  setReviews(current => Object.fromEntries(Object.entries(current).map(([key, review]) => {
   if (seriesId !== undefined && Number(key) !== seriesId) return [key, review]
   const closed = new Set(show ? [] : review.preview?.works.map(work => work.workId) ?? [])
   return [key, { ...review, closed: { summary: closed, tags: closed } }]
  })))
 }
 function toggleSection(id: number, workId: number, field: 'summary' | 'tags', open: boolean) {
  setReviews(current => {
   if (!!current[id].closed?.[field]?.has(workId) === !open) return current
   const closed = new Set(current[id].closed?.[field])
   if (open) closed.delete(workId); else closed.add(workId)
   return { ...current, [id]: { ...current[id], closed: { ...current[id].closed, [field]: closed } } }
  })
 }
 function setAllSelected(selected: boolean) {
  setReviews(current => Object.fromEntries(Object.entries(current).map(([id, review]) => [id, { ...review, selected: new Set(!selected || review.skipped ? [] : review.preview?.works.filter(work => !savedIds.has(work.workId) && !direct.has(work.workId)).map(work => work.workId) ?? []) }])))
 }
 async function saveAllDetails() {
  setSavingAll(true)
  try { for (const [id, url] of series) if (!reviews[id]?.skipped && !reviews[id]?.detailsSaved) await saveDetails(id, url) }
  finally { setSavingAll(false) }
 }
 function select(id: number, ids: number[]) { setReviews(current => ({ ...current, [id]: { ...current[id], selected: new Set(ids) } })) }
 const title = automatic ? 'Import all series works' : 'Choose Works From Series'
 const disabled = busy || loading !== undefined || savingAll
 const content = <section className="story-form series-import-review" aria-label="Review series imports">
  {embedded && <h2>{title}</h2>}
  {error && <p role="alert" className="error-message">{error}</p>}
  {automatic && ready && !canConfirm && <p role="status">No new available series works to import. Already saved works are kept.</p>}
  {!singleSeries && <p>{series.size} series detected · {direct.size} directly linked works included.</p>}
  <p className="field-help">{automatic ? 'All available series works are included automatically.' : 'Only selected works are added to your library.'}{!singleSeries && ' Previews are temporary unless you choose to save full series details. Saving details includes information about unsaved works; it does not add them to your library.'} For extension previews, keep this page open and complete any AO3 sign-in in the requested tab.</p>
  {showReadingStatus && <><ImportReadingStatus value={readingStatus} disabled={disabled} onChange={status => { setReadingStatus(status); onReadingStatusChange?.(status) }} />
  <p className="field-help">Applies to the reviewed series and all works imported from these links.</p></>}
  {!singleSeries && <div className="form-actions series-preview-controls" role="group" aria-label="All series top controls">
   <SeriesScopeAction label="Select all" scope="all series" disabled={disabled || automatic} onClick={() => setAllSelected(true)} />
   <SeriesScopeAction label="Clear selection" scope="all series" disabled={disabled || automatic} onClick={() => setAllSelected(false)} />
   <SeriesScopeAction label="View all" scope="all series" disabled={disabled} onClick={() => setVisibility(true)} />
   <SeriesScopeAction label="Hide all" scope="all series" disabled={disabled} onClick={() => setVisibility(false)} />
  </div>}
  {[...series].map(([id, url]) => {
   const review = reviews[id]
   const preview = review?.preview
   const seriesLabel = preview?.title ? `${preview.title} • Series ${id}` : `Series ${id}`
   const available = preview?.works.filter(work => !savedIds.has(work.workId) && !direct.has(work.workId)) ?? []
   const expanded = Boolean(preview?.works.length && preview.works.every(work => !review.closed?.summary?.has(work.workId) && !review.closed?.tags?.has(work.workId)))
   const scope = preview?.title || `Series ${id}`
   const selectionControls = preview && !automatic && <>
    <SeriesScopeAction label="Select all" scope={scope} disabled={disabled} onClick={() => select(id, available.map(work => work.workId))} />
    <SeriesScopeAction label="Clear selection" scope={scope} disabled={disabled} onClick={() => select(id, [])} />
    <SeriesScopeAction label={expanded ? 'Hide all' : 'View all'} scope={scope} disabled={!preview.works.length} expanded={expanded} onClick={() => setVisibility(!expanded, id)} />
   </>
   return <section className="series-import-preview" key={id} aria-label={seriesLabel}>
    <div className="series-import-heading"><h3><a className="clickable-text" href={url} target="_blank" rel="noreferrer">{seriesLabel}</a></h3>{!singleSeries && !review?.skipped && <Tooltip description={review?.detailsSaved ? 'Full series details saved' : saveDescription}>{tooltipId => <button type="button" className="button secondary" aria-describedby={tooltipId} disabled={disabled || !preview || review?.detailsSaved} onClick={() => void saveDetails(id, url)}>{review?.detailsSaved ? 'Full series details saved' : 'Save'}</button>}</Tooltip>}</div>
    {preview?.description && <p className="story-summary">{preview.description}</p>}
    {review?.error && <p className="error-message" role="alert">{review.error}</p>}
    {review?.skipped ? <><p>Series skipped.</p><button className="text-button" disabled={disabled} onClick={() => void load(id, url)}>Review series</button></> : <>
     {!preview && (review?.error ? <button className="button secondary" disabled={disabled} onClick={() => void load(id, url)}>Retry preview</button> : <p role="status">{loading === id ? 'Loading series…' : 'Waiting to load series…'}</p>)}
     {preview && <>
      <p>{preview.works.length} visible works · {automatic ? available.length : available.filter(work => review.selected.has(work.workId)).length} selected. AO3 may hide unavailable or restricted works.</p>
      {!automatic && <div className="form-actions series-preview-controls" role="group" aria-label="Series selection controls">{selectionControls}</div>}
      {!preview.works.length && <p>No available works were found in this listing.</p>}
      {preview.works.map(work => {
       const saved = savedIds.has(work.workId), linked = direct.has(work.workId)
       return <div className="series-import-work" key={work.workId}>
        <div className="series-import-work-title"><label className="series-work-choice"><input type="checkbox" disabled={automatic || disabled || saved || linked} checked={automatic || saved || linked || review.selected.has(work.workId)} onChange={event => select(id, event.target.checked ? [...review.selected, work.workId] : [...review.selected].filter(value => value !== work.workId))} />{work.position ? `Part ${work.position}: ` : ''}{work.title}</label><Tooltip description="View on AO3">{tooltipId => <a className="clickable-text series-work-link" href={work.url} target="_blank" rel="noreferrer" aria-label={`View on AO3: ${work.title}`} aria-describedby={tooltipId}><ExternalLink size={18} aria-hidden="true" /></a>}</Tooltip></div>
        <p className="field-help">{work.authors.join(', ') || 'Unknown author'} · {work.fandoms?.join(' · ') || 'Fandom unknown'} · {work.wordCount === null ? 'Word count unknown' : `${work.wordCount.toLocaleString()} words`} · {work.chapters || 'Chapters unknown'} · {work.complete === null ? 'Completion unknown' : work.complete ? 'Complete' : 'In progress'}{saved ? ' · Already saved' : linked ? ' · Included via pasted work link' : ''}</p>
        <details open={!review.closed?.summary?.has(work.workId)} onToggle={event => toggleSection(id, work.workId, 'summary', event.currentTarget.open)}><summary>Summary</summary><div className="story-summary"><WorkSummary metadata={work} fallback="No summary provided." /></div></details>
        <details open={!review.closed?.tags?.has(work.workId)} onToggle={event => toggleSection(id, work.workId, 'tags', event.currentTarget.open)}><summary>Tags</summary><p className="field-help">{work.tags.join(' · ') || 'No tags provided.'}</p></details>
       </div>
      })}
     </>}
     <div className="form-actions series-preview-controls" role="group" aria-label="Series footer controls">{selectionControls}{!singleSeries && <button type="button" className="text-button clickable-text series-import-skip" disabled={disabled} onClick={() => setReviews(current => ({ ...current, [id]: { selected: new Set(), skipped: true } }))}>Skip series</button>}</div>
    </>}
   </section>
  })}
  <p className="field-help">Overlapping selections are imported once. Original series part numbers are preserved when work metadata loads.</p>
  {!singleSeries && <div className="form-actions series-preview-controls" aria-label="All series controls">
   <Tooltip description={saveDescription}>{id => <button type="button" className="button secondary" aria-describedby={id} disabled={disabled || !ready || [...series.keys()].every(id => reviews[id]?.skipped || reviews[id]?.detailsSaved)} onClick={() => void saveAllDetails()}>Save All Series</button>}</Tooltip>
   <SeriesScopeAction label="Hide All" scope="all series" disabled={disabled} onClick={() => setVisibility(false)} />
   <SeriesScopeAction label="Select All" scope="all series" disabled={disabled || automatic} onClick={() => setAllSelected(true)} />
  </div>}
  <div className="form-actions"><button className="button primary" disabled={disabled || !ready || !canConfirm} onClick={confirmImport}>{automatic ? 'Retry importing all series works' : confirmLabel}</button><button className="button secondary" disabled={disabled} onClick={onCancel}>{cancelLabel}</button></div>
 </section>
 return embedded ? content : <Dialog title={title} className="series-review-dialog" busy={disabled} onClose={onCancel}>{content}</Dialog>
}
