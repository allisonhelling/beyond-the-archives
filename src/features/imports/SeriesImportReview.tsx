import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useLibrary } from '../library/LibraryProvider'
import { rememberSeries } from '../library/series-repository'
import { Tooltip } from '../../components/Tooltip'
import type { Status } from '../library/model'
import { ImportReadingStatus } from './ImportReadingStatus'
import { previewSeries } from './repository'
import { classifyUrl, extractUrls, groupWorks, type SeriesPreview } from './urls'

export type SeriesWorkSelection = { seriesId: number; works: SeriesPreview['works'] }

type Review = { preview?: SeriesPreview; selected: Set<number>; error?: string; skipped?: boolean; closed?: Set<number>; detailsSaved?: boolean }
export function SeriesImportReview({ text, savedIds, busy, onConfirm, onCancel, autoLoad = false, initialPreviews = [], initialReadingStatus = 'to_read', onReadingStatusChange, onBusyChange, showReadingStatus = true, confirmLabel = 'Import selected', cancelLabel = 'Back to links', allowEmpty = false }: {
 allowEmpty?: boolean
 showReadingStatus?: boolean; confirmLabel?: string; cancelLabel?: string
 onBusyChange?(busy: boolean): void
 initialReadingStatus?: Status; onReadingStatusChange?(status: Status): void
 text: string; autoLoad?: boolean; initialPreviews?: SeriesPreview[]; savedIds: Set<number>; busy: boolean
 onConfirm(works: SeriesPreview['works'], readingStatus: Status, seriesIds: number[], selections: SeriesWorkSelection[]): void; onCancel(): void
}) {
 const { refreshSeries } = useLibrary()
 const [readingStatus, setReadingStatus] = useState<Status>(initialReadingStatus)
 const series = useMemo(() => new Map(extractUrls(text).flatMap(url => {
  const result = classifyUrl(url)
  return result.kind === 'series' ? [[result.identity.seriesId, result.identity.normalizedUrl] as const] : []
 })), [text])
 const direct = groupWorks(extractUrls(text))
 const [reviews, setReviews] = useState<Record<number, Review>>(() => Object.fromEntries(initialPreviews.map(preview => [preview.seriesId, { preview, selected: new Set<number>() }])))
 const [loading, setLoading] = useState<number>()
 const selections: SeriesWorkSelection[] = [...series.keys()].filter(id => !reviews[id]?.skipped).map(id => ({
  seriesId: id,
  works: (reviews[id]?.preview?.works ?? []).filter(work => reviews[id].selected.has(work.workId) && !direct.has(work.workId) && !savedIds.has(work.workId)),
 }))
 const selected = new Map(selections.flatMap(selection => selection.works.map(work => [work.workId, work] as const)))
 const ready = [...series.keys()].every(id => reviews[id]?.preview || reviews[id]?.skipped)
 const load = useCallback(async (id: number, url: string) => {
  setLoading(id)
  setReviews(current => ({ ...current, [id]: { ...current[id], selected: new Set(), error: undefined, skipped: false } }))
  try {
   const preview = await previewSeries(url)
   setReviews(current => ({ ...current, [id]: { preview, selected: new Set() } }))
  } catch (error) { setReviews(current => ({ ...current, [id]: { selected: new Set(), error: error instanceof Error ? error.message : 'Could not preview series. Retry or skip it.' } })) }
  finally { setLoading(undefined) }
 }, [])
 const requested = useRef(new Set(initialPreviews.map(preview => preview.seriesId)))
 useEffect(() => {
  if (!autoLoad || series.size !== 1) return
  const [id, url] = [...series][0]
  if (!requested.current.has(id)) { requested.current.add(id); void load(id, url) }
 }, [autoLoad, series, load])
 useEffect(() => { onBusyChange?.(loading !== undefined); return () => onBusyChange?.(false) }, [loading, onBusyChange])
 async function saveDetails(id: number, url: string) {
  setLoading(id)
  setReviews(current => ({ ...current, [id]: { ...current[id], selected: current[id]?.selected ?? new Set(), error: undefined, skipped: false } }))
  try {
   const preview = reviews[id]?.preview ?? await previewSeries(url)
   await rememberSeries(preview)
   await refreshSeries(id)
   setReviews(current => ({ ...current, [id]: { ...current[id], preview, detailsSaved: true } }))
  } catch (error) {
   setReviews(current => ({ ...current, [id]: { ...current[id], error: error instanceof Error ? error.message : 'Could not save series details.' } }))
  } finally { setLoading(undefined) }
 }
 function select(id: number, ids: number[]) { setReviews(current => ({ ...current, [id]: { ...current[id], selected: new Set(ids) } })) }
 return <section className="story-form settings-card" aria-label="Review series imports">
  <h2>Choose works from series</h2>
  <p>{series.size} series detected · {direct.size} directly linked works included.</p>
  <p className="field-help">Only selected works are added to your library. Previews are temporary unless you choose to save full series details. Saving details includes information about unsaved works; it does not add them to your library. For extension previews, keep this page open and complete any AO3 sign-in in the requested tab.</p>
  {showReadingStatus && <><ImportReadingStatus value={readingStatus} disabled={busy} onChange={status => { setReadingStatus(status); onReadingStatusChange?.(status) }} />
  <p className="field-help">Applies to the reviewed series and all works imported from these links.</p></>}
  {[...series].map(([id, url]) => {
   const review = reviews[id]
   const preview = review?.preview
   const available = preview?.works.filter(work => !savedIds.has(work.workId) && !direct.has(work.workId)) ?? []
   const disabled = busy || loading !== undefined
   return <section className="settings-card series-import-preview" key={id} aria-label={preview?.title ?? `Series ${id}`}>
    <div className="series-import-heading"><h3>{preview ? <><a className="clickable-text" href={url} target="_blank" rel="noreferrer">{preview.title}</a> · </> : null}Series {id}</h3>{!review?.skipped && <Tooltip description={review?.detailsSaved ? 'Full series details saved' : 'Load and save full series details from AO3'}>{tooltipId => <button type="button" className="button secondary" aria-describedby={tooltipId} disabled={disabled || review?.detailsSaved} onClick={() => void saveDetails(id, url)}>{review?.detailsSaved ? 'Full series details saved' : 'Save'}</button>}</Tooltip>}</div>
    {preview?.description && <p className="story-summary">{preview.description}</p>}
    {review?.error && <p className="error-message" role="alert">{review.error}</p>}
    {review?.skipped ? <><p>Series skipped.</p><button className="text-button" disabled={disabled} onClick={() => void load(id, url)}>Review series</button></> : <>
     {!preview && <button className="button secondary" disabled={disabled} onClick={() => void load(id, url)}>{loading === id ? 'Loading series…' : review?.error ? 'Retry preview' : 'Load works'}</button>}
     {preview && <>
      <p>{preview.works.length} visible works · {available.filter(work => review.selected.has(work.workId)).length} selected. AO3 may hide unavailable or restricted works.</p>
      <div className="form-actions series-preview-controls"><button className="text-button clickable-text" disabled={disabled} onClick={() => select(id, available.map(work => work.workId))}>Select all</button><button className="text-button clickable-text" disabled={disabled} onClick={() => select(id, [])}>Clear selection</button><button className="text-button clickable-text" disabled={!preview.works.length} onClick={() => setReviews(current => ({ ...current, [id]: { ...current[id], closed: new Set() } }))}>View all</button><button className="text-button clickable-text" disabled={!preview.works.length} onClick={() => setReviews(current => ({ ...current, [id]: { ...current[id], closed: new Set(preview.works.map(work => work.workId)) } }))}>Hide all</button></div>
      {!preview.works.length && <p>No available works were found in this listing.</p>}
      {preview.works.map(work => {
       const saved = savedIds.has(work.workId), linked = direct.has(work.workId)
       return <div className="series-import-work" key={work.workId}>
        <div className="series-import-work-title"><label className="series-work-choice"><input type="checkbox" disabled={disabled || saved || linked} checked={saved || linked || review.selected.has(work.workId)} onChange={event => select(id, event.target.checked ? [...review.selected, work.workId] : [...review.selected].filter(value => value !== work.workId))} />{work.position ? `Part ${work.position}: ` : ''}{work.title}</label><Tooltip description="View on AO3">{tooltipId => <a className="clickable-text series-work-link" href={work.url} target="_blank" rel="noreferrer" aria-label={`View on AO3: ${work.title}`} aria-describedby={tooltipId}><ExternalLink size={18} aria-hidden="true" /></a>}</Tooltip></div>
        <p className="field-help">{work.authors.join(', ') || 'Unknown author'} · {work.fandoms?.join(' · ') || 'Fandom unknown'} · {work.wordCount === null ? 'Word count unknown' : `${work.wordCount.toLocaleString()} words`} · {work.chapters || 'Chapters unknown'} · {work.complete === null ? 'Completion unknown' : work.complete ? 'Complete' : 'In progress'}{saved ? ' · Already saved' : linked ? ' · Included via pasted work link' : ''}</p>
        <details open={!review.closed?.has(work.workId)} onToggle={event => {
         const open = event.currentTarget.open
         setReviews(current => {
          if (!!current[id].closed?.has(work.workId) === !open) return current
          const closed = new Set(current[id].closed)
          if (open) closed.delete(work.workId); else closed.add(work.workId)
          return { ...current, [id]: { ...current[id], closed } }
         })
        }}><summary>Summary and tags</summary><p className="story-summary">{work.summary || 'No summary provided.'}</p><p className="field-help">{work.tags.join(' · ') || 'No tags provided.'}</p></details>
       </div>
      })}
     </>}
     <button className="text-button clickable-text series-import-skip" disabled={disabled} onClick={() => setReviews(current => ({ ...current, [id]: { selected: new Set(), skipped: true } }))}>Skip series</button>
    </>}
   </section>
  })}
  <p className="field-help">Overlapping selections are imported once. Original series part numbers are preserved when work metadata loads.</p>
  <div className="form-actions"><button className="button primary" disabled={busy || loading !== undefined || !ready || !allowEmpty && direct.size + selected.size === 0} onClick={() => onConfirm([...selected.values()], readingStatus, [...series.keys()].filter(id => reviews[id]?.preview && !reviews[id]?.skipped), selections)}>{confirmLabel}</button><button className="button secondary" disabled={busy || loading !== undefined} onClick={onCancel}>{cancelLabel}</button></div>
 </section>
}
