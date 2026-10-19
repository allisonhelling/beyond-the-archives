import { Dropdown } from '../../components/Dropdown'
import { collectionOrderOptions, orderCollections, moveCollectionIds, type CollectionOrder, type CollectionAppearance } from './collection-appearance'
import { SeriesNames } from './SeriesNames'
import { MetadataControls, MetadataRefreshButton } from '../imports/MetadataControls'
import { useMetadataRefresh } from '../imports/useMetadataRefresh'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, ArrowLeft, BookOpen, BookX, Check, FileText, FolderPlus, Info, LockKeyhole, MoreHorizontal, NotebookPen, Pencil, Trash2 } from 'lucide-react'
import { useLibrary } from './LibraryProvider'
import { active, chapterUrl, nextUnread, parseLines, savedWorkUrl, statuses, tagNames, validateProgress, type Collection, type Status, type Story } from './model'
import { reorderCollections, saveStory, updateEntry } from './repository'
import { useDismissible } from '../../components/useDismissible'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { Tooltip } from '../../components/Tooltip'
import { StarRating } from './StarRating'
import { FavoriteButton } from './FavoriteButton'
import { AuthorNames } from './AuthorNames'
import { StoryForm } from './StoryForm'
import { PersonalTagHelp, PersonalTagInput } from './PersonalTagInput'
import { ImportLinkForm } from '../imports/ImportLinkForm'
import { CollectionChoices, NewCollectionButton } from './CollectionChoices'
import { CollectionMembershipDialog } from './CollectionMembershipDialog'
import { NewCollectionDialog } from './NewCollectionDialog'
import { CollectionShelf } from './CollectionShelf'
import { SpineOrnament } from './SpineOrnament'
import { ReadingDashboard } from './ReadingDashboard'
import { publicationStatuses } from './publication-status'

