import { workMetadataFields } from './display/WorkMetadataFields'
import { isDisplayFieldHidden } from './display/display-settings'
import { WorkStatusBadge } from './WorkStatusBadge'
import { BookmarkRec } from './BookmarkRec'
import { resumeReadingStatus, readingDuration } from './reading-history'
import { automaticCollectionLabels } from './collections/automatic-collections'
import { MetadataTags } from './MetadataTags'
import { CustomCollectionNames } from './collections/CustomCollectionNames'
import { DisplayInfo } from './display/DisplayInfo'
import { formatDateTime } from '../../lib/dates'
import { useStorySnapshot } from './useStorySnapshot'
import { browsingReturnTo, collectionSortKey } from './browsing/browsing'
import { CompletedImportSeriesNotice } from '../imports/ImportedSeriesNotice'
import { PersonalNote } from './PersonalNote'
import { SeriesCard } from './series/SeriesCollection'
import { filterLibraryItems, seriesSearchStory, seriesItemId } from './series/series-search'
import { librarySeries, seriesReadingStatus } from './series/series'
import { EditConflictReview } from './EditConflictReview'
import { editSnapshot, EditConflict, type EditValues } from './edit-merge'
import { OneShotIndicator } from './OneShotIndicator'
import { CollectionVisibilityDialog } from './collections/CollectionVisibility'
import { Dropdown } from '../../components/Dropdown'
import { readingStatusIcons, collectionOrderOptions, orderCollections, moveCollectionIds, type CollectionOrder, type CollectionAppearance } from './collections/collection-appearance'
import { SeriesNames } from './series/SeriesNames'
import { MetadataControls, MetadataRefreshButton } from '../imports/MetadataControls'
import { useMetadataRefresh } from '../imports/useMetadataRefresh'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, ArrowLeft, Eye, EyeOff, BookOpen, BookX, Check, FileText, FolderPlus, Info, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useLibrary } from './LibraryProvider'
import { active, ao3Date, ratingLabel, chapterUrl, nextUnread, parseLines, savedWorkUrl, statuses, validateProgress, type Collection, type Status, type Story } from './model'
import { reorderCollections, saveStory, updateEntry } from './repository'
import { useDismissible } from '../../components/useDismissible'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { Tooltip } from '../../components/Tooltip'
import { StarRating } from './StarRating'
import { useDisplayPreference } from './display/useDisplayPreference'
import { FavoriteButton, PersonalToggleButton } from './FavoriteButton'
import { AuthorNames } from './AuthorNames'
import { StoryForm } from './StoryForm'
import { PersonalTagHelp, PersonalTagInput } from './PersonalTagInput'
import { ImportLinkForm } from '../imports/ImportLinkForm'
import { EditCollectionsButton } from './collections/EditCollectionsButton'
import { CollectionMembershipDialog } from './collections/CollectionMembershipDialog'
import { NewCollectionDialog } from './collections/NewCollectionDialog'
import { CollectionShelf } from './collections/CollectionShelf'
import { SpineOrnament } from './collections/SpineOrnament'
import { ReadingDashboard } from './ReadingDashboard'
import { publicationStatuses } from './publication-status'

