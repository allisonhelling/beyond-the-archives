import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useActivity } from '../../../lib/use-activity'
import { useLayout } from '../../../lib/use-layout'
import { sampleMode } from '../../../lib/sample-mode'
import { Tooltip } from '../../../components/Tooltip'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { useLibrary } from '../LibraryProvider'
import { type Collection, type Story } from '../model'
import { collectionSortKey } from '../browsing/browsing'
import { librarySeries, seriesReadingStatus } from '../series/series'
import { seriesSearchStory } from '../series/series-search'
import { reorderCollections } from '../repository'
import { automaticCollectionLabels } from './automatic-collections'
import { useCollectionDeletion } from './useCollectionDeletion'
import { CollectionVisibilityDialog } from './CollectionVisibility'
import { collectionOrderOptions, orderCollections, moveCollectionIds, type CollectionOrder, type CollectionAppearance } from './collection-appearance'
import { collectionStories, distinctCollectionWorks } from './collection-scope'
import { CollectionShelf } from './CollectionShelf'
import { CollectionMembershipDialog } from './CollectionMembershipDialog'
import { NewCollectionDialog } from './NewCollectionDialog'

const shelves = [['all', 'All Works'], ['currently_reading', 'Currently Reading'], ['paused_reading', 'Paused Reading'], ['to_read', 'To Read'], ['finished', 'Finished'], ['did_not_finish', 'Did Not Finish'], ['series', 'Series'],['recs', 'Recs'], ['favorites', 'Favorites'],] as const
const collectionControlHelp = 'Command-click (Mac) or Control-click (Windows) a collection to edit it directly, or edit the group when multiple collections are selected.\nSelect collections, then click or tap books to select or deselect.\nShift + click or drag: select a range.\nStart Shift-drag on a selected book to deselect a range.\nRelease Shift. Drag a selected book: move the selected group.\nAlt + Left/Right Arrow: move a book or group.\nEscape: cancel dragging; otherwise leave selection, then leave editing.\nDelete or Backspace: delete selected collections; non-empty collections ask for confirmation.\nEdit selected: change appearance or delete. Cancel selection: clear the selection.'

type CollectionSort = { hideEmpty: boolean; shelfOrder?: string[]; automaticOrder: string[]; order: CollectionOrder; hiddenAutomatic: string[]; hiddenCustom: string[] }
function initialCollectionSort(): CollectionSort {
  try {
    const saved = JSON.parse(window.localStorage.getItem(collectionSortKey) ?? 'null')
    return { hideEmpty: saved?.hideEmpty === true, shelfOrder: Array.isArray(saved?.shelfOrder) ? saved.shelfOrder.filter((id: unknown): id is string => typeof id === 'string') : undefined, automaticOrder: [...new Set<string>([...(Array.isArray(saved?.automaticOrder) ? saved.automaticOrder.filter((id: unknown): id is string => shelves.some(([key]) => key === id)) : []), ...shelves.map(([id]) => id)])], order: collectionOrderOptions.find(option => option.value === saved?.order)?.value ?? 'created_newest', hiddenAutomatic: shelves.map(([id]) => id).filter(id => Array.isArray(saved?.hiddenAutomatic) && saved.hiddenAutomatic.includes(id)), hiddenCustom: Array.isArray(saved?.hiddenCustom) ? saved.hiddenCustom.filter((id: unknown): id is string => typeof id === 'string') : [] }
  } catch { /* Sorting still works when browser storage is unavailable. */ }
  return { hideEmpty: false, automaticOrder: shelves.map(([id]) => id), order: 'created_newest', hiddenAutomatic: [], hiddenCustom: [] }
}

