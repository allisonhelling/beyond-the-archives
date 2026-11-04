import { useWorkMenuPosition } from '../../components/useWorkMenuPosition'
import { CollectionBrowser } from './collections/CollectionBrowser'
import { ChapterProgress } from './ChapterProgress'
import { ExportWorkMetadata } from './ExportWorkMetadata'
import { BulletSeparated } from './BulletSeparated'
import { WaybackLink } from './WaybackPage'
import { ReadEpub } from '../offline/ReaderControls'
import { useActivity } from '../../lib/use-activity'
import { BookFusionButton } from './bookfusion/BookFusionFields'
import { RetryError } from '../../components/RetryError'
import { ChapterReadingHistory } from './ChapterReadingHistory'
import { OtherWorkMetadata } from './display/OtherWorkMetadata'
import { workMetadataFields } from './display/WorkMetadataFields'
import { isDisplayFieldHidden } from './display/display-settings'
import { BookmarkRec } from './BookmarkRec'
import { resumeReadingStatus } from './reading-history'
import { MetadataTags } from './MetadataTags'
import { CustomCollectionNames } from './collections/CustomCollectionNames'
import { DisplayInfo } from './display/DisplayInfo'
import { formatDateTime } from '../../lib/dates'
import { useStorySnapshot } from './useStorySnapshot'
import { browsingReturnTo } from './browsing/browsing'
import { CompletedImportSeriesNotice } from '../imports/ImportedSeriesNotice'
import { PersonalNote } from './PersonalNote'
import { SeriesCard } from './series/SeriesCollection'
import { filterLibraryItems, seriesItemId } from './series/series-search'
import { EditConflictReview } from './EditConflictReview'
import { editSnapshot, EditConflict, type EditValues } from './edit-merge'
import { OneShotIndicator } from './OneShotIndicator'
import { readingStatusIcons } from './collections/collection-appearance'
import { SeriesNames } from './series/SeriesNames'
import { MetadataControls, MetadataRefreshButton } from '../imports/MetadataControls'
import { useMetadataRefresh } from '../imports/useMetadataRefresh'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, BookX, Check, FileText, FolderPlus, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useLibrary } from './LibraryProvider'
import { ao3Date, ratingLabel, chapterUrl, readChapter, readingUrl, parseLines, savedWorkUrl, statuses, type Status, type Story } from './model'
import { saveStory, saveStoryCollections, updateEntry } from './repository'
import { useDismissible } from '../../components/useDismissible'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { useLayout } from '../../lib/use-layout'
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
import { SpineOrnament } from './collections/SpineOrnament'
import { ReadingDashboard } from './ReadingDashboard'
import { PublicationStatusIndicator } from './PublicationStatusIndicator'
import { publicationStatuses } from './publication-status'

