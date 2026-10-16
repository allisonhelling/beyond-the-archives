import { useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, BookX, Check, FileText, FolderPlus, Heart, MoreHorizontal, Trash2 } from 'lucide-react'
import { useLibrary } from './LibraryProvider'
import { active, chapterUrl, nextUnread, savedWorkUrl, statuses, tagNames, validateProgress, type Status, type Story } from './model'
import { deleteCollection, saveCollection, updateEntry } from './repository'
import { useDismissible } from '../../components/useDismissible'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { Tooltip } from '../../components/Tooltip'
import { StoryForm } from './StoryForm'
import { ReadingDashboard } from './ReadingDashboard'

function LibraryBoundary({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useLibrary()
  if (loading) return <p role="status">Loading your library…</p>
  if (error) return <div role="alert" className="error-message">{error}<button className="button secondary" onClick={() => void refresh().catch(() => {})}>Retry loading</button></div>
  return children
}
function publication(story: Story) { return { complete: 'Complete on AO3', in_progress: 'In Progress on AO3', unknown: 'AO3 publication status unknown' }[story.metadata.publication_status] }
function ExternalUrl({ url, fallback = 'Unverified' }: { url: string | null; fallback?: string }) {
  let clickable = false
  try {
    const parsed = new URL(url ?? '')
    clickable = parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { /* Missing or invalid legacy URLs remain plain text. */ }
  return clickable ? <a className="metadata-link" href={url!} target="_blank" rel="noreferrer">{url}</a> : <>{fallback}</>
}
function updateState(story: Story) {
  const published = story.metadata.published_chapters
  return published === null ? 'Update status unknown' : published > story.last_read_chapter ? `${published - story.last_read_chapter} chapters unread (saved count)` : 'Caught up with saved chapter count'
}
type CardControls = { actions: ReactNode; caughtUp: ReactNode; editProgress: ReactNode }
function StoryControls({ story, children }: { story: Story; children?: (controls: CardControls) => ReactNode }) {
  const { refresh, markAllRead, markFinished, removeStory } = useLibrary(), navigate = useNavigate(), location = useLocation()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(String(story.last_read_chapter))
  const [progressOpen, setProgressOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
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
    <button ref={progressTrigger} className="chapter-progress-button" title="Edit chapter progress" aria-label={`Chapter ${story.last_read_chapter} of ${story.metadata.total_chapters ?? '?'} — edit progress`} aria-haspopup="dialog" aria-expanded={progressOpen} aria-controls={progressOpen ? progressId : undefined} disabled={busy} onClick={() => { setProgress(String(story.last_read_chapter)); setError(''); setProgressOpen(!progressOpen) }}><strong>{children ? <>Ch. {story.last_read_chapter} / {story.metadata.total_chapters ?? '?'}</> : <>Chapter {story.last_read_chapter} of {story.metadata.total_chapters ?? '?'}</>}</strong></button>
    {progressOpen && <div id={progressId} role="dialog" aria-modal="false" className="progress-popover" aria-label="Edit chapter progress"><form onSubmit={event => { event.preventDefault(); try { if (!progress.trim()) throw new Error('Enter chapters read.'); validateProgress(Number(progress), story.metadata); void change({ last_read_chapter: Number(progress) }).then(saved => { if (saved) closeProgress() }) } catch (e) { setError((e as Error).message) } }}><h2>Edit chapter progress</h2><label>Last fully read chapter<input type="number" autoFocus required min="0" step="1" value={progress} onChange={e => setProgress(e.target.value)} /></label><p>of {story.metadata.total_chapters ?? '?'} · {story.metadata.published_chapters ?? '?'} published</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button primary" disabled={busy}>Save progress</button><button className="button secondary" disabled={busy} type="button" onClick={closeProgress}>Cancel</button></div></form></div>}
  </div>
  const caughtUpDescription = story.metadata.published_chapters === null ? 'Enter published chapter count in details first' : `Mark all chapters as read`
  const caughtUpButton = (descriptionId?: string) => <button className={children ? 'spine-action caught-up-action' : 'button caught-up-action'} aria-label="Mark as Caught Up" aria-describedby={descriptionId} disabled={busy || story.metadata.published_chapters === null} title={children ? undefined : caughtUpDescription} onClick={() => void markRead()}>{children ? <Check size={14} aria-hidden="true" /> : 'Mark as Caught Up'}</button>
  const caughtUp = children ? <Tooltip description={caughtUpDescription}>{descriptionId => caughtUpButton(descriptionId)}</Tooltip> : caughtUpButton()
  const actions = <div className="story-quick-actions"><Tooltip description="Favorite">{descriptionId => <button className={`icon-button favorite ${story.is_favorite ? 'selected' : ''}`} aria-label={story.is_favorite ? 'Unmark favorite' : 'Mark favorite'} aria-describedby={descriptionId} aria-pressed={story.is_favorite} disabled={busy} onClick={() => void change({ is_favorite: !story.is_favorite })}><Heart size={20} fill={story.is_favorite ? 'currentColor' : 'none'} /></button>}</Tooltip>
    <details className="story-menu" ref={menuRef} open={menuOpen} onToggle={event => setMenuOpen(event.currentTarget.open)}>
      <summary aria-label={`Story actions for ${story.metadata.title}`}><MoreHorizontal size={22} /></summary>
      <div className="menu-surface">
        <Link className="menu-item" to={`/stories/${story.id}`} state={location.pathname.startsWith('/stories/') ? location.state : { returnTo: location.pathname + location.search }}><FileText size={16} aria-hidden="true" />View/Edit Details</Link>
        <button className="menu-item" disabled={busy} onClick={() => void finishStory()}><Check size={16} aria-hidden="true" />Mark as Finished</button>
        <button className="menu-item" disabled title="Available when custom collections are implemented"><FolderPlus size={16} aria-hidden="true" />Add to collection</button>
        <button className="menu-item" disabled={busy} onClick={() => void change({ reading_status: 'did_not_finish' })}><BookX size={16} aria-hidden="true" />Mark as DNF</button>
        <hr className="menu-divider" />
        <button className="menu-item" disabled={busy} onClick={() => { setMenuOpen(false); setRemoveOpen(true) }}><Trash2 size={16} aria-hidden="true" />Remove from Library</button>
      </div>
    </details></div>
  return <>{children ? children({ actions, caughtUp, editProgress }) : <><div className="story-controls">{actions}<label className="status-select">Reading status<select aria-label={`Reading status for ${story.metadata.title}`} disabled={busy} value={story.reading_status} onChange={e => void change({ reading_status: e.target.value as Status })}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><div className="story-actions">{editProgress}{caughtUp}</div></>}
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
    <span className="spine-divider" aria-hidden="true"><svg viewBox="0 0 12 40" width="12" height="40" preserveAspectRatio="none" focusable="false"><path d="M5.4 0H6.6C6.6 16 6.6 18 12 20C6.6 22 6.6 24 6.6 40H5.4C5.4 24 5.4 22 0 20C5.4 18 5.4 16 5.4 0Z" fill="currentColor" /></svg></span>
    <div className="spine-actions">
      <Tooltip description={`Read chapter ${nextUnread(story.last_read_chapter)}`}>{descriptionId => <a className="spine-action" href={next ?? savedWorkUrl(story)} target="_blank" rel="noreferrer" aria-label={readLabel} aria-describedby={descriptionId}><BookOpen size={16} aria-hidden="true" /></a>}</Tooltip>
      {caughtUp}
    </div>
  </footer>
}
function StoryCard({ story }: { story: Story }) {
  const first = chapterUrl(story, 1), location = useLocation()
  const origin = { returnTo: location.pathname + location.search }
  return <article className="story-card"><StoryControls story={story}>{({ actions, caughtUp, editProgress }) => <>
    <div className="story-labels"><span className="publication-status">{publication(story)}</span>{actions}</div>
    <h2>{first ? <a href={first} target="_blank" rel="noreferrer">{story.metadata.title}</a> : <Link to={`/stories/${story.id}`} state={origin}>{story.metadata.title}</Link>}</h2>
    <p className="authors">By {story.metadata.authors.join(', ') || 'Author unknown'}</p>
    <p className="muted">{story.metadata.fandoms.join(' · ') || 'Fandom unknown'}</p>
    <p className="story-facts">{story.metadata.rating || 'Rating unknown'} · {story.metadata.word_count?.toLocaleString() ?? '?'} words</p>
    <hr className="story-summary-divider" />
    {story.metadata.summary && <p className="story-summary">{story.metadata.summary}</p>}
    <Link className="story-details-link" to={`/stories/${story.id}`} state={origin}>See Full Details…</Link>
    <BookSpineFooter story={story} editProgress={editProgress} caughtUp={caughtUp} />
  </>}</StoryControls></article>
}
const shelves = [['all', 'All works'], ['currently_reading', 'Currently Reading'], ['to_read', 'To Read'], ['favorites', 'Favorites'], ['finished', 'Finished'], ['did_not_finish', 'Did Not Finish']] as const
export function LibraryPage({ reading = false }: { reading?: boolean }) {
  const { stories } = useLibrary()
  if (reading) return <><div className="page-heading"><div><span className="eyebrow accent">YOUR PRIVATE READING SPACE</span><h1>Currently Reading</h1><p>A little escape, one chapter at a time.</p></div></div><LibraryBoundary><ReadingDashboard stories={stories} renderStory={story => <StoryCard key={story.id} story={story} />} /></LibraryBoundary></>
  return <LibraryContent />
}
function LibraryContent() {
  const { stories, collections, refresh } = useLibrary(), navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const selected = params.get('shelf') ?? 'all'
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [deleteCollectionOpen, setDeleteCollectionOpen] = useState(false)
  async function collectionAction(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); await refresh() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const collection = collections.find(c => c.id === selected)
  const shelfStories = stories.filter(story => {
    if (selected === 'currently_reading') return active(story)
    if (selected === 'complete') return story.metadata.publication_status === 'complete'
    if (selected === 'new') return false // No verified update events are ingested during Phase 2.
    if (selected === 'waiting') return story.reading_status === 'waiting_for_updates'
    if (selected === 'to_read' || selected === 'finished' || selected === 'did_not_finish') return story.reading_status === selected
    if (selected === 'favorites') return story.is_favorite
    if (collection) return story.collectionIds.includes(collection.id)
    return true
  })
  return <><div className="page-heading"><div><span className="eyebrow accent">YOUR PRIVATE READING SPACE</span><h1>Your Library</h1><p>A home for all the worlds you want to keep.</p></div><Link className="button primary" to="/add">Add Story</Link></div><LibraryBoundary>
    <div className="library-toolbar"><><button className="button secondary" disabled title="Phase 3">Import History from AO3 · Phase 3</button><button className="button secondary" disabled={busy} onClick={() => { const name = window.prompt('New collection name'); if (name !== null) void collectionAction(() => saveCollection(name)) }}>New Shelf</button></></div>
    <nav className="shelf-tabs" aria-label="Library shelves">{shelves.map(([key, label]) => <button className={selected === key ? 'selected' : ''} aria-pressed={selected === key} key={key} onClick={() => { if ((key === 'currently_reading' || key === 'to_read')) navigate(key === 'currently_reading' ? '/reading' : `/reading?shelf=${key}`); else setParams({ shelf: key }) }}>{label}</button>)}{collections.filter(c => !c.default_key).map(c => <button key={c.id} className={selected === c.id ? 'selected' : ''} aria-pressed={selected === c.id} onClick={() => setParams({ shelf: c.id })}>{c.name}</button>)}</nav>
    {collection && <div className="collection-heading"><h2>{collection.name}</h2><button disabled={busy} className="text-button" onClick={() => { const name = window.prompt('Rename collection', collection.name); if (name !== null) void collectionAction(() => saveCollection(name, collection.id)) }}>Rename collection</button><button disabled={busy} className="text-button" onClick={() => setDeleteCollectionOpen(true)}>Delete collection</button></div>}
    {collection && deleteCollectionOpen && <ConfirmationDialog title="Delete collection?" confirmLabel="Delete collection" onClose={() => setDeleteCollectionOpen(false)} onConfirm={async () => { await deleteCollection(collection.id); await refresh(); setParams({ shelf: 'all' }) }}><p>Delete “{collection.name}”?</p><p>Stories will stay in your library.</p></ConfirmationDialog>}
    {error && <p role="alert" className="error-message">{error}</p>}
    <ReadingDashboard mode="library" stories={shelfStories} renderStory={story => <StoryCard key={story.id} story={story} />} />
  </LibraryBoundary></>
}
export function AddStoryPage() { return <><div className="page-heading"><div><h1>Add Story</h1><p>Save a fic by hand, even when metadata is unavailable.</p></div></div><LibraryBoundary><StoryForm /></LibraryBoundary></> }
export function StoryDetailsPage() {
  const { id } = useParams(), library = useLibrary(), [editing, setEditing] = useState(false), location = useLocation()
  const candidate = location.state?.returnTo
  const returnTo = typeof candidate === 'string' && /^\/(?:reading|library)(?:\?[^#]*)?$/.test(candidate) ? candidate : '/library'
  const returnLabel = returnTo.startsWith('/reading') ? 'Currently Reading' : 'Library'
  const story = library.stories.find(s => s.id === id)
  return <LibraryBoundary>{story ? <><div className="page-heading"><div><Link className="story-return-link" to={returnTo} aria-label={`Back to ${returnLabel}`}><ArrowLeft size={14} aria-hidden="true" />{returnLabel}</Link><h1>{story.metadata.title}</h1><p className="story-details-authors">By {story.metadata.authors.join(', ') || 'Author unknown'}</p></div><button className="button secondary" onClick={() => setEditing(!editing)}>{editing ? 'Close editor' : 'Edit story'}</button></div>{editing ? <StoryForm key={story.id} story={story} onCancel={() => setEditing(false)} /> : <><section className="settings-card"><h2>AO3 metadata</h2><p className="muted">Manually entered values are private field-level overrides.</p><dl className="metadata-list"><div><dt>AO3 work ID</dt><dd>{story.work.ao3_work_id}</dd></div><div><dt>Authors</dt><dd>{story.metadata.authors.join(', ') || 'Unknown'}</dd></div><div><dt>Fandoms</dt><dd>{story.metadata.fandoms.join(', ') || 'Unknown'}</dd></div><div><dt>AO3 rating</dt><dd>{story.metadata.rating || 'Unknown'}</dd></div><div><dt>Publication status</dt><dd>{publication(story)}</dd></div><div><dt>Published / total chapters</dt><dd>{story.metadata.published_chapters ?? '?'} / {story.metadata.total_chapters ?? '?'}</dd></div><div><dt>Word count</dt><dd>{story.metadata.word_count?.toLocaleString() ?? '?'}</dd></div><div><dt>AO3 tags</dt><dd>{story.metadata.ao3_tags.join(', ') || 'None saved'}</dd></div><div><dt>Relationships</dt><dd>{tagNames(story.metadata, 'relationship').join(', ') || 'None saved'}</dd></div><div><dt>Characters</dt><dd>{tagNames(story.metadata, 'character').join(', ') || 'None saved'}</dd></div><div><dt>Additional Tags</dt><dd>{tagNames(story.metadata, 'freeform').join(', ') || 'None saved'}</dd></div><div><dt>Series (manually saved)</dt><dd>{story.metadata.series?.join(', ') || 'None saved'}</dd></div><div><dt>AO3 last updated</dt><dd>{story.work.ao3_updated_at ? new Date(story.work.ao3_updated_at).toLocaleString() : 'Unknown'}</dd></div><div><dt>Metadata last checked</dt><dd>{story.work.last_metadata_check ? new Date(story.work.last_metadata_check).toLocaleString() : 'Never'}</dd></div><div><dt>Verified canonical URL</dt><dd><ExternalUrl url={story.work.canonical_url} /></dd></div><div><dt>Original provided URL</dt><dd><ExternalUrl url={story.original_url} fallback="Unavailable" /></dd></div>{savedWorkUrl(story) !== story.original_url && <div><dt>Updated provided URL</dt><dd><ExternalUrl url={savedWorkUrl(story)} /></dd></div>}</dl><h3>Summary</h3><p className="story-summary">{story.metadata.summary || 'No summary saved.'}</p>{chapterUrl(story) && <a className="chapter-text-link" href={chapterUrl(story)!} target="_blank" rel="noreferrer">Read Chapter {nextUnread(story.last_read_chapter)}</a>}</section><section className="settings-card"><h2>Your reading</h2><p>{updateState(story)}</p><StoryControls story={story} /><dl className="metadata-list"><div><dt>Personal rating</dt><dd>{story.personal_rating ? `${story.personal_rating} / 5` : 'Unrated'}</dd></div><div><dt>Custom collections</dt><dd>{library.collections.filter(c => story.collectionIds.includes(c.id)).map(c => c.name).join(', ') || 'None'}</dd></div><div><dt>Personal tags</dt><dd>{story.personalTags.join(', ') || 'None'}</dd></div><div><dt>Saved</dt><dd>{new Date(story.created_at).toLocaleString()}</dd></div><div><dt>Last edited</dt><dd>{new Date(story.updated_at).toLocaleString()}</dd></div></dl><h3>Private notes</h3><p className="story-summary">{story.notes || 'No notes saved.'}</p><button className="button secondary" onClick={() => setEditing(true)}>Edit notes, rating & collections</button></section></>}</> : <p>Story unavailable. <Link to={returnTo}>Return to {returnLabel}</Link></p>}</LibraryBoundary>
}
