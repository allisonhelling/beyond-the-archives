import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import type { Status } from '../library/model'
import { ImportReadingStatus } from './ImportReadingStatus'
import { previewSeries } from './repository'
import { classifyUrl, extractUrls, groupWorks, type SeriesPreview } from './urls'

type Review = { preview?: SeriesPreview; selected: Set<number>; error?: string; skipped?: boolean; closed?: Set<number> }
export function SeriesImportReview({ text, savedIds, busy, onConfirm, onCancel, autoLoad = false, initialPreviews = [], initialReadingStatus = 'to_read', onReadingStatusChange }: {
 initialReadingStatus?: Status; onReadingStatusChange?(status: Status): void
 text: string; autoLoad?: boolean; initialPreviews?: SeriesPreview[]; savedIds: Set<number>; busy: boolean
 onConfirm(works: SeriesPreview['works'], readingStatus: Status, seriesIds: number[]): void; onCancel(): void
}) {
 const [readingStatus, setReadingStatus] = useState<Status>(initialReadingStatus)
 const series = useMemo(() => new Map(extractUrls(text).flatMap(url => {
  const result = classifyUrl(url)
  return result.kind === 'series' ? [[result.identity.seriesId, result.identity.normalizedUrl] as const] : []
 })), [text])
 const direct = groupWorks(extractUrls(text))
 const [reviews, setReviews] = useState<Record<number, Review>>(() => Object.fromEntries(initialPreviews.map(preview => [preview.seriesId, { preview, selected: new Set<number>() }])))
 const [loading, setLoading] = useState<number>()
 const selected = new Map<number, SeriesPreview['works'][number]>()
 for (const review of Object.values(reviews)) if (!review.skipped) for (const work of review.preview?.works ?? []) {
  if (review.selected.has(work.workId) && !direct.has(work.workId) && !savedIds.has(work.workId)) selected.set(work.workId, work)
 }
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
 function select(id: number, ids: number[]) { setReviews(current => ({ ...current, [id]: { ...current[id], selected: new Set(ids) } })) }
 return <section className="story-form settings-card" aria-label="Review series imports">
  <h2>Choose works from series</h2>
  <p>{series.size} series detected · {direct.size} directly linked works included.</p>
  <p className="field-help">Only the selected works will be saved. Series notes and reading status are not copied. For extension previews, keep this page open and complete any AO3 sign-in in the requested tab.</p>
  <ImportReadingStatus value={readingStatus} disabled={busy} onChange={status => { setReadingStatus(status); onReadingStatusChange?.(status) }} />
  <p className="field-help">Applies to the reviewed series and all works imported from these links.</p>
  {[...series].map(([id, url]) => {
   const review = reviews[id]
   const preview = review?.preview
   const available = preview?.works.filter(work => !savedIds.has(work.workId) && !direct.has(work.workId)) ?? []
   const disabled = busy || loading !== undefined
   return <section className="settings-card series-import-preview" key={id} aria-label={preview?.title ?? `Series ${id}`}>
    <h3>{preview ? <><a className="clickable-text" href={url} target="_blank" rel="noreferrer">{preview.title}</a> · </> : null}Series {id}</h3>
    {preview?.description && <p className="story-summary">{preview.description}</p>}
    {review?.error && <p className="error-message" role="alert">{review.error}</p>}
    {review?.skipped ? <><p>Series skipped.</p><button className="text-button" disabled={disabled} onClick={() => void load(id, url)}>Review series</button></> : <>
     {!preview && <button className="button secondary" disabled={disabled} onClick={() => void load(id, url)}>{loading === id ? 'Loading series…' : review?.error ? 'Retry preview' : 'Load works'}</button>}
     {preview && <>
      <p>{preview.works.length} visible works · {available.filter(work => review.selected.has(work.workId)).length} selected. AO3 may hide unavailable or restricted works.</p>
      <div className="form-actions"><button className="text-button clickable-text" disabled={disabled} onClick={() => select(id, available.map(work => work.workId))}>Select all</button><button className="text-button clickable-text" disabled={disabled} onClick={() => select(id, [])}>Clear selection</button></div>
      <div className="form-actions series-summary-controls"><button className="text-button clickable-text" disabled={!preview.works.length} onClick={() => setReviews(current => ({ ...current, [id]: { ...current[id], closed: new Set() } }))}>View all</button><button className="text-button clickable-text" disabled={!preview.works.length} onClick={() => setReviews(current => ({ ...current, [id]: { ...current[id], closed: new Set(preview.works.map(work => work.workId)) } }))}>Hide all</button></div>
      {!preview.works.length && <p>No available works were found in this listing.</p>}
      {preview.works.map(work => {
       const saved = savedIds.has(work.workId), linked = direct.has(work.workId)
       return <div className="series-import-work" key={work.workId}>
        <div className="series-import-work-title"><label className="series-work-choice"><input type="checkbox" disabled={disabled || saved || linked} checked={saved || linked || review.selected.has(work.workId)} onChange={event => select(id, event.target.checked ? [...review.selected, work.workId] : [...review.selected].filter(value => value !== work.workId))} />{work.position ? `Part ${work.position}: ` : ''}{work.title}</label><Tooltip description="View on AO3">{tooltipId => <a className="clickable-text series-work-link" href={work.url} target="_blank" rel="noreferrer" aria-label={`View on AO3: ${work.title}`} aria-describedby={tooltipId}><ExternalLink size={18} aria-hidden="true" /></a>}</Tooltip></div>
        <p className="field-help">{work.authors.join(', ') || 'Unknown author'} · {work.wordCount === null ? 'Word count unknown' : `${work.wordCount.toLocaleString()} words`} · {work.chapters || 'Chapters unknown'} · {work.complete === null ? 'Completion unknown' : work.complete ? 'Complete' : 'In progress'}{saved ? ' · Already saved' : linked ? ' · Included via pasted work link' : ''}</p>
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
  <div className="form-actions"><button className="button primary" disabled={busy || loading !== undefined || !ready || direct.size + selected.size === 0} onClick={() => onConfirm([...selected.values()], readingStatus, [...series.keys()].filter(id => reviews[id]?.preview && !reviews[id]?.skipped))}>Import selected</button><button className="button secondary" disabled={busy || loading !== undefined} onClick={onCancel}>Back to links</button></div>
 </section>
}
