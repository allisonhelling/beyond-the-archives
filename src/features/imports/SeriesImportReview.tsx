import { Dialog } from '../../components/Dialog'
import { Pagination } from '../library/browsing/Pagination'
import { WorkSummary } from '../library/summaries/WorkSummary'
import { Fragment, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useLibrary } from '../library/LibraryProvider'
import { rememberSeries } from '../library/series/series-repository'
import { Tooltip } from '../../components/Tooltip'
import type { Status } from '../library/model'
import { ImportReadingStatus } from './ImportReadingStatus'
import { previewSeries } from './repository'
import { classifyUrl, extractUrls, groupWorks, type SeriesPreview } from './urls'

export type SeriesWorkSelection = { seriesId: number; works: SeriesPreview['works'] }

type Review = { preview?: SeriesPreview; selected: Set<number>; error?: string; closed?: Partial<Record<'summary' | 'tags', Set<number>>>; detailsSaved?: boolean }
const reviewPageSize = 30

function SeriesScopeAction({ label, scope, disabled, expanded, onClick }: { label: string; scope: string; disabled?: boolean; expanded?: boolean; onClick(): void }) {
 return <Tooltip portal description={`Applies to ${scope}`}>{id => <button type="button" className="text-button clickable-text" aria-describedby={id} aria-expanded={expanded} disabled={disabled} onClick={onClick}>{label}</button>}</Tooltip>
}