export function LibraryBoundary({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useLibrary()
  if (loading) return <p role="status">Loading your library…</p>
  if (error) return <RetryError message={error} onRetry={() => void refresh().catch(() => {})} />
  return children
}
type CardControls = { rating: ReactNode; actions: ReactNode; favorite: ReactNode; rec: ReactNode; readingStatus: ReactNode; caughtUp: ReactNode; editProgress: ReactNode; collectionsField: ReactNode }
type MarkingHandler = (field: 'favorite' | 'rec', value: boolean) => Promise<void>
function StoryControls({ story, children, readOnly = false, onMarking, details = false }: { details?: boolean; onMarking?: MarkingHandler; readOnly?: boolean; story: Story; children: (controls: CardControls) => ReactNode }) {
  const { collections, refreshStory, markAllRead, markFinished, removeStory } = useLibrary(), navigate = useNavigate(), location = useLocation()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useActivity(Boolean(busy), 'Updating your library…')
  const [conflict, setConflict] = useState<EditConflict | null>(null)
  const blocked = readOnly || busy || Boolean(conflict)
  const editBase = useRef(editSnapshot(story))
  function failed(error: unknown, fallback = 'Could not save changes.') {
    if (error instanceof EditConflict) setConflict(error)
    else setError(error instanceof Error ? error.message : fallback)
  }
  const [shelfParams] = useSearchParams()
  const collection = collections.find(item => item.id === shelfParams.get('shelf') && !item.default_key && !item.automatic_rules && story.collectionIds.includes(item.id))
  async function removeFromCollection() {
    setBusy(true); setError('')
    try {
      await saveStoryCollections(story, story.collectionIds.filter(id => id !== collection?.id), story.collectionIds)
      await refreshStory(story.id); setMenuOpen(false)
    } catch (error) { failed(error, 'Could not remove the story from this collection.') } finally { setBusy(false) }
  }
  const [removeOpen, setRemoveOpen] = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Populate menus on first use, then retain nested export dialogs when dismissed.
  const [menuLoaded, setMenuLoaded] = useState(false)
  const menuRef = useDismissible<HTMLDetailsElement>(menuOpen, () => setMenuOpen(false))
  useWorkMenuPosition(menuRef, menuOpen)
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
  async function changePublication(publication_status: 'hiatus' | 'abandoned') {
    setError(''); setBusy(true)
    try {
      await saveStory({ id: story.id, base: editSnapshot(story), url: savedWorkUrl(story), metadata: { ...story.metadata, publication_status }, metadataChanges: { publication_status }, status: story.reading_status, progress: story.last_read_chapter, notes: story.notes, personalRating: story.personal_rating, favorite: story.is_favorite, rec: story.is_rec, collections: story.collectionIds, tags: story.personalTags })
      await refreshStory(story.id); setMenuOpen(false)
    } catch (error) { failed(error) } finally { setBusy(false) }
  }
  async function finishStory() {
    setError(''); setBusy(true)
    try { await markFinished(story); setMenuOpen(false) }
    catch (e) { failed(e, 'Could not mark story as finished.') }
    finally { setBusy(false) }
  }
  async function remove() { await removeStory(story); navigate(location.pathname.startsWith('/stories/') ? browsingReturnTo(location.state?.returnTo) : location.pathname + location.search, { replace: !location.pathname.startsWith('/stories/') }) }
  function closeRemoval() { setRemoveOpen(false); menuRef.current?.querySelector('summary')?.focus() }
  const editProgress = <ChapterProgress progress={story.last_read_chapter} status={story.reading_status} metadata={story.metadata} disabled={blocked} onOpen={() => { editBase.current = editSnapshot(story) }} onSave={(progress, reading_status) => change({ last_read_chapter: progress, reading_status }, editBase.current)} />
  const tilePreference = useDisplayPreference('workTile')
  const finished = story.reading_status === 'finished'
  const caughtUpDescription = finished ? 'Begin Re-Reading' : story.metadata.published_chapters === null ? 'Enter published chapter count in details first' : 'Mark all chapters as read'
  const CaughtUpIcon = finished ? RotateCcw : Check
  const caughtUp = <Tooltip description={caughtUpDescription}>{descriptionId => <button className="spine-action caught-up-action" aria-label={finished ? 'Begin Re-Reading' : 'Mark as Caught Up'} aria-describedby={descriptionId} disabled={blocked || !finished && story.metadata.published_chapters === null} onClick={() => finished ? void change({ reading_status: 're_reading', last_read_chapter: 0 }) : void markRead()}><CaughtUpIcon size={14} aria-hidden="true" /></button>}</Tooltip>
  async function mark(field: 'favorite' | 'rec', value: boolean) {
    if (!onMarking) { await change(field === 'favorite' ? { is_favorite: value } : { is_rec: value }); return }
    setBusy(true); setError('')
    try { await onMarking(field, value) } catch (error) { failed(error) } finally { setBusy(false) }
  }
  const favorite = <FavoriteButton selected={story.is_favorite} disabled={busy || Boolean(conflict) || (readOnly && !onMarking)} onChange={selected => void mark('favorite', selected)} />
  const rec = <BookmarkRec story={story} disabled={busy || Boolean(conflict) || (readOnly && !onMarking)} onChange={selected => void mark('rec', selected)} />
  const StatusIcon = readingStatusIcons[story.reading_status]
  const readingStatus = details ? <label className="status-select"><span className="details-control-heading">Reading Status</span><span className="reading-status-value"><StatusIcon size={18} aria-hidden="true" /><select aria-label={`Reading Status for ${story.metadata.title}`} disabled={blocked} value={story.reading_status} onChange={e => e.target.value === 'finished' ? void finishStory() : void change({ reading_status: e.target.value as Status, ...(e.target.value === 're_reading' && { last_read_chapter: 0 }) })}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></span></label> : null
  const hiddenMarkings = (['favorite', 'rec'] as const).filter(kind => isDisplayFieldHidden(tilePreference, kind))
  const actions = <div className="story-quick-actions"><DisplayInfo group="workTile" fields={['favorite', 'rec']}>{{ favorite, rec }}</DisplayInfo>
    {(!readOnly || hiddenMarkings.length > 0) && <details className="story-menu" ref={menuRef} open={menuOpen} onToggle={event => { const open = event.currentTarget.open; if (open) setMenuLoaded(true); setMenuOpen(open) }}>
      <summary aria-label={`Story Actions for ${story.metadata.title}`}><MoreHorizontal size={22} /></summary>
      {menuLoaded && <div className="menu-surface">
        {hiddenMarkings.map(kind => <PersonalToggleButton key={kind} kind={kind} menu selected={kind === 'favorite' ? story.is_favorite : story.is_rec} disabled={busy || Boolean(conflict) || (readOnly && !onMarking)} onChange={selected => void mark(kind, selected)} />)}
        {!readOnly && <>{(['hiatus', 'abandoned'] as const).map(publication_status => <button key={publication_status} type="button" disabled={blocked} onClick={() => void changePublication(publication_status)}>Change Status to {publication_status === 'hiatus' ? 'On Hiatus' : 'Abandoned'}</button>)}<ExportWorkMetadata story={story} menu disabled={blocked} />
        <WaybackLink url={savedWorkUrl(story)} menu />
        <Link className="menu-item" to={`/stories/${story.id}`} state={location.pathname.startsWith('/stories/') ? location.state : { returnTo: location.pathname + location.search }}><FileText size={16} aria-hidden="true" />View/Edit Details</Link>
        {['reading', 're_reading'].includes(story.reading_status) && <button className="menu-item" disabled={blocked} onClick={() => void change({ reading_status: 'paused_reading' })}><readingStatusIcons.paused_reading size={16} aria-hidden="true" />Mark as Paused Reading</button>}
        {story.reading_status === 'paused_reading' && <button className="menu-item" disabled={blocked} onClick={() => void change({ reading_status: resumeReadingStatus(story) })}><readingStatusIcons.reading size={16} aria-hidden="true" />Resume Reading</button>}
        {['reading', 're_reading'].includes(story.reading_status) && <button className="menu-item" disabled={blocked} onClick={() => void finishStory()}><Check size={16} aria-hidden="true" />Mark as Finished</button>}
        <button className="menu-item" disabled={blocked} onClick={() => void change({ reading_status: 'did_not_finish' })}><BookX size={16} aria-hidden="true" />Mark as DNF</button>
        <button className="menu-item" disabled={blocked} onClick={() => { setMenuOpen(false); setCollectionOpen(true) }}><FolderPlus size={16} aria-hidden="true" />Add to Collection</button>
        {collection && <button className="menu-item" disabled={blocked} onClick={() => void removeFromCollection()}><FolderPlus size={16} aria-hidden="true" />Remove from Collection</button>}
        <hr className="menu-divider" />
        <button className="menu-item" disabled={blocked} onClick={() => { setMenuOpen(false); setRemoveOpen(true) }}><Trash2 size={16} aria-hidden="true" />Remove from Library</button></>}
      </div>}
    </details>}</div>
  if (readOnly) return <>{children({ actions, favorite, rec, readingStatus: null, caughtUp, editProgress: <button className="chapter-progress-button" disabled>Ch. {story.last_read_chapter} / {story.metadata.published_chapters ?? '?'}</button>, collectionsField: null, rating: <StarRating value={story.personal_rating} /> })}{error && <p role="alert" className="error-message">{error}</p>}</>
  return <>{children({ actions, favorite, rec, readingStatus, caughtUp, editProgress, collectionsField: details ? <EditCollectionsButton onRefresh={() => refreshStory(story.id)} variant="field" disabled={blocked} automaticIds={story.automaticCollectionIds} selectedIds={story.collectionIds} description={`Choose collections for “${story.metadata.title}”.`} onSave={(collections, baseline) => saveStoryCollections(story, collections, baseline).then(() => {})} /> : null, rating: details ? <StarRating headingClassName="details-control-heading" value={story.personal_rating} disabled={blocked} onEdit={() => { editBase.current = editSnapshot(story) }} onSave={value => change({ personal_rating: value }, editBase.current)} /> : null })}
    {conflict && <EditConflictReview key={JSON.stringify(conflict.review)} conflict={conflict} onError={failed} onSaved={async () => { setConflict(null); await refreshStory(story.id) }} onCancel={() => setConflict(null)} />}
    {collectionOpen && <CollectionMembershipDialog story={story} onClose={() => { setCollectionOpen(false); menuRef.current?.querySelector('summary')?.focus() }} />}
    {removeOpen && <ConfirmationDialog title="Remove from Library?" confirmLabel="Remove from Library" onConfirm={remove} onClose={closeRemoval}><p>Remove “{story.metadata.title}” from your library?</p><p>You can undo this for two minutes.</p></ConfirmationDialog>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </>
}
function BookSpineFooter({ story, editProgress, caughtUp, readAction }: { story: Story; editProgress: ReactNode; caughtUp: ReactNode; readAction?: ReactNode }) {
  const StatusIcon = readingStatusIcons[story.reading_status]
  const published = story.metadata.published_chapters
  const knownPublished = published !== null && published > 0
  const read = Math.max(0, story.last_read_chapter)
  const next = chapterUrl(story), position = readChapter(story)
  const readLabel = next ? `Read Chapter ${position}` : 'Read on AO3'
  return <footer className="book-spine-footer">
    <div className="spine-progress">
      {editProgress}
      <div className="spine-progress-track" role="progressbar" aria-label="Chapters Read" aria-valuemin={0} aria-valuemax={knownPublished ? published : undefined} aria-valuenow={knownPublished ? Math.min(read, published) : undefined} aria-valuetext={knownPublished ? `${read} of ${published} chapters read` : `${read} chapters read; published chapter count unknown`}>
        <span className="spine-progress-fill" style={{ width: `${knownPublished ? Math.min(100, read / published * 100) : 0}%` }} />
      </div>
    </div>
    <Tooltip description={statuses[story.reading_status]}>{descriptionId => <span className="spine-status" role="img" tabIndex={0} aria-label={statuses[story.reading_status]} aria-describedby={descriptionId}><StatusIcon size={18} aria-hidden="true" /></span>}</Tooltip>
    <span className="spine-divider" aria-hidden="true"><SpineOrnament /></span>
    <div className="spine-actions">
      {readAction ?? <Tooltip description={`Read Chapter ${position}`}>{descriptionId => <a className="spine-action" href={readingUrl(story)} target="_blank" rel="noreferrer" aria-label={readLabel} aria-describedby={descriptionId}><BookOpen size={16} aria-hidden="true" /></a>}</Tooltip>}
      {caughtUp}
      <BookFusionButton value={story.metadata.bookfusion_link} />
    </div>
  </footer>
}
export function StoryCard({ story: candidate, linkId, readOnly = false, readerBookId, onMarking }: { onMarking?: MarkingHandler; story: Story; linkId?: string; readOnly?: boolean; readerBookId?: string }) {
  const location = useLocation()
  const tilePreference = useDisplayPreference('workTile')
  const story = useStorySnapshot(candidate)!
  const metadataFields = useMemo(() => story.detailsLoaded === false ? {} : workMetadataFields(story, 'tile', tilePreference), [story, tilePreference])
  if (story.detailsLoaded === false) return <article className="story-card work-card" aria-busy="true"><p role="status">Loading work details…</p></article>
  const origin = { returnTo: location.pathname + location.search }
  return <article className="story-card work-card" data-story-id={story.id}><StoryControls story={story} readOnly={readOnly} onMarking={onMarking}>{({ actions, caughtUp, editProgress }) => <>
    <DisplayInfo group="workTile" heading={<div className="story-card-title"><h2 aria-label={story.metadata.title}>{readOnly ? <span id={linkId}>{story.metadata.title}</span> : <Link id={linkId ?? `work-link-${story.id}`} to={`/stories/${story.id}`} state={origin}>{story.metadata.title}</Link>}{'\u00a0'}<PublicationStatusIndicator status={story.metadata.publication_status} /><OneShotIndicator story={story} /></h2>{actions}</div>}>{{
      ...metadataFields,
      personalRating: <div className="tile-personal-rating"><StarRating value={story.personal_rating} /></div>,
      collections: <div className="story-facts"><CustomCollectionNames ids={[...story.collectionIds, ...(story.automaticCollectionIds ?? [])]} /></div>,
      notes: <p className="story-summary">{story.notes || 'No private notes saved.'}</p>,
      reading: <p className="story-facts">{statuses[story.reading_status]}</p>,
      saved: !isDisplayFieldHidden(tilePreference, 'saved') && <p className="story-facts">Saved: {formatDateTime(story.created_at)}</p>,
      progress: <BookSpineFooter story={story} editProgress={editProgress} caughtUp={caughtUp} readAction={readOnly ? <ReadEpub workId={story.work.ao3_work_id} bookId={readerBookId} variant="spine" chapter={readChapter(story)} /> : undefined} />
    }}</DisplayInfo>
  </>}</StoryControls></article>
}
export function LibraryPage({ reading = false }: { reading?: boolean }) {
  const { stories } = useLibrary()
  if (reading) return <LibraryBoundary><ReadingDashboard stories={stories} renderHeader={actions => <div className="page-heading library-heading"><div className="library-title-row reading-title-row"><h1>Currently Reading</h1><div className="library-heading-actions">{actions}</div></div></div>} renderStory={(story, linkId) => <StoryCard key={story.id} story={story} linkId={linkId} />} /></LibraryBoundary>
  return <LibraryContent />
}
export function AuthorPage() {
  const { name = '' } = useParams<{ name: string }>()
  const { stories } = useLibrary()
  return <LibraryBoundary><ReadingDashboard key={name} mode="library" author={name} stories={stories}
    renderHeader={(actions, count) => <div className="page-heading library-heading"><div><div className="library-title-row"><h1>{name}</h1><div className="library-heading-actions">{actions}</div></div><p>{count ?? '—'} {count === 1 ? 'fic' : 'fics'} saved in your library</p></div></div>}
    renderStory={(story, linkId) => <StoryCard key={story.id} story={story} linkId={linkId} />} /></LibraryBoundary>
}
function LibraryContent() {
  return <CollectionBrowser>{({ selected, editingCollections, renderHeader, shelfStories, shelfSeries }) => {
    const seriesById = new Map(shelfSeries.map(series => [seriesItemId(series), series]))
    return <LibraryBoundary><ReadingDashboard showActions={!editingCollections} renderHeader={renderHeader} mode={selected === 'series' ? 'series' : 'library'} stories={shelfStories} filterItems={(pool, filters) => filterLibraryItems(pool, { ...filters, showSeries: selected === 'series' || filters.showSeries }, shelfSeries)} renderStory={(story, linkId) => seriesById.has(story.id) ? <SeriesCard key={story.id} series={seriesById.get(story.id)!} linkId={linkId} /> : <StoryCard key={story.id} story={story} linkId={linkId} />} /></LibraryBoundary>
  }}</CollectionBrowser>
}
export function AddStoryPage() {
  const [params, setParams] = useSearchParams()
  const importing = !['manual', 'epub'].includes(params.get('import') ?? '')
  return <><div className="page-heading"><div><h1>Add Story</h1><p>Import metadata from an AO3 link, Wayback Machine snapshot, or EPUB, or enter information by hand.</p></div></div><LibraryBoundary>
    <div className="library-toolbar"><button type="button" className="button secondary" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('import', importing ? 'manual' : 'link'); return next })}>{importing ? 'Enter Manually' : 'Import from Link'}</button>{importing && <button type="button" className="button secondary" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('import', 'epub'); return next })}>Import from EPUB</button>}</div>
    {importing ? <ImportLinkForm /> : <StoryForm />}
  </LibraryBoundary></>
}
function PersonalStoryField({ story }: { story: Story }) {
  const library = useLibrary()
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useActivity(Boolean(busy), 'Updating your library…')
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
    {!editing && <button ref={trigger} type="button" className="icon-button inline-edit-icon" aria-label="Edit Personal Tags" onClick={open}><Pencil size={12} aria-hidden="true" /></button>}
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
  const returnLabel = returnTo.startsWith('/reading') ? 'Currently Reading' : returnTo.startsWith('/series/') ? 'Series' : returnTo.startsWith('/authors/') ? 'Author' : 'Library'
  const candidateStory = example ?? library.stories.find(s => s.id === id)
  const story = useStorySnapshot(candidateStory)
  const { loadDetails, retainDetails } = library
  useEffect(() => !example && id ? retainDetails([id]) : undefined, [example, id, retainDetails])
  useEffect(() => { if (!example && id && (!candidateStory || candidateStory.detailsLoaded === false)) void loadDetails([id]).catch(() => {}) }, [example, id, candidateStory, loadDetails])
  const metadataRefresh = useMetadataRefresh(example || story?.detailsLoaded === false ? undefined : story, typeof location.state?.importBatchId === 'string' ? location.state.importBatchId : undefined)
  const metadataRefreshProps = { ...metadataRefresh, unavailable: story?.work.ao3_work_id === null, onRefresh: () => void metadataRefresh.refresh() }
  const mobile = useLayout(600) === 'mobile'
  const headerDisplay = useDisplayPreference('workHeader'), statsDisplay = useDisplayPreference('workStats')
  const showUpdatedActions = !isDisplayFieldHidden(headerDisplay, 'stats') && !isDisplayFieldHidden(statsDisplay, 'updated')
  const readerActions = story && <><WaybackLink url={savedWorkUrl(story)} /><ReadEpub workId={story.work.ao3_work_id} variant="details" /><BookFusionButton value={story.metadata.bookfusion_link} variant="details" /></>
  const updatedActions = story && <dd className="details-updated-action">{readerActions}</dd>
  return <LibraryBoundary>{story?.detailsLoaded === false ? <p role="status">Loading work details…</p> : story ? <StoryControls story={story} details>{({ favorite, rec, readingStatus, caughtUp, editProgress, rating, collectionsField }) => <div className="story-details-page">
    <div className="page-heading story-details-heading work-details-heading"><div>
      <Link className="story-return-link clickable-text" to={returnTo} aria-label={`Back to ${returnLabel}`}><ArrowLeft size={16} aria-hidden="true" />{returnLabel}</Link>
      <DisplayInfo group="workHeader" fields={['series']}>{{ series: story.metadata.series?.length ? <p className="story-series-eyebrow"><SeriesNames metadata={story.metadata} /></p> : null }}</DisplayInfo>
      <div className="story-title-row">
        <h1 aria-label={story.metadata.title}><a href={savedWorkUrl(story)} target="_blank" rel="noreferrer">{story.metadata.title}</a><OneShotIndicator story={story} /></h1>
        {editing ? <p className="story-details-authors">By <AuthorNames metadata={story.metadata} destination="ao3" /></p> : <DisplayInfo group="workHeader" fields={['authors']}>{{ authors: <p className="story-details-authors">By <AuthorNames metadata={story.metadata} destination="ao3" /></p> }}</DisplayInfo>}
        {!editing && <DisplayInfo group="workHeader" fields={['fandoms']}>{{ fandoms: <p className="details-fandom-rating"><BulletSeparated values={[...(story.metadata.fandoms.length ? story.metadata.fandoms : ['Fandom unknown']), ratingLabel(story.metadata.rating) || 'Rating unknown']} /></p> }}</DisplayInfo>}
        {!editing && <><div className="story-title-toggles">{favorite}{rec}</div><div className="story-metadata-actions">{!showUpdatedActions && readerActions}<MetadataRefreshButton {...metadataRefreshProps} variant="button" /><ExportWorkMetadata story={story} /><button className="button secondary story-metadata-edit" aria-label="Edit AO3 Metadata" onClick={() => editSection('metadata')}><Pencil size={14} aria-hidden="true" />Edit</button></div></>}
      </div>
      {!editing && <DisplayInfo group="workHeader">{{
        stats: <> <dl className="details-story-stats">
<DisplayInfo group="workStats">{{
      words: <> <div><dt>Word Count</dt><dd><strong>{story.metadata.word_count?.toLocaleString() ?? '?'}</strong> words</dd></div> </>,
      chapters: <> <div><dt>Published / Total Chapters</dt><dd><strong>{story.metadata.published_chapters ?? '?'} / {story.metadata.total_chapters ?? '?'}</strong> chapters</dd></div> </>,
      publication: <> <div><dt>Publication Status</dt><dd><strong>{publicationStatuses[story.metadata.publication_status].label}</strong></dd></div> </>,
      updated: <> <div className="details-updated"><dt>Date Updated</dt><dd><strong>{ao3Date(story.work.ao3_updated_at)}</strong></dd>{!mobile && updatedActions}</div>{mobile && updatedActions} </>
    }}</DisplayInfo>
        </dl> </>}}</DisplayInfo>}
    </div></div>
    {typeof location.state?.importBatchId === 'string' && <CompletedImportSeriesNotice reviewRelatedSeries={location.state.reviewRelatedSeries === true} key={location.state.importBatchId} batchId={location.state.importBatchId} initialBehavior={location.state.seriesImportBehavior === 'all' || location.state.seriesImportBehavior === 'choose' ? location.state.seriesImportBehavior : undefined} />}
    {editing ? <StoryForm key={`${story.id}-${editing}`} story={story} section={editing} onCancel={() => editSection(null)} /> : <>
<DisplayInfo group="workPage">{{
      progress: <>       <section className="settings-card details-progress-panel" aria-label="Reading and Organization">
        <div className="story-section-heading"><h2>Reading and Organization</h2></div>
        <BookSpineFooter story={story} editProgress={editProgress} caughtUp={caughtUp} />
        <div className="details-reading-controls progress-sections">{readingStatus}<div className="progress-rating">{rating}</div>{collectionsField}</div>
      </section> </>,
      notes: <>
      <section className="details-private-notes" aria-label="Private Notes"><PersonalNote key={story.id} notes={story.notes} onSave={(notes, base) => updateEntry(story.id, { notes }, { notes: base })} onRefresh={() => library.refreshStory(story.id)} /></section> </>,
      information: <>
      <section className="settings-card details-fic-panel" aria-label="Story Information">
        <dl className="metadata-list details-fic-fields">
<DisplayInfo group="workInfo">{{
      ...workMetadataFields(story, 'info'),
      personalTags: <> <div><PersonalStoryField key={story.id} story={story} /></div> </>,
      saved: <> <div><dt>Saved</dt><dd>{formatDateTime(story.created_at)}</dd></div>{story.finished_at && <div><dt>Finished</dt><dd>{formatDateTime(story.finished_at)}</dd></div>}{story.reading_history?.filter(event => ['paused_reading', 'resumed'].includes(event.action)).map((event, index) => <div key={index}><dt>{event.action === 'resumed' ? 'Resumed' : 'Paused'}</dt><dd>{formatDateTime(event.at)}</dd></div>)} </>,
      chapterHistory: <ChapterReadingHistory history={story.reading_history} />,
      edited: <> <div><dt>Last Edited</dt><dd>{formatDateTime(story.updated_at)}</dd></div> </>,
      other: <OtherWorkMetadata story={story} expanded={Boolean(example)} />
    }}</DisplayInfo>
        </dl>

      </section> </>,
      metadata: <>
      <MetadataControls story={story} refreshButton={<MetadataRefreshButton {...metadataRefreshProps} />} refreshMessage={metadataRefresh.message} /> </>
    }}</DisplayInfo>
    </>}
    {metadataRefresh.notFound && <ConfirmationDialog title="Mark Work as Deleted?" confirmLabel="Mark as Deleted" pendingLabel="Saving…" onConfirm={metadataRefresh.confirmDeleted} onClose={metadataRefresh.dismissNotFound}>
      <p>‘<a className="clickable-text" href={savedWorkUrl(story)} target="_blank" rel="noreferrer">{story.metadata.title}</a>’ returns an Error 404: The page you were looking for doesn't exist. Would you like to mark the work as deleted? Your existing metadata and information will be preserved.</p>
    </ConfirmationDialog>}
  </div>}</StoryControls> : <p>Story unavailable. <Link className="clickable-text" to={returnTo}>Return to {returnLabel}</Link></p>}</LibraryBoundary>
}