function LibraryBoundary({ children }: { children: ReactNode }) {
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
type CardControls = { rating: ReactNode; actions: ReactNode; favorite: ReactNode; readingStatus: ReactNode; caughtUp: ReactNode; editProgress: ReactNode }
function StoryControls({ story, children }: { story: Story; children: (controls: CardControls) => ReactNode }) {
  const { refresh, markAllRead, markFinished, removeStory } = useLibrary(), navigate = useNavigate(), location = useLocation()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(String(story.last_read_chapter))
  const [progressOpen, setProgressOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const progressId = useId()
  const progressTrigger = useRef<HTMLButtonElement>(null)
  const progressRef = useDismissible<HTMLDivElement>(progressOpen, () => { setProgressOpen(false); setError('') })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useDismissible<HTMLDetailsElement>(menuOpen, () => setMenuOpen(false))
  async function change(changes: Parameters<typeof updateEntry>[1]) {
    setError(''); setBusy(true)
    try { await updateEntry(story.id, changes); await refresh(); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save changes.'); return false }
    finally { setBusy(false) }
  }
  async function markRead() {
    setError(''); setBusy(true)
    try { await markAllRead(story) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not mark chapters as read.') }
    finally { setBusy(false) }
  }
  async function finishStory() {
    setError(''); setBusy(true)
    try { await markFinished(story); setMenuOpen(false) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not mark story as finished.') }
    finally { setBusy(false) }
  }
  async function remove() { await removeStory(story); navigate('/library') }
  function closeRemoval() { setRemoveOpen(false); menuRef.current?.querySelector('summary')?.focus() }
  function closeProgress() { setProgressOpen(false); setError(''); progressTrigger.current?.focus() }
  const editProgress = <div className="progress-editor" ref={progressRef} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeProgress() } }}>
    <button ref={progressTrigger} className="chapter-progress-button" title="Edit chapter progress" aria-label={`Chapter ${story.last_read_chapter} of ${story.metadata.total_chapters ?? '?'} — edit progress`} aria-haspopup="dialog" aria-expanded={progressOpen} aria-controls={progressOpen ? progressId : undefined} disabled={busy} onClick={() => { setProgress(String(story.last_read_chapter)); setError(''); setProgressOpen(!progressOpen) }}><strong>Ch. {story.last_read_chapter} / {story.metadata.total_chapters ?? '?'}</strong></button>
    {progressOpen && <div id={progressId} role="dialog" aria-modal="false" className="progress-popover" aria-label="Edit chapter progress"><form onSubmit={event => { event.preventDefault(); try { if (!progress.trim()) throw new Error('Enter chapters read.'); validateProgress(Number(progress), story.metadata); void change({ last_read_chapter: Number(progress) }).then(saved => { if (saved) closeProgress() }) } catch (e) { setError((e as Error).message) } }}><h2>Edit chapter progress</h2><label>Last fully read chapter<input type="number" autoFocus required min="0" step="1" value={progress} onChange={e => setProgress(e.target.value)} /></label><p>of {story.metadata.total_chapters ?? '?'} · {story.metadata.published_chapters ?? '?'} published</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button primary" disabled={busy}>Save progress</button><button className="button secondary" disabled={busy} type="button" onClick={closeProgress}>Cancel</button></div></form></div>}
  </div>
  const caughtUpDescription = story.metadata.published_chapters === null ? 'Enter published chapter count in details first' : `Mark all chapters as read`
  const caughtUp = <Tooltip description={caughtUpDescription}>{descriptionId => <button className="spine-action caught-up-action" aria-label="Mark as Caught Up" aria-describedby={descriptionId} disabled={busy || story.metadata.published_chapters === null} onClick={() => void markRead()}><Check size={14} aria-hidden="true" /></button>}</Tooltip>
  const favorite = <FavoriteButton selected={story.is_favorite} disabled={busy} onChange={selected => void change({ is_favorite: selected })} />
  const readingStatus = <label className="status-select">Reading status<select aria-label={`Reading status for ${story.metadata.title}`} disabled={busy} value={story.reading_status} onChange={e => void change({ reading_status: e.target.value as Status })}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
  const actions = <div className="story-quick-actions">{favorite}
    <details className="story-menu" ref={menuRef} open={menuOpen} onToggle={event => setMenuOpen(event.currentTarget.open)}>
      <summary aria-label={`Story actions for ${story.metadata.title}`}><MoreHorizontal size={22} /></summary>
      <div className="menu-surface">
        <Link className="menu-item" to={`/stories/${story.id}`} state={location.pathname.startsWith('/stories/') ? location.state : { returnTo: location.pathname + location.search }}><FileText size={16} aria-hidden="true" />View/Edit Details</Link>
        <button className="menu-item" disabled={busy} onClick={() => void finishStory()}><Check size={16} aria-hidden="true" />Mark as Finished</button>
        <button className="menu-item" disabled={busy} onClick={() => { setMenuOpen(false); setCollectionOpen(true) }}><FolderPlus size={16} aria-hidden="true" />Add to collection</button>
        <button className="menu-item" disabled={busy} onClick={() => void change({ reading_status: 'did_not_finish' })}><BookX size={16} aria-hidden="true" />Mark as DNF</button>
        <hr className="menu-divider" />
        <button className="menu-item" disabled={busy} onClick={() => { setMenuOpen(false); setRemoveOpen(true) }}><Trash2 size={16} aria-hidden="true" />Remove from Library</button>
      </div>
    </details></div>
  return <>{children({ actions, favorite, readingStatus, caughtUp, editProgress, rating: <StarRating value={story.personal_rating} disabled={busy} onSave={value => change({ personal_rating: value })} /> })}
    {collectionOpen && <CollectionMembershipDialog story={story} onClose={() => { setCollectionOpen(false); menuRef.current?.querySelector('summary')?.focus() }} />}
    {removeOpen && <ConfirmationDialog title="Remove from Library?" confirmLabel="Remove from Library" onConfirm={remove} onClose={closeRemoval}><p>Remove “{story.metadata.title}” from your library?</p><p>You can undo this for two minutes.</p></ConfirmationDialog>}
    {!progressOpen && error && <p className="error-message" role="alert">{error}</p>}
  </>
}
function BookSpineFooter({ story, editProgress, caughtUp }: { story: Story; editProgress: ReactNode; caughtUp: ReactNode }) {
  const total = story.metadata.total_chapters
  const knownTotal = total !== null && total > 0
  const read = Math.max(0, story.last_read_chapter)
  const next = chapterUrl(story)
  const readLabel = next ? `Read Chapter ${nextUnread(story.last_read_chapter)}` : 'Read on AO3'
  return <footer className="book-spine-footer">
    <div className="spine-progress">
      {editProgress}
      <div className="spine-progress-track" role="progressbar" aria-label="Chapters read" aria-valuemin={0} aria-valuemax={knownTotal ? total : undefined} aria-valuenow={knownTotal ? Math.min(read, total) : undefined} aria-valuetext={knownTotal ? `${read} of ${total} chapters read` : `${read} chapters read; total unknown`}>
        <span className="spine-progress-fill" style={{ width: `${knownTotal ? Math.min(100, read / total * 100) : 0}%` }} />
      </div>
    </div>
    <span className="spine-divider" aria-hidden="true"><SpineOrnament /></span>
    <div className="spine-actions">
      <Tooltip description={`Read chapter ${nextUnread(story.last_read_chapter)}`}>{descriptionId => <a className="spine-action" href={next ?? savedWorkUrl(story)} target="_blank" rel="noreferrer" aria-label={readLabel} aria-describedby={descriptionId}><BookOpen size={16} aria-hidden="true" /></a>}</Tooltip>
      {caughtUp}
    </div>
  </footer>
}
function StoryCard({ story }: { story: Story }) {
  const location = useLocation()
  const origin = { returnTo: location.pathname + location.search }
  const { label: publicationLabel, Icon: PublicationIcon } = publicationStatuses[story.metadata.publication_status]
  return <article className="story-card"><StoryControls story={story}>{({ actions, caughtUp, editProgress }) => <>
    <div className="story-card-title"><h2 aria-label={story.metadata.title}><Link to={`/stories/${story.id}`} state={origin}>{story.metadata.title}</Link>{'\u00a0'}<Tooltip description={publicationLabel}>{descriptionId => <span className="publication-icon" role="img" aria-label={publicationLabel} aria-describedby={descriptionId} tabIndex={0}><PublicationIcon size={18} strokeWidth={1.6} aria-hidden="true" /></span>}</Tooltip></h2>{actions}</div>
    <p className="authors">By <AuthorNames metadata={story.metadata} /></p>
    <p className="muted">{story.metadata.fandoms.join(' · ') || 'Fandom unknown'}</p>
    <p className="story-facts">{story.metadata.rating || 'Rating unknown'} · {story.metadata.word_count?.toLocaleString() ?? '?'} words</p>
    <hr className="story-summary-divider" />
    {story.metadata.summary && <p className="story-summary">{story.metadata.summary}</p>}
    <Link className="story-details-link clickable-text" to={`/stories/${story.id}`} state={origin}>See Full Details…</Link>
    <BookSpineFooter story={story} editProgress={editProgress} caughtUp={caughtUp} />
  </>}</StoryControls></article>
}
const shelves = [['all', 'All Works'], ['currently_reading', 'Currently Reading'], ['to_read', 'To Read'], ['favorites', 'Favorites'], ['finished', 'Finished'], ['did_not_finish', 'Did Not Finish']] as const
export function LibraryPage({ reading = false }: { reading?: boolean }) {
  const { stories } = useLibrary()
  if (reading) return <><div className="page-heading"><div><span className="eyebrow accent">YOUR PRIVATE READING SPACE</span><h1>Currently Reading</h1><p>A little escape, one chapter at a time.</p></div><Link className="button primary library-create-action" to="/add?mode=finished">Add Story</Link></div><LibraryBoundary><ReadingDashboard stories={stories} renderStory={story => <StoryCard key={story.id} story={story} />} /></LibraryBoundary></>
  return <LibraryContent />
}
const collectionControlHelp = 'Command-click (Mac) or Control-click (Windows) a collection to edit it directly, or edit the group when multiple collections are selected.\nSelect collections, then click or tap books to select or deselect.\nShift + click or drag: select a range.\nStart Shift-drag on a selected book to deselect a range.\nRelease Shift. Drag a selected book: move the selected group.\nAlt + Left/Right Arrow: move a book or group.\nEscape: cancel dragging.\nEdit selected: change appearance or delete. Cancel selection: clear the selection.'

const collectionSortKey = 'between-chapters:collection-sort:v1'
type CollectionSort = { order: CollectionOrder }
function initialCollectionSort(): CollectionSort {
  try {
    const saved = JSON.parse(window.localStorage.getItem(collectionSortKey) ?? 'null')
    if (collectionOrderOptions.some(option => option.value === saved?.order)) return { order: saved.order }
  } catch { /* Sorting still works when browser storage is unavailable. */ }
  return { order: 'created_newest' }
}

function LibraryContent() {
  const { stories, collections, refresh } = useLibrary()
  const [params, setParams] = useSearchParams()
  const selected = params.get('shelf') ?? 'all'
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [collectionSort, setCollectionSort] = useState(initialCollectionSort)
  useEffect(() => {
    try { window.localStorage.setItem(collectionSortKey, JSON.stringify(collectionSort)) }
    catch { /* Keep the current sort when browser storage is unavailable. */ }
  }, [collectionSort])
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
  const customCollections = collections.filter(item => !item.default_key)
  const selectedCollections = customCollections.filter(item => selectedCollectionIds.includes(item.id))
  function changeCollectionSort(order: CollectionOrder) {
    setCollectionSort({ order })
    setEditingCollections(false)
    clearCollectionSelection()
  }
  // Display sorts never change the saved manual positions.
  const displayedCollections = orderCollections(customCollections, stories, collectionSort.order)
  function toggleCollectionEditing() {
    if (!editingCollections) setCollectionSort({ order: 'manual' })
    setEditingCollections(!editingCollections)
    clearCollectionSelection()
  }
  function editCollection(id: string, appearance: CollectionAppearance, shiftKey: boolean, direct = false) {
    const item = customCollections.find(item => item.id === id)
    if (!item) return
    if (direct && selectedCollections.length > 1) { setBulkCollections(selectedCollections); return }
    if (!direct && (shiftKey || selectingCollections)) {
      if (!editingCollections) { setEditingCollections(true); setCollectionSort({ order: 'manual' }) }
      setSelectingCollections(true)
      const anchor = selectionAnchor.current
      setSelectedCollectionIds(previous => {
        if (shiftKey && anchor && anchor !== id) {
          const ids = displayedCollections.map(item => item.id), from = ids.indexOf(anchor), to = ids.indexOf(id)
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
    const ids = collections.filter(item => !item.default_key).map(item => item.id)
    const ordered = moveCollectionIds(ids, id, targetId, selectedCollectionIds)
    if (ordered === ids) return
    await collectionAction(() => reorderCollections(ordered))
  }
  async function collectionAction(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); await refresh() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const collection = collections.find(c => c.id === selected)
  function storiesForShelf(key: string) {
    const custom = collections.some(item => item.id === key)
    return stories.filter(story => {
      if (key === 'currently_reading') return active(story)
      if (key === 'complete') return story.metadata.publication_status === 'complete'
      if (key === 'new') return false // No verified update events are ingested during Phase 2.
      if (key === 'waiting') return story.reading_status === 'waiting_for_updates'
      if (key === 'to_read' || key === 'finished' || key === 'did_not_finish') return story.reading_status === key
      if (key === 'favorites') return story.is_favorite
      if (custom) return story.collectionIds.includes(key)
      return true
    })
  }
  const shelfStories = storiesForShelf(selected)
  const shelfItems = [...shelves.map(([id, name]) => ({ id, name })), ...displayedCollections]
    .map(item => ({ ...item, count: storiesForShelf(item.id).length }))

  return <><div className="page-heading library-heading"><div><span className="eyebrow accent">YOUR PRIVATE READING SPACE</span><div className="library-title-row"><h1>Your Library</h1>
    {editingCollections && <div className="collection-selection-toolbar" aria-label="Collection selection">
      <button type="button" className="button secondary" aria-pressed={selectingCollections} onClick={() => selectingCollections ? clearCollectionSelection() : setSelectingCollections(true)}>{selectingCollections ? 'Cancel selection' : 'Select collections'}</button>
      <span className="collection-selection-trigger">{selectingCollections && <span role="status">{selectedCollectionIds.length} selected</span>}<Tooltip description={collectionControlHelp}>{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label="Collection controls" aria-describedby={descriptionId}><Info size={16} aria-hidden="true" /></button>}</Tooltip></span>
      {selectingCollections && <button type="button" className="button secondary" disabled={!selectedCollectionIds.length} onClick={() => setBulkCollections(selectedCollections)}>Edit selected</button>}
    </div>}
    <div className="library-heading-actions">
      <Link className="button primary library-create-action" to="/add?mode=finished">Add Story</Link>
      <button ref={editButton} type="button" className="button secondary library-create-action" disabled={busy} aria-pressed={editingCollections} onClick={toggleCollectionEditing}>{editingCollections ? 'Done Editing' : 'Edit Collections'}</button>
      <Dropdown label="Sort" icon={ArrowDownWideNarrow} compact value={collectionSort.order} options={[...collectionOrderOptions]} onChange={value => changeCollectionSort(value as CollectionOrder)} disabled={busy || !customCollections.length} closeOnSelect />
    </div></div><p>A home for all the worlds you want to keep.</p></div></div><LibraryBoundary>
    <CollectionShelf editing={editingCollections} selecting={selectingCollections} selectedIds={selectedCollectionIds} onSelectionChange={ids => { setSelectingCollections(true); setSelectedCollectionIds(ids); selectionAnchor.current = null }} onEdit={editCollection} onMove={(id, target) => void moveCollection(id, target)} items={shelfItems} selected={selected} disabled={busy} onSelect={key => setParams({ shelf: key })} />
    {collection && <div className="collection-heading"><h2>{collection.name}</h2>{collection.description && <p className="collection-summary">{collection.description}</p>}</div>}
    {error && <p role="alert" className="error-message">{error}</p>}
    <ReadingDashboard mode="library" stories={shelfStories} renderStory={story => <StoryCard key={story.id} story={story} />} resultsActions={collection && !collection.default_key && <button ref={addStoriesTrigger} type="button" className="button secondary button-small" onClick={() => setAddingToCollection(collection)}>Add Story</button>} />
  </LibraryBoundary>{addingToCollection && <CollectionMembershipDialog collection={addingToCollection} onClose={() => { setAddingToCollection(null); addStoriesTrigger.current?.focus() }} />}{bulkCollections && <NewCollectionDialog selectedCollections={bulkCollections} onClose={() => { setBulkCollections(null); clearCollectionSelection(); editButton.current?.focus() }} onDeleted={() => { if (bulkCollections.some(item => item.id === selected)) setParams({ shelf: 'all' }) }} />}{editingCollection && <NewCollectionDialog collection={editingCollection} onClose={() => setEditingCollection(null)} onDeleted={() => { if (selected === editingCollection.id) setParams({ shelf: 'all' }) }} />}</>
}
export function AddStoryPage() {
  const [params, setParams] = useSearchParams()
  const importing = params.get('import') !== 'manual'
  return <><div className="page-heading"><div><h1>Add Story</h1><p>Import metadata from an AO3 link or enter information by hand.</p></div></div><LibraryBoundary>
    <div className="library-toolbar"><button type="button" className="button secondary" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('import', importing ? 'manual' : 'link'); return next })}>{importing ? 'Enter manually' : 'Import from link'}</button></div>
    {importing ? <ImportLinkForm /> : <StoryForm />}
  </LibraryBoundary></>
}
function MetadataTags({ values }: { values: string[] }) {
  return values.length ? <span className="metadata-tags">{values.map(value => <span className="metadata-tag" key={value}>{value}</span>)}</span> : <>None saved</>
}
function PersonalStoryField({ story, field }: { story: Story; field: 'notes' | 'tags' | 'collections' }) {
  const library = useLibrary()
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [text, setText] = useState(''), [collections, setCollections] = useState<string[]>([])
  const trigger = useRef<HTMLButtonElement>(null)
  const label = { notes: 'Private notes', tags: 'Personal tags', collections: 'Custom collections' }[field]
  function open() { setText(field === 'notes' ? story.notes : story.personalTags.join('\n')); setCollections(story.collectionIds); setError(''); setEditing(true) }
  function close() { setEditing(false); trigger.current?.focus() }
  async function save() {
    setBusy(true); setError('')
    try {
      if (field === 'notes') await updateEntry(story.id, { notes: text })
      else await saveStory({ id: story.id, url: savedWorkUrl(story), metadata: story.metadata, metadataChanges: {}, status: story.reading_status, progress: story.last_read_chapter, notes: story.notes, personalRating: story.personal_rating, favorite: story.is_favorite, collections: field === 'collections' ? collections : story.collectionIds, tags: field === 'tags' ? parseLines(text) : story.personalTags })
      await library.refresh(); close()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save changes.') }
    finally { setBusy(false) }
  }
  const note = field === 'notes'
  const heading = note ? <div className="note-heading">{(story.notes || editing) && <><span><NotebookPen size={18} aria-hidden="true" />Your note</span><span className="note-private"><LockKeyhole size={14} aria-hidden="true" />private</span></>}{!editing && <button ref={trigger} type="button" className={`text-button inline-edit${story.notes ? '' : ' clickable-text'}`} onClick={open} aria-label={story.notes ? 'Edit note' : 'Add a note'}>{story.notes ? <Pencil size={16} aria-hidden="true" /> : <NotebookPen size={18} aria-hidden="true" />}{story.notes ? 'Edit' : 'Add a note'}</button>}</div> : <>
    {!editing && <button ref={trigger} type="button" className="icon-button inline-edit-icon" aria-label={`Edit ${field === 'tags' ? 'personal tags' : 'collections'}`} onClick={open}><Pencil size={12} aria-hidden="true" /></button>}
    {editing && field === 'collections' && <NewCollectionButton iconOnly disabled={busy} onCreated={id => setCollections(current => [...current, id])} />}
  </>
  const content = <>
    {editing ? <form className="inline-personal-form" onSubmit={event => { event.preventDefault(); void save() }}><fieldset disabled={busy}>
      {field === 'collections' ? <CollectionChoices collections={library.collections} selected={collections} onChange={setCollections} /> : field === 'tags' ? <PersonalTagInput value={parseLines(text)} onChange={tags => setText(tags.join('\n'))} /> : <label className="note-input-label"><span className="sr-only">{label}</span><textarea autoFocus rows={4} value={text} placeholder="e.g. left off on a cliffhanger — waiting to see what happens next chapter." onChange={event => setText(event.target.value)} /></label>}
      <div className="form-actions"><button className="button primary" type="submit">{busy ? 'Saving…' : 'Save'}</button><button className="text-button" type="button" onClick={close}>Cancel</button></div>
    </fieldset></form> : note ? story.notes && <p className="story-summary">{story.notes}</p> : field === 'tags' ? <MetadataTags values={story.personalTags} /> : <MetadataTags values={library.collections.filter(c => story.collectionIds.includes(c.id)).map(c => c.name)} />}
    {error && <p className="error-message" role="alert">{error}</p>}
  </>
  return note ? <div className={`inline-personal-field note-panel ${story.notes || editing ? 'note-panel-filled' : ''}`}>{heading}{content}</div> : <><dt className="editable-field-heading">{label}{field === 'tags' && <PersonalTagHelp />}{heading}</dt><dd className="inline-personal-field">{content}</dd></>

}
export function StoryDetailsPage() {
  const { id } = useParams(), library = useLibrary(), location = useLocation(), [params, setParams] = useSearchParams()
  const edit = params.get('edit'), editing = edit === 'metadata' || edit === 'reading' ? edit : null
  function editSection(section: 'metadata' | 'reading' | null) { setParams(section ? { edit: section } : {}, { state: location.state }) }
  const candidate = location.state?.returnTo
  const returnTo = typeof candidate === 'string' && /^\/(?:reading|library)(?:\?[^#]*)?$/.test(candidate) ? candidate : '/library'
  const returnLabel = returnTo.startsWith('/reading') ? 'Currently Reading' : 'Library'
  const story = library.stories.find(s => s.id === id)
  const metadataRefresh = useMetadataRefresh(story)
  const metadataRefreshProps = { ...metadataRefresh, onRefresh: () => void metadataRefresh.refresh() }
  return <LibraryBoundary>{story ? <StoryControls story={story}>{({ favorite, readingStatus, caughtUp, editProgress, rating }) => <div className="story-details-page">
    <div className="page-heading story-details-heading"><div>
      <Link className="story-return-link clickable-text" to={returnTo} aria-label={`Back to ${returnLabel}`}><ArrowLeft size={16} aria-hidden="true" />{returnLabel}</Link>
      {!editing && !!story.metadata.series?.length && <p className="story-series-eyebrow"><SeriesNames metadata={story.metadata} /></p>}
      <div className="story-title-row">
        <h1><a href={savedWorkUrl(story)} target="_blank" rel="noreferrer">{story.metadata.title}</a></h1>
        <p className="story-details-authors">By <AuthorNames metadata={story.metadata} /></p>
        {!editing && <>{favorite}<div className="story-metadata-actions"><MetadataRefreshButton {...metadataRefreshProps} variant="button" /><button className="button secondary story-metadata-edit" aria-label="Edit AO3 metadata" onClick={() => editSection('metadata')}><Pencil size={14} aria-hidden="true" />Edit</button></div></>}
      </div>
      {!editing && <>
        <p className="details-fandom-rating">{story.metadata.fandoms.join(' · ') || 'Fandom unknown'} · {story.metadata.rating || 'Rating unknown'}</p>
        <dl className="details-story-stats">
          <div><dt>Word count</dt><dd><strong>{story.metadata.word_count?.toLocaleString() ?? '?'}</strong> words</dd></div>
          <div><dt>Published / total chapters</dt><dd><strong>{story.metadata.published_chapters ?? '?'} / {story.metadata.total_chapters ?? '?'}</strong> chapters</dd></div>
          <div><dt>Publication status</dt><dd><strong>{publicationStatuses[story.metadata.publication_status].label}</strong></dd></div>
        </dl>
      </>}
    </div></div>
    {editing ? <StoryForm key={`${story.id}-${editing}`} story={story} section={editing} onCancel={() => editSection(null)} /> : <>
      <section className="settings-card details-progress-panel" aria-label="Reading and organization">
        <div className="story-section-heading"><h2>Your progress</h2></div>
        <BookSpineFooter story={story} editProgress={editProgress} caughtUp={caughtUp} />
        <div className="details-reading-controls">{readingStatus}{rating}</div>
      </section>
      <section className="details-private-notes" aria-label="Private notes"><PersonalStoryField key={story.id} story={story} field="notes" /></section>
      <section className="settings-card details-fic-panel" aria-label="Story information">
        <dl className="metadata-list details-fic-fields">
          <div><dt>Summary</dt><dd className="story-summary story-details-summary">{story.metadata.summary || 'No summary saved.'}</dd></div>
          <div><dt>Fandoms</dt><dd><MetadataTags values={story.metadata.fandoms} /></dd></div>
          <div><dt>Relationships</dt><dd><MetadataTags values={tagNames(story.metadata, 'relationship')} /></dd></div>
          <div><dt>Characters</dt><dd><MetadataTags values={tagNames(story.metadata, 'character')} /></dd></div>
          <div><dt>Additional Tags</dt><dd><MetadataTags values={tagNames(story.metadata, 'freeform')} /></dd></div>
          <div><dt className="sr-only">All tags</dt><dd><details className="details-disclosure"><summary>All tags</summary><MetadataTags values={story.metadata.ao3_tags} /></details></dd></div>
          <div><PersonalStoryField key={story.id} story={story} field="collections" /></div>
          <div><PersonalStoryField key={story.id} story={story} field="tags" /></div>
          <div><dt>Saved</dt><dd>{new Date(story.created_at).toLocaleString()}</dd></div>
          <div><dt>Last edited</dt><dd>{new Date(story.updated_at).toLocaleString()}</dd></div>
          <div><dt>Series</dt><dd><SeriesNames metadata={story.metadata} /></dd></div>
        </dl>
        <details className="details-disclosure"><summary>Other metadata</summary><p className="muted">Manually entered values are private field-level overrides.</p>
        <dl className="metadata-list">
          <div><dt>AO3 work ID</dt><dd>{story.work.ao3_work_id}</dd></div>
          <div><dt>Authors</dt><dd><AuthorNames metadata={story.metadata} /></dd></div>
          <div><dt>AO3 rating</dt><dd>{story.metadata.rating || 'Unknown'}</dd></div>
          <div><dt>AO3 last updated</dt><dd>{story.work.ao3_updated_at ? new Date(story.work.ao3_updated_at).toLocaleString() : 'Unknown'}</dd></div>
          <div><dt>Metadata last checked</dt><dd>{story.work.last_metadata_check ? new Date(story.work.last_metadata_check).toLocaleString() : 'Never'}</dd></div>
          <div><dt>Verified canonical URL</dt><dd><ExternalUrl url={story.work.canonical_url} /></dd></div>
          <div><dt>Original provided URL</dt><dd><ExternalUrl url={story.original_url} fallback="Unavailable" /></dd></div>
          {savedWorkUrl(story) !== story.original_url && <div><dt>Updated provided URL</dt><dd><ExternalUrl url={savedWorkUrl(story)} /></dd></div>}
        </dl></details>
      </section>
      <MetadataControls story={story} refreshButton={<MetadataRefreshButton {...metadataRefreshProps} />} refreshMessage={metadataRefresh.message} />
    </>}
  </div>}</StoryControls> : <p>Story unavailable. <Link to={returnTo}>Return to {returnLabel}</Link></p>}</LibraryBoundary>
}