export function CollectionBrowser({ children, title = 'Your Library', countStories, readOnly = false, compactHeader = false }: { compactHeader?: boolean; title?: string; countStories?: Story[] | null; readOnly?: boolean; children: (controls: { selected: string; editingCollections: boolean; renderHeader: (actions: ReactNode, count?: number, selectShelf?: (id: string) => void) => ReactNode; shelfStories: Story[]; shelfSeries: ReturnType<typeof librarySeries> }) => ReactNode }) {
  const layout = useLayout()
  const { stories, collections, series: seriesRecords, navigation, navigationError, navigationLoading, revisionError, retryCounts, refreshCollections: refresh } = useLibrary()
  const [params, setParams] = useSearchParams()
  const selected = params.get('shelf') ?? 'all'
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useActivity(Boolean(busy), 'Updating your library…')
  const [collectionSort, setCollectionSort] = useState(initialCollectionSort)
  useEffect(() => {
    try { window.localStorage.setItem(collectionSortKey, JSON.stringify(collectionSort)) }
    catch { /* Keep the current sort when browser storage is unavailable. */ }
  }, [collectionSort])
  const countedWorks = useMemo(() => distinctCollectionWorks(countStories ?? []), [countStories])
  const [viewHidden, setViewHidden] = useState(false)
  const [visibilityTarget, setVisibilityTarget] = useState<{ id: string; name: string; hidden: boolean } | null>(null)
  const visibilityTrigger = useRef<HTMLElement | null>(null)
  const [editingCollections, setEditingCollections] = useState(false)
  const [selectingCollections, setSelectingCollections] = useState(false)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([])
  const [bulkCollections, setBulkCollections] = useState<Collection[] | null>(null)
  const selectionAnchor = useRef<string | null>(null)
  function clearCollectionSelection() { setSelectingCollections(false); setSelectedCollectionIds([]); selectionAnchor.current = null }
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [addingToCollection, setAddingToCollection] = useState<Collection | null>(null)
  const addStoriesTrigger = useRef<HTMLButtonElement>(null)
  const editTrigger = useRef<HTMLElement | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (!editingCollection && editTrigger.current) { (editTrigger.current.isConnected ? editTrigger.current : editButton.current)?.focus(); editTrigger.current = null } }, [editingCollection])
  useEffect(() => {
    if (!editingCollections || editingCollection || bulkCollections || addingToCollection || visibilityTarget) return
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return
      if (event.target instanceof Element && event.target.closest('dialog, [role="dialog"], .custom-dropdown')) return
      event.preventDefault()
      clearCollectionSelection()
      if (!selectingCollections) { setEditingCollections(false); setViewHidden(false) }
      editButton.current?.focus()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [editingCollections, selectingCollections, editingCollection, bulkCollections, addingToCollection, visibilityTarget])
  const customCollections = collections.filter(item => !item.default_key)
  const selectedCollections = customCollections.filter(item => selectedCollectionIds.includes(item.id))
  const collectionDeletion = useCollectionDeletion(selectedCollections, true, () => {
    if (selectedCollectionIds.includes(selected)) setParams({ shelf: 'all' })
    clearCollectionSelection(); editButton.current?.focus()
  })
  const deleteSelectedCollections = useEffectEvent(() => { void collectionDeletion.requestDelete() })
  useEffect(() => {
    if (!editingCollections || !selectedCollectionIds.length || busy || collectionDeletion.busy || editingCollection || bulkCollections || addingToCollection || visibilityTarget || collectionDeletion.confirming) return
    function removeSelected(event: KeyboardEvent) {
      if (!['Delete', 'Backspace'].includes(event.key) || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], .custom-dropdown')) return
      event.preventDefault()
      deleteSelectedCollections()
    }
    window.addEventListener('keydown', removeSelected)
    return () => window.removeEventListener('keydown', removeSelected)
  }, [editingCollections, selectedCollectionIds.length, busy, collectionDeletion.busy, collectionDeletion.confirming, editingCollection, bulkCollections, addingToCollection, visibilityTarget])

  // Display sorts never change the saved manual positions.
  const displayedCollections = orderCollections(customCollections, [...(sampleMode ? stories : Object.entries(navigation).map(([id, stats]) => ({ collectionIds: [id], updated_at: stats.updated_at ?? '' }))), ...(seriesRecords ?? []).map(series => ({ collectionIds: series.collectionIds ?? [], updated_at: series.updated_at }))], collectionSort.order)
  function toggleCollectionEditing() {
    if (!editingCollections) setCollectionSort(previous => ({ ...previous, order: 'manual' }))
    setEditingCollections(!editingCollections); setViewHidden(false)
    clearCollectionSelection()
  }
  function requestVisibility(id: string, name: string) {
    visibilityTrigger.current = document.activeElement as HTMLElement
    setVisibilityTarget({ id, name, hidden: [...collectionSort.hiddenAutomatic, ...collectionSort.hiddenCustom].includes(id) })
  }
  function closeVisibility() {
    setVisibilityTarget(null)
  }
  useEffect(() => {
    if (visibilityTarget || !visibilityTrigger.current) return
    const trigger = visibilityTrigger.current
    if (trigger?.isConnected) trigger.focus()
    else editButton.current?.focus()
    visibilityTrigger.current = null
  }, [visibilityTarget])
  function setCollectionHidden(id: string, hidden: boolean) {
    clearCollectionSelection()
    const automatic = shelves.some(([key]) => key === id)
    const field = automatic ? 'hiddenAutomatic' : 'hiddenCustom'
    setCollectionSort(previous => ({ ...previous, [field]: hidden ? [...new Set([...previous[field], id])] : previous[field].filter(key => key !== id) }))
    if (hidden && selected === id) setParams({ shelf: 'all' })
  }
  function changeEditedCollectionVisibility() {
    if (!editingCollection) return
    if (collectionSort.hiddenCustom.includes(editingCollection.id)) {
      setCollectionHidden(editingCollection.id, false)
      setEditingCollection(null)
    } else requestVisibility(editingCollection.id, editingCollection.name)
  }
  function editCollection(id: string, appearance: CollectionAppearance, shiftKey: boolean, direct = false) {
    const item = customCollections.find(item => item.id === id)
    if (!item) return
    if (direct && selectedCollections.length > 1) { setBulkCollections(selectedCollections); return }
    if (!direct && (shiftKey || selectingCollections)) {
      if (!editingCollections) { setEditingCollections(true); setCollectionSort(previous => ({ ...previous, order: 'manual' })) }
      setSelectingCollections(true)
      const anchor = selectionAnchor.current
      setSelectedCollectionIds(previous => {
        if (shiftKey && anchor && anchor !== id) {
          const ids = displayedCollections.filter(item => viewHidden || !collectionSort.hiddenCustom.includes(item.id)).map(item => item.id), from = ids.indexOf(anchor), to = ids.indexOf(id)
          if (from >= 0 && to >= 0) return [...new Set([...previous, ...ids.slice(Math.min(from, to), Math.max(from, to) + 1)])]
        }
        return previous.includes(id) ? previous.filter(selectedId => selectedId !== id) : [...previous, id]
      })
      selectionAnchor.current = id
      return
    }
    editTrigger.current = document.activeElement as HTMLElement
    setEditingCollection({ ...item, ...appearance })
  }
  async function moveCollection(id: string, targetId: string) {
    const ordered = moveCollectionIds(shelfItems.map(item => item.id), id, targetId, selectedCollectionIds)
    const customIds = ordered.filter(key => customCollections.some(item => item.id === key))
    await collectionAction(() => reorderCollections(customIds))
    setCollectionSort(previous => ({ ...previous, shelfOrder: ordered, automaticOrder: ordered.filter(key => shelves.some(([id]) => id === key)) }))
  }
  async function collectionAction(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); await refresh() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const collectionsById = useMemo(() => new Map(collections.map(collection => [collection.id, collection])), [collections])
  const collection = collectionsById.get(selected)
  function storiesForShelf(key: string) {
    return collectionsById.has(key) || ['currently_reading', 'paused_reading', 'complete', 'new', 'waiting', 'to_read', 'finished', 'did_not_finish', 'favorites', 'recs'].includes(key) ? collectionStories(stories, key) : stories
  }
  const series = useMemo(() => librarySeries(stories, seriesRecords ?? []), [stories, seriesRecords])
  const seriesByShelf = useMemo(() => {
    const index = new Map<string, typeof series>([['series', series], ['all', series]])
    function add(key: string, item: typeof series[number]) { const values = index.get(key) ?? []; values.push(item); index.set(key, values) }
    for (const item of series) {
      if (item.record?.is_favorite) add('favorites', item)
      if (item.record?.is_rec) add('recs', item)
      const status = seriesReadingStatus(item)
      if (status === 'reading') add('currently_reading', item)
      if (['paused_reading', 'to_read', 'finished', 'did_not_finish'].includes(status)) add(status, item)
      for (const id of new Set(item.record?.collectionIds ?? [])) add(id, item)
    }
    return index
  }, [series])
  function seriesForShelf(key: string) { return seriesByShelf.get(key) ?? [] }
  const shelfSeries = seriesForShelf(selected)
  const shelfStories = selected === 'series' ? shelfSeries.map(seriesSearchStory) : [...storiesForShelf(selected), ...shelfSeries.map(seriesSearchStory)]
  const shelfItems = [...[...shelves].sort((a, b) => collectionSort.automaticOrder.indexOf(a[0]) - collectionSort.automaticOrder.indexOf(b[0])).map(([id, name]) => ({ id, name, hidden: collectionSort.hiddenAutomatic.includes(id) })), ...displayedCollections.map(item => ({ ...item, hidden: collectionSort.hiddenCustom.includes(item.id) }))]
    .sort((a, b) => {
      if (collectionSort.order !== 'manual' || !collectionSort.shelfOrder) return 0
      const rank = (id: string) => { const index = collectionSort.shelfOrder!.indexOf(id); return index < 0 ? Infinity : index }
      return rank(a.id) - rank(b.id)
    })
    .map(item => {
      if (countStories !== undefined) {
        const count = countStories === null ? undefined : collectionStories(countedWorks, item.id).length
        return { ...item, count, countLabel: count === undefined ? 'Loading cloud EPUB count.' : `${count} ${count === 1 ? 'work' : 'works'} available as cloud EPUBs` }
      }
      const works = item.id === 'series' ? 0 : sampleMode ? storiesForShelf(item.id).length : navigation[item.id]?.works ?? 0, seriesCount = item.id === 'series' || params.get('showSeries') === 'true' ? sampleMode ? seriesForShelf(item.id).length : navigation[item.id]?.series ?? 0 : 0
      return { ...item, count: !sampleMode && !navigation[item.id] ? undefined : works + seriesCount, countLabel: !sampleMode && !navigation[item.id] ? 'Loading collection count.' : seriesCount ? works ? `${works} ${works === 1 ? 'story' : 'stories'} and ${seriesCount} series` : `${seriesCount} series` : undefined }
    })

  const addStoriesAction = !readOnly && !editingCollections && collection && !collection.default_key && !collection.automatic_rules && <Tooltip description="Add Stories to Collection">{id => <button ref={addStoriesTrigger} type="button" className="button secondary button-small" aria-describedby={id} onClick={() => setAddingToCollection(collection)}>Add Story</button>}</Tooltip>
  const hiddenButton = (descriptionId?: string) => <button aria-describedby={descriptionId} type="button" className="button secondary collection-hidden" aria-pressed={viewHidden} onClick={() => { clearCollectionSelection(); setViewHidden(!viewHidden) }}>{viewHidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}Hidden</button>
  const renderHeader = (actions: ReactNode, _total: number | undefined, selectShelf: (id: string) => void = id => setParams({ shelf: id })) => <><div className={`page-heading library-heading${compactHeader ? ' collection-heading-compact' : ''}`}><div><div className={`library-title-row${editingCollections ? ' library-editing' : ''}`}><h1>{title}</h1>
    <div className="library-heading-actions">
      <button type="button" className="button secondary collection-hide-empty" aria-pressed={collectionSort.hideEmpty} onClick={() => setCollectionSort(previous => ({ ...previous, hideEmpty: !previous.hideEmpty }))}>Hide Empty</button>
    {editingCollections && <div className="collection-selection-toolbar" aria-label="Collection Selection">
      {selectingCollections && <span className="collection-selection-count" role="status">{selectedCollectionIds.length} selected</span>}
      {selectingCollections && <button type="button" className="button secondary collection-bulk-edit" disabled={!selectedCollectionIds.length} onClick={() => setBulkCollections(selectedCollections)}>Edit Selected</button>}
      {layout === 'mobile' ? hiddenButton() : <Tooltip description="View Hidden">{hiddenButton}</Tooltip>}
      <button type="button" className="button secondary collection-select" aria-pressed={selectingCollections} onClick={() => selectingCollections ? clearCollectionSelection() : setSelectingCollections(true)}>{selectingCollections ? 'Cancel Selection' : 'Select Collections'}</button>
      <span className="collection-selection-trigger"><InfoTooltip description={collectionControlHelp} placement="bottom" label="Collection Controls" size={16} /></span>
    </div>}
      {!readOnly && <button ref={editButton} type="button" className="button secondary library-create-action" disabled={busy} aria-pressed={editingCollections} onClick={toggleCollectionEditing}>{editingCollections ? 'Done Editing' : compactHeader ? 'Edit' : 'Edit Collections'}</button>}
      {actions}
    </div></div></div></div>
    <CollectionShelf readOnly={readOnly} showHidden={viewHidden} onAutomaticEdit={readOnly ? undefined : id => { const item = shelfItems.find(item => item.id === id); if (item) requestVisibility(id, item.name) }} editing={editingCollections} selecting={selectingCollections} selectedIds={selectedCollectionIds} onSelectionChange={ids => { setSelectingCollections(true); setSelectedCollectionIds(ids); selectionAnchor.current = null }} onEdit={readOnly ? undefined : editCollection} onMove={moveCollection} items={collectionSort.hideEmpty ? shelfItems.filter(item => item.count !== 0) : shelfItems} selected={selected} disabled={busy || collectionDeletion.busy} onSelect={selectShelf} />
    {collection && <div className="collection-heading"><div className="collection-title-row"><h2>{collection.name}</h2>{addStoriesAction}</div>{collection.automatic_rules && <p className="field-help">Automatic collection · Matching works are included as your library changes.</p>}{collection.description && <p className="collection-summary">{collection.description}</p>}{collection.automatic_rules && <ul className="automatic-collection-filters" aria-label="Automatic Collection Filters">{automaticCollectionLabels(collection).map(value => <li key={value}>{value}</li>)}</ul>}</div>}
    {countStories === undefined && ((navigationError || revisionError) ? <p role="status" className="field-help">Couldn’t update counts. <button className="text-button" onClick={() => void retryCounts()}>Retry Counts</button></p> : navigationLoading && <p role="status" className="field-help">Updating counts…</p>)}
    {(error || collectionDeletion.error) && <p role="alert" className="error-message">{error || collectionDeletion.error}</p>}
</>
  return <>{children({ selected, editingCollections, renderHeader, shelfStories, shelfSeries })}{collectionDeletion.confirmation}{visibilityTarget && <CollectionVisibilityDialog collection={visibilityTarget} onClose={closeVisibility} onConfirm={async () => { setCollectionHidden(visibilityTarget.id, !visibilityTarget.hidden); setEditingCollection(null) }} />}{addingToCollection && <CollectionMembershipDialog collection={addingToCollection} onClose={() => { setAddingToCollection(null); addStoriesTrigger.current?.focus() }} />}{bulkCollections && <NewCollectionDialog selectedCollections={bulkCollections} onClose={() => { setBulkCollections(null); clearCollectionSelection(); editButton.current?.focus() }} onDeleted={() => { if (bulkCollections.some(item => item.id === selected)) setParams({ shelf: 'all' }) }} />}{editingCollection && <NewCollectionDialog collection={editingCollection} hidden={collectionSort.hiddenCustom.includes(editingCollection.id)} onVisibilityChange={changeEditedCollectionVisibility} onClose={() => setEditingCollection(null)} onDeleted={() => { if (selected === editingCollection.id) setParams({ shelf: 'all' }) }} />}</>
}