export function SeriesImportReview({ text, savedIds: suppliedSavedIds, busy: externalBusy, onConfirm, onCancel, initialPreviews = [], initialReadingStatus = 'to_read', onReadingStatusChange, onBusyChange, showReadingStatus = true, fitActions = false, confirmLabel = 'Import Selected', cancelLabel = 'Cancel', allowEmpty = false, automatic = false, embedded = false, singleSeries = false, error = '', previewCache, onPreview, bookmarkedSeriesIds, bookmarkGroupingUnavailable = false, relatedSeriesLabel = 'Series Containing Bookmarked Works' }: {
 bookmarkGroupingUnavailable?: boolean; relatedSeriesLabel?: string
 bookmarkedSeriesIds?: ReadonlySet<number>
 previewCache?: ReadonlyMap<number, SeriesPreview>; onPreview?(preview: SeriesPreview): void
 embedded?: boolean; singleSeries?: boolean; error?: string
 automatic?: boolean
 allowEmpty?: boolean
 showReadingStatus?: boolean; fitActions?: boolean; confirmLabel?: string; cancelLabel?: string
 onBusyChange?(busy: boolean): void
 initialReadingStatus?: Status; onReadingStatusChange?(status: Status): void
 text: string; initialPreviews?: SeriesPreview[]; savedIds: Set<number>; busy: boolean
 onConfirm(works: SeriesPreview['works'], readingStatus: Status, seriesIds: number[], selections: SeriesWorkSelection[]): void; onCancel(): void
}) {
 const { refreshSeries, stories = [], catalogLoaded } = useLibrary({ catalog: true })
 const busy = externalBusy || catalogLoaded === false
 const savedIds = new Set([...suppliedSavedIds, ...stories.flatMap(story => story.work.ao3_work_id ? [Number(story.work.ao3_work_id)] : [])])
 const [readingStatus, setReadingStatus] = useState<Status>(initialReadingStatus)
 const series = useMemo(() => {
  const entries = new Map(extractUrls(text).flatMap(url => {
   const result = classifyUrl(url)
   return result.kind === 'series' ? [[result.identity.seriesId, result.identity.normalizedUrl] as const] : []
  }))
  return bookmarkedSeriesIds ? new Map([...entries].sort(([a], [b]) => Number(bookmarkedSeriesIds.has(b)) - Number(bookmarkedSeriesIds.has(a)))) : entries
 }, [text, bookmarkedSeriesIds])
 const direct = groupWorks(extractUrls(text))
 const [reviews, setReviews] = useState<Record<number, Review>>(() => Object.fromEntries([...initialPreviews, ...(previewCache?.values() ?? [])].map(preview => [preview.seriesId, { preview, selected: new Set<number>() }])))
 const [loading, setLoading] = useState<number>()
 const [savingAll, setSavingAll] = useState(false)
 const [page, setPage] = useState(1)
 const [shownSeries, setShownSeries] = useState<Set<number>>(() => new Set())
 const contentRef = useRef<HTMLElement>(null)
 const saveDescription = 'Load and save full series details from AO3'
 const selections: SeriesWorkSelection[] = [...series.keys()].map(id => ({
  seriesId: id,
  works: (reviews[id]?.preview?.works ?? []).filter(work => (automatic || reviews[id].selected.has(work.workId)) && !direct.has(work.workId) && !savedIds.has(work.workId)),
 }))
 const selected = new Map(selections.flatMap(selection => selection.works.map(work => [work.workId, work] as const)))
 const automaticStarted = useRef(false)
 const ready = [...series.keys()].every(id => reviews[id]?.preview)
 const canConfirm = allowEmpty || direct.size + selected.size > 0
 const load = useCallback(async (id: number, url: string) => {
  setLoading(id)
  setReviews(current => ({ ...current, [id]: { ...current[id], selected: new Set(), error: undefined } }))
  try {
   const preview = await previewSeries(url)
   onPreview?.(preview)
   setReviews(current => ({ ...current, [id]: { preview, selected: new Set() } }))
  } catch (error) { setReviews(current => ({ ...current, [id]: { selected: new Set(), error: error instanceof Error ? error.message : 'Could not preview series. Please retry.' } })) }
  finally { setLoading(undefined) }
 }, [onPreview])
 const requested = useRef(new Set([...initialPreviews.map(preview => preview.seriesId), ...(previewCache?.keys() ?? [])]))
 useEffect(() => {
  if (loading !== undefined || savingAll) return
  const next = [...series].find(([id]) => !requested.current.has(id))
  if (next) { const [id, url] = next; requested.current.add(id); void load(id, url) }
 }, [series, load, loading, savingAll, reviews])
 useEffect(() => { onBusyChange?.(loading !== undefined || savingAll); return () => onBusyChange?.(false) }, [loading, savingAll, onBusyChange])
 function confirmImport() { onConfirm([...selected.values()], readingStatus, [...series.keys()].filter(id => reviews[id]?.preview), selections) }
 const confirmAutomatic = useEffectEvent(() => confirmImport())
 useEffect(() => {
  if (automatic && ready && canConfirm && loading === undefined && !savingAll && !busy && !automaticStarted.current) { automaticStarted.current = true; confirmAutomatic() }
 }, [automatic, ready, canConfirm, loading, savingAll, busy])
 async function saveDetails(id: number, url: string) {
  setLoading(id)
  setReviews(current => ({ ...current, [id]: { ...current[id], selected: current[id]?.selected ?? new Set(), error: undefined } }))
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
  setReviews(current => Object.fromEntries(Object.entries(current).map(([id, review]) => [id, { ...review, selected: new Set(!selected ? [] : review.preview?.works.filter(work => !savedIds.has(work.workId) && !direct.has(work.workId)).map(work => work.workId) ?? []) }])))
 }
 async function saveAllDetails() {
  setSavingAll(true)
  try { for (const [id, url] of series) if (!reviews[id]?.detailsSaved) await saveDetails(id, url) }
  finally { setSavingAll(false) }
 }
 function select(id: number, ids: number[]) { setReviews(current => ({ ...current, [id]: { ...current[id], selected: new Set(ids) } })) }
 const title = automatic ? 'Import All Series Works' : 'Choose Works From Series'
 const disabled = busy || loading !== undefined || savingAll
 const reviewPages: { series: Map<number, { url: string; works: SeriesPreview['works'] }>; count: number }[] = [{ series: new Map(), count: 0 }]
 for (const [id, url] of series) {
  const works = reviews[id]?.preview?.works ?? []
  const count = Math.max(1, works.length)
  let target = reviewPages[reviewPages.length - 1]
  const remaining = Math.max(0, reviewPageSize - target.count)
  // Keep the whole series on the side with more works; ties stay on the earlier page.
  if (target.count && count > remaining && remaining < count - remaining) {
   target = { series: new Map(), count: 0 }
   reviewPages.push(target)
  }
  target.series.set(id, { url, works })
  target.count += count
 }
 const pages = reviewPages.length, currentPage = Math.min(page, pages)
 const visible = reviewPages[currentPage - 1].series
 const total = reviewPages.reduce((sum, item) => sum + item.count, 0)
 const start = reviewPages.slice(0, currentPage - 1).reduce((sum, item) => sum + item.count, 0) + 1
 const pagination = pages > 1 && <Pagination inlinePage page={currentPage} pages={pages} total={total} size={reviewPageSize} range={{ start, end: start + reviewPages[currentPage - 1].count - 1 }} itemLabel="review entries" onPage={next => {
  setPage(next)
  const dialog = contentRef.current?.closest('dialog')
  if (dialog) dialog.scrollTo?.({ top: 0 })
  else contentRef.current?.scrollIntoView?.({ block: 'start' })
 }} />
 const content = <section ref={contentRef} className="story-form series-import-review" aria-label="Review Series Imports">
  {embedded && <h2>{title}</h2>}
  {bookmarkGroupingUnavailable && <p className="field-help" role="status">This scan did not retain which series were explicitly bookmarked, so bookmark groups cannot be separated. Update the companion extension and start a new scan to enable grouping. Library membership does not determine whether a series was bookmarked.</p>}
  {error && <p role="alert" className="error-message">{error}</p>}
  {automatic && ready && !canConfirm && <p role="status">No new available series works to import. Already saved works are kept.</p>}
  {!singleSeries && <p>{series.size} series detected · {direct.size} directly linked works included.</p>}
  <p className="field-help">{automatic ? 'All available series works are included automatically.' : 'Only selected works are added to your library.'}{!singleSeries && ' Previews are temporary unless you choose to save full series details. Saving details includes information about unsaved works; it does not add them to your library.'} For extension previews, keep this page open and complete any AO3 sign-in in the separate series preview window.</p>
  {showReadingStatus && <><ImportReadingStatus value={readingStatus} disabled={disabled} onChange={status => { setReadingStatus(status); onReadingStatusChange?.(status) }} />
  <p className="field-help">Applies to the reviewed series and all works imported from these links.</p></>}
  {!singleSeries && <div className="form-actions series-preview-controls" role="group" aria-label="All Series Top Controls">
   <SeriesScopeAction label="Select All" scope="all series" disabled={disabled || automatic} onClick={() => setAllSelected(true)} />
   <SeriesScopeAction label="Clear Selection" scope="all series" disabled={disabled || automatic} onClick={() => setAllSelected(false)} />
   <SeriesScopeAction label="View All" scope="all series" disabled={disabled} onClick={() => setVisibility(true)} />
   <SeriesScopeAction label="Hide All" scope="all series" disabled={disabled} onClick={() => setVisibility(false)} />
  </div>}
  {pagination}
  {[...visible].map(([id, { url, works: visibleWorks }], index, entries) => {
   const review = reviews[id]
   const preview = review?.preview
   const seriesLabel = preview?.title ? `${preview.title} • Series ${id}` : `Series ${id}`
   const available = preview?.works.filter(work => !savedIds.has(work.workId) && !direct.has(work.workId)) ?? []
   const inLibrary = preview?.works.filter(work => savedIds.has(work.workId)).length ?? 0
   const expanded = Boolean(preview?.works.length && preview.works.every(work => !review.closed?.summary?.has(work.workId) && !review.closed?.tags?.has(work.workId)))
   const scope = preview?.title || `Series ${id}`
   const selectionControls = preview && !automatic && <>
    <SeriesScopeAction label="Select All" scope={scope} disabled={disabled} onClick={() => select(id, available.map(work => work.workId))} />
    <SeriesScopeAction label="Clear Selection" scope={scope} disabled={disabled} onClick={() => select(id, [])} />
    <SeriesScopeAction label={expanded ? 'Hide All' : 'View All'} scope={scope} disabled={!preview.works.length} expanded={expanded} onClick={() => setVisibility(!expanded, id)} />
   </>
   const saveControl = !singleSeries && <Tooltip description={review?.detailsSaved ? 'Full Series Details Saved' : saveDescription}>{tooltipId => <button type="button" className="button secondary" aria-describedby={tooltipId} disabled={disabled || !preview || review?.detailsSaved} onClick={() => void saveDetails(id, url)}>{review?.detailsSaved ? 'Full Series Details Saved' : 'Save'}</button>}</Tooltip>
   const worksToggle = !!preview?.works.length && <button type="button" className="text-button clickable-text" aria-expanded={shownSeries.has(id)} onClick={() => setShownSeries(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
   })}>{shownSeries.has(id) ? 'Hide Series Works' : 'Show Series Works'}</button>
   const groupStart = bookmarkedSeriesIds && (index === 0 || bookmarkedSeriesIds.has(entries[index - 1][0]) !== bookmarkedSeriesIds.has(id))
   return <Fragment key={id}>{groupStart && <h2>{bookmarkedSeriesIds.has(id) ? 'Bookmarked Series' : relatedSeriesLabel}</h2>}<section className="series-import-preview" aria-label={seriesLabel}>
    <div className="series-import-heading"><h3><a className="clickable-text" href={url} target="_blank" rel="noreferrer">{seriesLabel}</a></h3>{saveControl}</div>
    {preview?.description && <p className="story-summary">{preview.description}</p>}
    {review?.error && <p className="error-message" role="alert">{review.error}</p>}
    {!preview && (review?.error ? <button className="button secondary" disabled={disabled} onClick={() => void load(id, url)}>Retry Preview</button> : <p role="status">{loading === id ? 'Loading Series…' : 'Waiting to load series…'}</p>)}
    {preview && <>
     <p>{preview.works.length} visible works · {inLibrary} in library · {automatic ? available.length : available.filter(work => review.selected.has(work.workId)).length} selected. AO3 may hide unavailable or restricted works.</p>
     <div className="form-actions series-preview-controls" role="group" aria-label="Series Selection Controls">{worksToggle}{selectionControls}</div>
     {!preview.works.length && <p>No available works were found in this listing.</p>}
     {shownSeries.has(id) && visibleWorks.map(work => {
      const saved = savedIds.has(work.workId), linked = direct.has(work.workId)
      const choiceDisabled = automatic || disabled || saved || linked
      return <div className="series-import-work" key={work.workId}>
       <div className="series-import-work-title"><label className="check-label series-work-choice" aria-disabled={choiceDisabled}><input type="checkbox" disabled={choiceDisabled} checked={automatic || saved || linked || review.selected.has(work.workId)} onChange={event => select(id, event.target.checked ? [...review.selected, work.workId] : [...review.selected].filter(value => value !== work.workId))} />{work.position ? `Part ${work.position}: ` : ''}{work.title}</label><Tooltip description="View on AO3">{tooltipId => <a className="clickable-text series-work-link" href={work.url} target="_blank" rel="noreferrer" aria-label={`View on AO3: ${work.title}`} aria-describedby={tooltipId}><ExternalLink size={18} aria-hidden="true" /></a>}</Tooltip></div>
       <p className="field-help">{work.authors.join(', ') || 'Unknown author'} · {work.fandoms?.join(' · ') || 'Fandom unknown'} · {work.wordCount === null ? 'Word count unknown' : `${work.wordCount.toLocaleString()} words`} · {work.chapters || 'Chapters unknown'} · {work.complete === null ? 'Completion unknown' : work.complete ? 'Complete' : 'In progress'}{saved ? ' · Already saved' : linked ? ' · Included via pasted work link' : ''}</p>
       <details open={!review.closed?.summary?.has(work.workId)} onToggle={event => toggleSection(id, work.workId, 'summary', event.currentTarget.open)}><summary>Summary</summary><div className="story-summary"><WorkSummary metadata={work} fallback="No summary provided." /></div></details>
       <details open={!review.closed?.tags?.has(work.workId)} onToggle={event => toggleSection(id, work.workId, 'tags', event.currentTarget.open)}><summary>Tags</summary><p className="field-help">{work.tags.join(' · ') || 'No tags provided.'}</p></details>
      </div>
     })}
    </>}
    {shownSeries.has(id) && <div className="form-actions series-preview-controls" role="group" aria-label="Series Footer Controls">{saveControl}{worksToggle}{selectionControls}</div>}
   </section></Fragment>
  })}
  {pagination}
  <p className="field-help">Selections and bulk actions apply across all pages. Overlapping selections are imported once. Original series part numbers are preserved when work metadata loads.</p>
  {!singleSeries && <div className="form-actions series-preview-controls" aria-label="All Series Controls">
   <Tooltip portal description={saveDescription}>{id => <button type="button" className="button secondary" aria-describedby={id} disabled={disabled || !ready || [...series.keys()].every(id => reviews[id]?.detailsSaved)} onClick={() => void saveAllDetails()}>Save All Series</button>}</Tooltip>
   <SeriesScopeAction label="Hide All" scope="all series" disabled={disabled} onClick={() => setVisibility(false)} />
   <SeriesScopeAction label="Select All" scope="all series" disabled={disabled || automatic} onClick={() => setAllSelected(true)} />
  </div>}
  <div className={`form-actions${fitActions ? ' form-actions-fit' : ''}`}><button className="button primary" disabled={disabled || !ready || !canConfirm} onClick={confirmImport}>{automatic ? 'Retry Importing All Series Works' : confirmLabel}</button><button className="button secondary" disabled={disabled} onClick={onCancel}>{cancelLabel}</button></div>
 </section>
 return embedded ? content : <Dialog title={title} className="series-review-dialog" busy={disabled} onClose={onCancel}>{content}</Dialog>
}