export function LibraryBoundary({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useLibrary()
  if (loading) return <p role="status">Loading your library…</p>
  if (error) return <div role="alert" className="error-message">{error}<button className="button secondary" onClick={() => void refresh().catch(() => {})}>Retry loading</button></div>
  return children
}
function ExternalUrl({ url, fallback = 'Unverified' }: { url: string | null; fallback?: string }) {
  let clickable = false
  try {
    const parsed = new URL(url ?? '')
    clickable = parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { /* Missing or invalid legacy URLs remain plain text. */ }
  return clickable ? <a className="metadata-link" href={url!} target="_blank" rel="noreferrer">{url}</a> : <>{fallback}</>
}
type CardControls = { rating: ReactNode; actions: ReactNode; favorite: ReactNode; rec: ReactNode; readingStatus: ReactNode; caughtUp: ReactNode; editProgress: ReactNode; collectionsField: ReactNode }
function StoryControls({ story, children }: { story: Story; children: (controls: CardControls) => ReactNode }) {
  const { refreshStory, markAllRead, markFinished, removeStory } = useLibrary(), navigate = useNavigate(), location = useLocation()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(String(story.last_read_chapter))
  const [conflict, setConflict] = useState<EditConflict | null>(null)
  const blocked = busy || Boolean(conflict)
  const editBase = useRef(editSnapshot(story))
  function failed(error: unknown, fallback = 'Could not save changes.') {
    if (error instanceof EditConflict) setConflict(error)
    else setError(error instanceof Error ? error.message : fallback)
  }
  const [progressOpen, setProgressOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const progressId = useId()
  const progressTrigger = useRef<HTMLButtonElement>(null)
  const progressRef = useDismissible<HTMLDivElement>(progressOpen, () => { setProgressOpen(false); setError('') })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useDismissible<HTMLDetailsElement>(menuOpen, () => setMenuOpen(false))
  async function change(changes: Parameters<typeof updateEntry>[1], base = editSnapshot(story)) {
    setError(''); setBusy(true)
    try { await updateEntry(story.id, changes, base); await refreshStory(story.id); return true }
    catch (e) { failed(e); return false }
    finally { setBusy(false) }
  }
  async function markRead() {
    setError(''); setBusy(true)
    try { await markAllRead(story) }
    catch (e) { failed(e, 'Could not mark chapters as read.') }
    finally { setBusy(false) }
  }
  async function finishStory() {
    setError(''); setBusy(true)
    try { await markFinished(story); setMenuOpen(false) }
    catch (e) { failed(e, 'Could not mark story as finished.') }
    finally { setBusy(false) }
  }
  async function remove() { await removeStory(story); navigate(location.pathname.startsWith('/stories/') ? browsingReturnTo(location.state?.returnTo) : location.pathname + location.search, { replace: !location.pathname.startsWith('/stories/') }) }
  function closeRemoval() { setRemoveOpen(false); menuRef.current?.querySelector('summary')?.focus() }
  function closeProgress() { setProgressOpen(false); setError(''); progressTrigger.current?.focus() }
  const editProgress = <div className="progress-editor" ref={progressRef} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeProgress() } }}>
    <button ref={progressTrigger} className="chapter-progress-button" title="Edit chapter progress" aria-label={`Chapter ${story.last_read_chapter} of ${story.metadata.published_chapters ?? '?'} — edit progress`} aria-haspopup="dialog" aria-expanded={progressOpen} aria-controls={progressOpen ? progressId : undefined} disabled={blocked} onClick={() => { editBase.current = editSnapshot(story); setProgress(String(story.last_read_chapter)); setError(''); setProgressOpen(!progressOpen) }}><strong>Ch. {story.last_read_chapter} / {story.metadata.published_chapters ?? '?'}</strong></button>
    {progressOpen && <div id={progressId} role="dialog" aria-modal="false" className="progress-popover" aria-label="Edit chapter progress"><form onSubmit={event => { event.preventDefault(); try { if (!progress.trim()) throw new Error('Enter chapters read.'); validateProgress(Number(progress), story.metadata); void change({ last_read_chapter: Number(progress) }, editBase.current).then(saved => { if (saved) closeProgress() }) } catch (e) { setError((e as Error).message) } }}><h2>Edit chapter progress</h2><label>Last fully read chapter<input type="number" autoFocus required min="0" step="1" value={progress} onChange={e => setProgress(e.target.value)} /></label><p>of {story.metadata.total_chapters ?? '?'} · {story.metadata.published_chapters ?? '?'} published</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button primary" disabled={blocked}>Save progress</button><button className="button secondary" disabled={blocked} type="button" onClick={closeProgress}>Cancel</button></div></form></div>}
  </div>
  const tilePreference = useDisplayPreference('workTile')
  const finished = story.reading_status === 'finished'
  const caughtUpDescription = finished ? 'Begin Re-reading' : story.metadata.published_chapters === null ? 'Enter published chapter count in details first' : 'Mark all chapters as read'
  const CaughtUpIcon = finished ? RotateCcw : Check
  const caughtUp = <Tooltip description={caughtUpDescription}>{descriptionId => <button className="spine-action caught-up-action" aria-label={finished ? 'Begin Re-reading' : 'Mark as Caught Up'} aria-describedby={descriptionId} disabled={blocked || !finished && story.metadata.published_chapters === null} onClick={() => finished ? void change({ reading_status: 're_reading', last_read_chapter: 0 }) : void markRead()}><CaughtUpIcon size={14} aria-hidden="true" /></button>}</Tooltip>
  const favorite = <FavoriteButton selected={story.is_favorite} disabled={blocked} onChange={selected => void change({ is_favorite: selected })} />
  const rec = <BookmarkRec story={story} disabled={blocked} onChange={selected => void change({ is_rec: selected })} />
  const StatusIcon = readingStatusIcons[story.reading_status]
  const readingStatus = <label className="status-select"><span className="details-control-heading">Reading Status</span><span className="reading-status-value"><StatusIcon size={18} aria-hidden="true" /><select aria-label={`Reading status for ${story.metadata.title}`} disabled={blocked} value={story.reading_status} onChange={e => void change({ reading_status: e.target.value as Status })}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></span></label>
  const actions = <div className="story-quick-actions"><DisplayInfo group="workTile" fields={['favorite', 'rec']}>{{ favorite, rec }}</DisplayInfo>
    <details className="story-menu" ref={menuRef} open={menuOpen} onToggle={event => setMenuOpen(event.currentTarget.open)}>
      <summary aria-label={`Story actions for ${story.metadata.title}`}><MoreHorizontal size={22} /></summary>
      <div className="menu-surface">
        {(['favorite', 'rec'] as const).filter(kind => isDisplayFieldHidden(tilePreference, kind)).map(kind => <PersonalToggleButton key={kind} kind={kind} menu selected={kind === 'favorite' ? story.is_favorite : story.is_rec} disabled={blocked} onChange={selected => void change(kind === 'favorite' ? { is_favorite: selected } : { is_rec: selected })} />)}
        <Link className="menu-item" to={`/stories/${story.id}`} state={location.pathname.startsWith('/stories/') ? location.state : { returnTo: location.pathname + location.search }}><FileText size={16} aria-hidden="true" />View/Edit Details</Link>
        {story.reading_status !== 'paused_reading' && <button className="menu-item" disabled={blocked} onClick={() => void change({ reading_status: 'paused_reading' })}><readingStatusIcons.paused_reading size={16} aria-hidden="true" />Mark as Paused Reading</button>}
        {story.reading_status === 'paused_reading' && <button className="menu-item" disabled={blocked} onClick={() => void change({ reading_status: resumeReadingStatus(story) })}><readingStatusIcons.reading size={16} aria-hidden="true" />Resume Reading</button>}
        <button className="menu-item" disabled={blocked} onClick={() => void finishStory()}><Check size={16} aria-hidden="true" />Mark as Finished</button>
        <button className="menu-item" disabled={blocked} onClick={() => { setMenuOpen(false); setCollectionOpen(true) }}><FolderPlus size={16} aria-hidden="true" />Add to collection</button>
        <button className="menu-item" disabled={blocked} onClick={() => void change({ reading_status: 'did_not_finish' })}><BookX size={16} aria-hidden="true" />Mark as DNF</button>
        <hr className="menu-divider" />
        <button className="menu-item" disabled={blocked} onClick={() => { setMenuOpen(false); setRemoveOpen(true) }}><Trash2 size={16} aria-hidden="true" />Remove from Library</button>
      </div>
    </details></div>
  return <>{children({ actions, favorite, rec, readingStatus, caughtUp, editProgress, collectionsField: <EditCollectionsButton onRefresh={() => refreshStory(story.id)} variant="field" disabled={blocked} automaticIds={story.automaticCollectionIds} selectedIds={story.collectionIds} description={`Choose collections for “${story.metadata.title}”.`} onSave={async (collections, baseline) => {
      const base = { ...editSnapshot(story), collections: baseline }
      await saveStory({ id: story.id, base, url: savedWorkUrl(story), metadata: story.metadata, metadataChanges: {}, status: story.reading_status, progress: story.last_read_chapter, notes: story.notes, personalRating: story.personal_rating, favorite: story.is_favorite, collections, tags: story.personalTags })
    }} />, rating: <StarRating headingClassName="details-control-heading" value={story.personal_rating} disabled={blocked} onEdit={() => { editBase.current = editSnapshot(story) }} onSave={value => change({ personal_rating: value }, editBase.current)} /> })}
    {conflict && <EditConflictReview key={JSON.stringify(conflict.review)} conflict={conflict} onError={failed} onSaved={async () => { setConflict(null); closeProgress(); await refreshStory(story.id) }} onCancel={() => setConflict(null)} />}
    {collectionOpen && <CollectionMembershipDialog story={story} onClose={() => { setCollectionOpen(false); menuRef.current?.querySelector('summary')?.focus() }} />}
    {removeOpen && <ConfirmationDialog title="Remove from Library?" confirmLabel="Remove from Library" onConfirm={remove} onClose={closeRemoval}><p>Remove “{story.metadata.title}” from your library?</p><p>You can undo this for two minutes.</p></ConfirmationDialog>}
    {!progressOpen && error && <p className="error-message" role="alert">{error}</p>}
  </>
}
function BookSpineFooter({ story, editProgress, caughtUp }: { story: Story; editProgress: ReactNode; caughtUp: ReactNode }) {
  const published = story.metadata.published_chapters
  const knownPublished = published !== null && published > 0
  const read = Math.max(0, story.last_read_chapter)
  const next = chapterUrl(story)
  const readLabel = next ? `Read Chapter ${nextUnread(story.last_read_chapter)}` : 'Read on AO3'
  return <footer className="book-spine-footer">
    <div className="spine-progress">
      {editProgress}
      <div className="spine-progress-track" role="progressbar" aria-label="Chapters read" aria-valuemin={0} aria-valuemax={knownPublished ? published : undefined} aria-valuenow={knownPublished ? Math.min(read, published) : undefined} aria-valuetext={knownPublished ? `${read} of ${published} chapters read` : `${read} chapters read; published chapter count unknown`}>
        <span className="spine-progress-fill" style={{ width: `${knownPublished ? Math.min(100, read / published * 100) : 0}%` }} />
      </div>
    </div>
    <span className="spine-divider" aria-hidden="true"><SpineOrnament /></span>
    <div className="spine-actions">
      <Tooltip description={`Read chapter ${nextUnread(story.last_read_chapter)}`}>{descriptionId => <a className="spine-action" href={next ?? savedWorkUrl(story)} target="_blank" rel="noreferrer" aria-label={readLabel} aria-describedby={descriptionId}><BookOpen size={16} aria-hidden="true" /></a>}</Tooltip>
      {caughtUp}
    </div>
  </footer>
}
export function StoryCard({ story: candidate, linkId }: { story: Story; linkId?: string }) {
  const location = useLocation()
  const story = useStorySnapshot(candidate)!
  if (story.detailsLoaded === false) return <article className="story-card work-card" aria-busy="true"><p role="status">Loading work details…</p></article>
  const origin = { returnTo: location.pathname + location.search }
  const { label: publicationLabel, Icon: PublicationIcon } = publicationStatuses[story.metadata.publication_status]
  return <article className="story-card work-card" data-story-id={story.id}><StoryControls story={story}>{({ actions, caughtUp, editProgress }) => <>
    <div className="story-card-title"><h2 aria-label={story.metadata.title}><Link id={linkId ?? `work-link-${story.id}`} to={`/stories/${story.id}`} state={origin}>{story.metadata.title}</Link>{'\u00a0'}<Tooltip description={publicationLabel}>{descriptionId => <span className="publication-icon" role="img" aria-label={publicationLabel} aria-describedby={descriptionId} tabIndex={0}><PublicationIcon size={18} strokeWidth={1.6} aria-hidden="true" /></span>}</Tooltip><OneShotIndicator story={story} /><WorkStatusBadge story={story} /></h2>{actions}</div>
<DisplayInfo group="workTile">{{
      ...workMetadataFields(story, 'tile'),
      personalRating: <div className="tile-personal-rating"><StarRating value={story.personal_rating} /></div>,
      collections: <div className="story-facts"><CustomCollectionNames ids={[...story.collectionIds, ...(story.automaticCollectionIds ?? [])]} /></div>,
      notes: <p className="story-summary">{story.notes || 'No private notes saved.'}</p>,
      reading: <p className="story-facts">{statuses[story.reading_status]}</p>,
      saved: <p className="story-facts">Saved: {formatDateTime(story.created_at)}</p>,
      progress: <> <BookSpineFooter story={story} editProgress={editProgress} caughtUp={caughtUp} /> </>
    }}</DisplayInfo>
  </>}</StoryControls></article>
}
const shelves = [['all', 'All Works'], ['currently_reading', 'Currently Reading'], ['paused_reading', 'Paused Reading'], ['to_read', 'To Read'], ['finished', 'Finished'], ['did_not_finish', 'Did Not Finish'], ['series', 'Series'],['recs', 'Recs'], ['favorites', 'Favorites'],] as const
export function LibraryPage({ reading = false }: { reading?: boolean }) {
  const { stories } = useLibrary()
  if (reading) return <LibraryBoundary><ReadingDashboard stories={stories} renderHeader={refreshButton => <div className="page-heading"><div><h1>Currently Reading</h1></div><div className="library-heading-actions">{refreshButton}<Link className="button primary library-create-action" to="/add?mode=finished">Add Story</Link></div></div>} renderStory={(story, linkId) => <StoryCard key={story.id} story={story} linkId={linkId} />} /></LibraryBoundary>
  return <LibraryContent />
}
const collectionControlHelp = 'Command-click (Mac) or Control-click (Windows) a collection to edit it directly, or edit the group when multiple collections are selected.\nSelect collections, then click or tap books to select or deselect.\nShift + click or drag: select a range.\nStart Shift-drag on a selected book to deselect a range.\nRelease Shift. Drag a selected book: move the selected group.\nAlt + Left/Right Arrow: move a book or group.\nEscape: cancel dragging; otherwise leave selection, then leave editing.\nEdit selected: change appearance or delete. Cancel selection: clear the selection.'

type CollectionSort = { shelfOrder?: string[]; automaticOrder: string[]; order: CollectionOrder; hiddenAutomatic: string[]; hiddenCustom: string[] }
function initialCollectionSort(): CollectionSort {
  try {
    const saved = JSON.parse(window.localStorage.getItem(collectionSortKey) ?? 'null')
    return { shelfOrder: Array.isArray(saved?.shelfOrder) ? saved.shelfOrder.filter((id: unknown): id is string => typeof id === 'string') : undefined, automaticOrder: [...new Set<string>([...(Array.isArray(saved?.automaticOrder) ? saved.automaticOrder.filter((id: unknown): id is string => shelves.some(([key]) => key === id)) : []), ...shelves.map(([id]) => id)])], order: collectionOrderOptions.find(option => option.value === saved?.order)?.value ?? 'created_newest', hiddenAutomatic: shelves.map(([id]) => id).filter(id => Array.isArray(saved?.hiddenAutomatic) && saved.hiddenAutomatic.includes(id)), hiddenCustom: Array.isArray(saved?.hiddenCustom) ? saved.hiddenCustom.filter((id: unknown): id is string => typeof id === 'string') : [] }
  } catch { /* Sorting still works when browser storage is unavailable. */ }
  return { automaticOrder: shelves.map(([id]) => id), order: 'created_newest', hiddenAutomatic: [], hiddenCustom: [] }
}

function LibraryContent() {
  const { stories, collections, series: seriesRecords, refreshCollections: refresh } = useLibrary()
  const [params, setParams] = useSearchParams()
  const selected = params.get('shelf') ?? 'all'
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [collectionSort, setCollectionSort] = useState(initialCollectionSort)
  useEffect(() => {
    try { window.localStorage.setItem(collectionSortKey, JSON.stringify(collectionSort)) }
    catch { /* Keep the current sort when browser storage is unavailable. */ }
  }, [collectionSort])
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
      if (event.target instanceof Element && event.target.closest('[role="dialog"], .custom-dropdown')) return
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
  function changeCollectionSort(order: CollectionOrder) {
    setCollectionSort(previous => ({ ...previous, order }))
    setEditingCollections(false); setViewHidden(false)
    clearCollectionSelection()
  }
  // Display sorts never change the saved manual positions.
  const displayedCollections = orderCollections(customCollections, [...stories, ...(seriesRecords ?? []).map(series => ({ collectionIds: series.collectionIds ?? [], updated_at: series.updated_at }))], collectionSort.order)
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
  const worksByShelf = useMemo(() => {
    const index = new Map<string, Story[]>()
    function add(key: string, story: Story) { const values = index.get(key) ?? []; values.push(story); index.set(key, values) }
    for (const story of stories) {
      if (active(story)) add('currently_reading', story)
      if (story.reading_status === 're_reading') add('finished', story)
      if (story.metadata.publication_status === 'complete') add('complete', story)
      if (story.reading_status === 'waiting_for_updates') add('waiting', story)
      if (['paused_reading', 'to_read', 'finished', 'did_not_finish'].includes(story.reading_status)) add(story.reading_status, story)
      if (story.is_favorite) add('favorites', story)
      if (story.is_rec) add('recs', story)
      for (const id of new Set([...story.collectionIds, ...(story.automaticCollectionIds ?? [])])) add(id, story)
    }
    return index
  }, [stories])
  function storiesForShelf(key: string) {
    return collectionsById.has(key) || ['currently_reading', 'paused_reading', 'complete', 'new', 'waiting', 'to_read', 'finished', 'did_not_finish', 'favorites', 'recs'].includes(key) ? worksByShelf.get(key) ?? [] : stories
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
  const seriesById = new Map(shelfSeries.map(series => [seriesItemId(series), series]))
  const shelfStories = selected === 'series' ? shelfSeries.map(seriesSearchStory) : [...storiesForShelf(selected), ...shelfSeries.map(seriesSearchStory)]
  const shelfItems = [...[...shelves].sort((a, b) => collectionSort.automaticOrder.indexOf(a[0]) - collectionSort.automaticOrder.indexOf(b[0])).map(([id, name]) => ({ id, name, hidden: collectionSort.hiddenAutomatic.includes(id) })), ...displayedCollections.map(item => ({ ...item, hidden: collectionSort.hiddenCustom.includes(item.id) }))]
    .sort((a, b) => {
      if (collectionSort.order !== 'manual' || !collectionSort.shelfOrder) return 0
      const rank = (id: string) => { const index = collectionSort.shelfOrder!.indexOf(id); return index < 0 ? Infinity : index }
      return rank(a.id) - rank(b.id)
    })
    .map(item => {
      const works = item.id === 'series' ? 0 : storiesForShelf(item.id).length, seriesCount = item.id === 'series' || params.get('showSeries') === 'true' ? seriesForShelf(item.id).length : 0
      return { ...item, count: works + seriesCount, countLabel: seriesCount ? works ? `${works} ${works === 1 ? 'story' : 'stories'} and ${seriesCount} series` : `${seriesCount} series` : undefined }
    })

  return <><LibraryBoundary><ReadingDashboard renderHeader={refreshButton => <><div className="page-heading library-heading"><div><div className="library-title-row"><h1>Your Library</h1>
    {editingCollections && <div className="collection-selection-toolbar" aria-label="Collection selection">
      <Tooltip description="View Hidden">{descriptionId => <button aria-describedby={descriptionId} type="button" className="button secondary" aria-pressed={viewHidden} onClick={() => { clearCollectionSelection(); setViewHidden(!viewHidden) }}>{viewHidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}Hidden</button>}</Tooltip>
      <button type="button" className="button secondary" aria-pressed={selectingCollections} onClick={() => selectingCollections ? clearCollectionSelection() : setSelectingCollections(true)}>{selectingCollections ? 'Cancel selection' : 'Select collections'}</button>
      <span className="collection-selection-trigger">{selectingCollections && <span role="status">{selectedCollectionIds.length} selected</span>}<Tooltip description={collectionControlHelp} placement="bottom">{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label="Collection controls" aria-describedby={descriptionId}><Info size={16} aria-hidden="true" /></button>}</Tooltip></span>
      {selectingCollections && <button type="button" className="button secondary" disabled={!selectedCollectionIds.length} onClick={() => setBulkCollections(selectedCollections)}>Edit selected</button>}
    </div>}
    <div className="library-heading-actions">{!editingCollections && <>{refreshButton}
      <Link className="button primary library-create-action" to="/add?mode=finished">Add Story</Link></>}
      <button ref={editButton} type="button" className="button secondary library-create-action" disabled={busy} aria-pressed={editingCollections} onClick={toggleCollectionEditing}>{editingCollections ? 'Done Editing' : 'Edit Collections'}</button>
      <Dropdown label="Sort" icon={ArrowDownWideNarrow} compact value={collectionSort.order} options={[...collectionOrderOptions]} onChange={value => changeCollectionSort(value as CollectionOrder)} disabled={busy || !customCollections.length} closeOnSelect />
    </div></div></div></div>
    <CollectionShelf showHidden={viewHidden} onAutomaticEdit={id => { const item = shelfItems.find(item => item.id === id); if (item) requestVisibility(id, item.name) }} editing={editingCollections} selecting={selectingCollections} selectedIds={selectedCollectionIds} onSelectionChange={ids => { setSelectingCollections(true); setSelectedCollectionIds(ids); selectionAnchor.current = null }} onEdit={editCollection} onMove={(id, target) => void moveCollection(id, target)} items={shelfItems} selected={selected} disabled={busy} onSelect={key => setParams(previous => { const next = new URLSearchParams(previous); next.set('shelf', key); next.set('page', '1'); return next })} />
    {collection && <div className="collection-heading"><h2>{collection.name}</h2>{collection.automatic_rules && <p className="field-help">Automatic collection · Matching works are included as your library changes.</p>}{collection.description && <p className="collection-summary">{collection.description}</p>}{collection.automatic_rules && <ul className="automatic-collection-filters" aria-label="Automatic Collection Filters">{automaticCollectionLabels(collection).map(value => <li key={value}>{value}</li>)}</ul>}</div>}
    {error && <p role="alert" className="error-message">{error}</p>}
</>} mode={selected === 'series' ? 'series' : 'library'} stories={shelfStories} filterItems={(pool, filters) => filterLibraryItems(pool, { ...filters, showSeries: selected === 'series' || filters.showSeries }, shelfSeries)} renderStory={(story, linkId) => seriesById.has(story.id) ? <SeriesCard key={story.id} series={seriesById.get(story.id)!} linkId={linkId} /> : <StoryCard key={story.id} story={story} linkId={linkId} />} resultsActions={!editingCollections && collection && !collection.default_key && !collection.automatic_rules && <button ref={addStoriesTrigger} type="button" className="button secondary button-small" onClick={() => setAddingToCollection(collection)}>Add Story</button>} />
  </LibraryBoundary>{visibilityTarget && <CollectionVisibilityDialog collection={visibilityTarget} onClose={closeVisibility} onConfirm={async () => { setCollectionHidden(visibilityTarget.id, !visibilityTarget.hidden); setEditingCollection(null) }} />}{addingToCollection && <CollectionMembershipDialog collection={addingToCollection} onClose={() => { setAddingToCollection(null); addStoriesTrigger.current?.focus() }} />}{bulkCollections && <NewCollectionDialog selectedCollections={bulkCollections} onClose={() => { setBulkCollections(null); clearCollectionSelection(); editButton.current?.focus() }} onDeleted={() => { if (bulkCollections.some(item => item.id === selected)) setParams({ shelf: 'all' }) }} />}{editingCollection && <NewCollectionDialog collection={editingCollection} hidden={collectionSort.hiddenCustom.includes(editingCollection.id)} onVisibilityChange={changeEditedCollectionVisibility} onClose={() => setEditingCollection(null)} onDeleted={() => { if (selected === editingCollection.id) setParams({ shelf: 'all' }) }} />}</>
}
export function AddStoryPage() {
  const [params, setParams] = useSearchParams()
  const importing = params.get('import') !== 'manual'
  return <><div className="page-heading"><div><h1>Add Story</h1><p>Import metadata from an AO3 link or enter information by hand.</p></div></div><LibraryBoundary>
    <div className="library-toolbar"><button type="button" className="button secondary" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('import', importing ? 'manual' : 'link'); return next })}>{importing ? 'Enter manually' : 'Import from link'}</button></div>
    {importing ? <ImportLinkForm /> : <StoryForm />}
  </LibraryBoundary></>
}
function PersonalStoryField({ story }: { story: Story }) {
  const library = useLibrary()
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [conflict, setConflict] = useState<EditConflict | null>(null)
  const [base, setBase] = useState<EditValues>(editSnapshot(story))
  const [text, setText] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const label = 'Personal Tags'
  function open() { setBase(editSnapshot(story)); setConflict(null); setText(story.personalTags.join('\n')); setError(''); setEditing(true) }
  function close() { setEditing(false); trigger.current?.focus() }
  async function save() {
    setBusy(true); setError('')
    try {
      await saveStory({ id: story.id, base, url: savedWorkUrl(story), metadata: story.metadata, metadataChanges: {}, status: base.status as Status, progress: base.progress as number, notes: base.notes as string, personalRating: base.rating as number | null, favorite: base.favorite as boolean, collections: base.collections as string[], tags: parseLines(text) })
      await library.refreshStory(story.id); close()
    } catch (e) { if (e instanceof EditConflict) setConflict(e); else setError(e instanceof Error ? e.message : 'Could not save changes.') }
    finally { setBusy(false) }
  }
  return <><dt className="editable-field-heading">{label}{!editing && <PersonalTagHelp />}
    {!editing && <button ref={trigger} type="button" className="icon-button inline-edit-icon" aria-label="Edit personal tags" onClick={open}><Pencil size={12} aria-hidden="true" /></button>}
  </dt><dd className="inline-personal-field">
    {editing ? <form className="inline-personal-form" onSubmit={event => { event.preventDefault(); if (!conflict) void save() }}><fieldset disabled={busy || Boolean(conflict)}>
      <PersonalTagInput value={parseLines(text)} onChange={tags => setText(tags.join('\n'))} />
      <div className="form-actions"><button className="button primary" type="submit">{busy ? 'Saving…' : 'Save'}</button><button className="text-button" type="button" onClick={close}>Cancel</button></div>
    </fieldset></form> : <MetadataTags values={story.personalTags} category="personalTags" />}
    {conflict && <EditConflictReview key={JSON.stringify(conflict.review)} conflict={conflict} collections={library.collections} onSaved={async () => { setConflict(null); await library.refreshStory(story.id); close() }} onError={error => { if (error instanceof EditConflict) setConflict(error); else setError(error instanceof Error ? error.message : 'Could not save changes.') }} onCancel={() => setConflict(null)} />}
    {error && <p className="error-message" role="alert">{error}</p>}
  </dd></>
}
export function StoryDetailsPage({ example }: { example?: Story } = {}) {
  const { id } = useParams(), library = useLibrary(), location = useLocation(), [params, setParams] = useSearchParams()
  const edit = example ? null : params.get('edit'), editing = edit === 'metadata' || edit === 'reading' ? edit : null
  function editSection(section: 'metadata' | 'reading' | null) { setParams(section ? { edit: section } : {}, { state: location.state }) }
  const candidate = location.state?.returnTo
  const returnTo = browsingReturnTo(candidate)
  const returnLabel = returnTo.startsWith('/reading') ? 'Currently Reading' : returnTo.startsWith('/series/') ? 'Series' : 'Library'
  const candidateStory = example ?? library.stories.find(s => s.id === id)
  const story = useStorySnapshot(candidateStory)
  const { loadDetails, retainDetails } = library
  useEffect(() => !example && id ? retainDetails([id]) : undefined, [example, id, retainDetails])
  useEffect(() => { if (!example && id && (!candidateStory || candidateStory.detailsLoaded === false)) void loadDetails([id]).catch(() => {}) }, [example, id, candidateStory, loadDetails])
  const metadataRefresh = useMetadataRefresh(example || story?.detailsLoaded === false ? undefined : story)
  const metadataRefreshProps = { ...metadataRefresh, unavailable: story?.work.ao3_work_id === null, onRefresh: () => void metadataRefresh.refresh() }
  return <LibraryBoundary>{story?.detailsLoaded === false ? <p role="status">Loading work details…</p> : story ? <StoryControls story={story}>{({ favorite, rec, readingStatus, caughtUp, editProgress, rating, collectionsField }) => <div className="story-details-page">
    <div className="page-heading story-details-heading work-details-heading"><div>
      <Link className="story-return-link clickable-text" to={returnTo} aria-label={`Back to ${returnLabel}`}><ArrowLeft size={16} aria-hidden="true" />{returnLabel}</Link>
      <div className="story-title-row">
        <h1 aria-label={story.metadata.title}><a href={savedWorkUrl(story)} target="_blank" rel="noreferrer">{story.metadata.title}</a><OneShotIndicator story={story} /><WorkStatusBadge story={story} /></h1>
        {editing && <p className="story-details-authors">By <AuthorNames metadata={story.metadata} /></p>}
        {!editing && <><div className="story-title-toggles">{favorite}{rec}</div><div className="story-metadata-actions"><MetadataRefreshButton {...metadataRefreshProps} variant="button" /><button className="button secondary story-metadata-edit" aria-label="Edit AO3 metadata" onClick={() => editSection('metadata')}><Pencil size={14} aria-hidden="true" />Edit</button></div></>}
      </div>
      {!editing && <DisplayInfo group="workHeader">{{
        series: <> {!!story.metadata.series?.length && <p className="story-series-eyebrow"><SeriesNames metadata={story.metadata} /></p>} </>,
        authors: <> <p className="story-details-authors">By <AuthorNames metadata={story.metadata} /></p> </>,
        fandoms: <p className="details-fandom-rating">{story.metadata.fandoms.join(' · ') || 'Fandom unknown'} · {ratingLabel(story.metadata.rating) || 'Rating unknown'}</p>,
        stats: <> <dl className="details-story-stats">
<DisplayInfo group="workStats">{{
      words: <> <div><dt>Word Count</dt><dd><strong>{story.metadata.word_count?.toLocaleString() ?? '?'}</strong> words</dd></div> </>,
      chapters: <> <div><dt>Published / Total Chapters</dt><dd><strong>{story.metadata.published_chapters ?? '?'} / {story.metadata.total_chapters ?? '?'}</strong> chapters</dd></div> </>,
      publication: <> <div><dt>Publication Status</dt><dd><strong>{publicationStatuses[story.metadata.publication_status].label}</strong></dd></div> </>,
      updated: <> <div><dt>Date Updated</dt><dd><strong>{ao3Date(story.work.ao3_updated_at)}</strong></dd></div> </>
    }}</DisplayInfo>
        </dl> </>}}</DisplayInfo>}
    </div></div>
    {typeof location.state?.importBatchId === 'string' && <CompletedImportSeriesNotice key={location.state.importBatchId} batchId={location.state.importBatchId} />}
    {editing ? <StoryForm key={`${story.id}-${editing}`} story={story} section={editing} onCancel={() => editSection(null)} /> : <>
<DisplayInfo group="workPage">{{
      progress: <>       <section className="settings-card details-progress-panel" aria-label="Reading and organization">
        <div className="story-section-heading"><h2>Your progress</h2></div>
        <BookSpineFooter story={story} editProgress={editProgress} caughtUp={caughtUp} />
        <div className="details-reading-controls">{readingStatus}{rating}{collectionsField}</div>
      </section> </>,
      notes: <>
      <section className="details-private-notes" aria-label="Private notes"><PersonalNote key={story.id} notes={story.notes} onSave={(notes, base) => updateEntry(story.id, { notes }, { notes: base })} onRefresh={() => library.refreshStory(story.id)} /></section> </>,
      information: <>
      <section className="settings-card details-fic-panel" aria-label="Story information">
        <dl className="metadata-list details-fic-fields">
<DisplayInfo group="workInfo">{{
      ...workMetadataFields(story, 'info'),
      personalTags: <> <div><PersonalStoryField key={story.id} story={story} /></div> </>,
      saved: <> <div><dt>Saved</dt><dd>{formatDateTime(story.created_at)}</dd></div>{story.finished_at && <div><dt>Finished</dt><dd>{formatDateTime(story.finished_at)}</dd></div>}<div><dt>Estimated reading time</dt><dd>{readingDuration(story)}</dd></div>{story.reading_history?.filter(event => ['paused_reading', 'resumed'].includes(event.action)).map((event, index) => <div key={index}><dt>{event.action === 'resumed' ? 'Resumed' : 'Paused'}</dt><dd>{formatDateTime(event.at)}</dd></div>)} </>,
      edited: <> <div><dt>Last edited</dt><dd>{formatDateTime(story.updated_at)}</dd></div> </>,
      other: <> <div><dt className="sr-only">Other metadata</dt><dd><details className="details-disclosure"><summary>Other metadata</summary><p className="muted">Manually entered values are private field-level overrides.</p>
        <dl className="metadata-list">
          <div><dt>AO3 work ID</dt><dd>{story.work.ao3_work_id}</dd></div>
          <div><dt>Metadata last checked</dt><dd>{story.work.last_metadata_check ? formatDateTime(story.work.last_metadata_check) : 'Never'}</dd></div>
          <div><dt>Verified canonical URL</dt><dd><ExternalUrl url={story.work.canonical_url} /></dd></div>
          <div><dt>Original provided URL</dt><dd><ExternalUrl url={story.original_url} fallback="Unavailable" /></dd></div>
          {savedWorkUrl(story) !== story.original_url && <div><dt>Updated provided URL</dt><dd><ExternalUrl url={savedWorkUrl(story)} /></dd></div>}
        </dl></details></dd></div> </>
    }}</DisplayInfo>
        </dl>

      </section> </>,
      metadata: <>
      <MetadataControls story={story} refreshButton={<MetadataRefreshButton {...metadataRefreshProps} />} refreshMessage={metadataRefresh.message} /> </>
    }}</DisplayInfo>
    </>}
    {metadataRefresh.notFound && <ConfirmationDialog title="Mark work as deleted?" confirmLabel="Mark as deleted" pendingLabel="Saving…" onConfirm={metadataRefresh.confirmDeleted} onClose={metadataRefresh.dismissNotFound}>
      <p>‘<a className="clickable-text" href={savedWorkUrl(story)} target="_blank" rel="noreferrer">{story.metadata.title}</a>’ returns an Error 404: The page you were looking for doesn't exist. Would you like to mark the work as deleted? Your existing metadata and information will be preserved.</p>
    </ConfirmationDialog>}
  </div>}</StoryControls> : <p>Story unavailable. <Link to={returnTo}>Return to {returnLabel}</Link></p>}</LibraryBoundary>
}
