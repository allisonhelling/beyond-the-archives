import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Heart, MoreHorizontal } from 'lucide-react'
import { useLibrary } from './LibraryProvider'
import { active, chapterUrl, nextUnread, savedWorkUrl, statuses, validateProgress, type Status, type Story } from './model'
import { deleteCollection, deleteStory, saveCollection, updateEntry } from './repository'
import { useDismissible } from '../../components/useDismissible'
import { StoryForm } from './StoryForm'
import { ReadingDashboard } from './ReadingDashboard'

function LibraryBoundary({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useLibrary()
  if (loading) return <p role="status">Loading your library…</p>
  if (error) return <div role="alert" className="error-message">{error}<button className="button secondary" onClick={() => void refresh().catch(() => {})}>Retry loading</button></div>
  return children
}
function publication(story: Story) { return { complete: 'Complete on AO3', in_progress: 'In Progress on AO3', unknown: 'AO3 publication status unknown' }[story.metadata.publication_status] }
function updateState(story: Story) {
  const published = story.metadata.published_chapters
  return published === null ? 'Update status unknown' : published > story.last_read_chapter ? `${published - story.last_read_chapter} chapters unread (saved count)` : 'Caught up with saved chapter count'
}
function StoryControls({ story }: { story: Story }) {
  const { refresh } = useLibrary(), navigate = useNavigate()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(String(story.last_read_chapter))
  const dialog = useRef<HTMLDialogElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useDismissible<HTMLDetailsElement>(menuOpen, () => setMenuOpen(false))
  async function change(changes: Parameters<typeof updateEntry>[1]) {
    setError(''); setBusy(true)
    try { await updateEntry(story.id, changes); await refresh(); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save changes.'); return false }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!window.confirm(`Permanently remove “${story.metadata.title}” and its private notes and progress from your library?`)) return
    setBusy(true)
    try { await deleteStory(story.id); await refresh(); navigate('/library') }
    catch { setError('Could not remove story. Please try again.') }
    finally { setBusy(false) }
  }
  return <><div className="story-controls"><button className={`icon-button favorite ${story.is_favorite ? 'selected' : ''}`} aria-label={story.is_favorite ? 'Unmark favorite' : 'Mark favorite'} aria-pressed={story.is_favorite} disabled={busy} onClick={() => void change({ is_favorite: !story.is_favorite })}><Heart size={20} fill={story.is_favorite ? 'currentColor' : 'none'} /></button>
    <label className="status-select">Reading status<select aria-label={`Reading status for ${story.metadata.title}`} disabled={busy} value={story.reading_status} onChange={e => void change({ reading_status: e.target.value as Status })}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <details className="story-menu" ref={menuRef} open={menuOpen} onToggle={event => setMenuOpen(event.currentTarget.open)}><summary aria-label={`Story actions for ${story.metadata.title}`}><MoreHorizontal size={22} /></summary><div><Link to={`/stories/${story.id}`}>View/Edit Details</Link><button disabled={busy} onClick={() => void change({ reading_status: 'to_read' })}>Move to Library</button><small>Moves to To Read; keeps progress and notes.</small><button disabled={busy} onClick={() => void change({ reading_status: 'did_not_finish' })}>Mark as DNF</button><button disabled={busy} onClick={() => void remove()}>Remove from Library</button></div></details></div>
    <div className="story-actions"><button className="button secondary" disabled={busy} onClick={() => { setProgress(String(story.last_read_chapter)); dialog.current?.showModal() }}>Edit chapter progress</button><button className="button secondary" disabled={busy || story.metadata.published_chapters === null} title={story.metadata.published_chapters === null ? 'Enter published chapter count in details first' : 'Keeps your reading status unchanged'} onClick={() => void change({ last_read_chapter: story.metadata.published_chapters! })}>Mark as Caught Up</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <dialog ref={dialog} className="progress-dialog" aria-label="Edit chapter progress"><form onSubmit={event => { event.preventDefault(); try { if (!progress.trim()) throw new Error('Enter chapters read.'); validateProgress(Number(progress), story.metadata); void change({ last_read_chapter: Number(progress) }).then(saved => { if (saved) dialog.current?.close() }) } catch (e) { setError((e as Error).message) } }}><h2>Edit chapter progress</h2><label>Last fully read chapter<input type="number" required min="0" step="1" value={progress} onChange={e => setProgress(e.target.value)} /></label><p>of {story.metadata.total_chapters ?? '?'} · {story.metadata.published_chapters ?? '?'} published</p><p>Next unread chapter: {Number(progress) + 1}</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button primary" disabled={busy}>Save progress</button><button className="button secondary" disabled={busy} type="button" onClick={() => { setError(''); dialog.current?.close() }}>Cancel</button></div></form></dialog>
  </>
}
function StoryCard({ story }: { story: Story }) {
  const next = chapterUrl(story), first = chapterUrl(story, 1)
  return <article className="story-card"><div className="story-labels"><span className="status-pill">{publication(story)}</span><span>{statuses[story.reading_status]}</span></div><h2>{first ? <a href={first} target="_blank" rel="noreferrer">{story.metadata.title}</a> : <Link to={`/stories/${story.id}`}>{story.metadata.title}</Link>}</h2><p className="authors">{story.metadata.authors.join(', ') || 'Author unknown'}</p><p className="muted">{story.metadata.fandoms.join(' · ') || 'Fandom unknown'}</p><p className="story-facts">{story.metadata.rating || 'Rating unknown'} · {story.metadata.word_count?.toLocaleString() ?? '?'} words</p>{story.metadata.summary && <p className="story-summary">{story.metadata.summary}</p>}
    <p><strong>Chapter {story.last_read_chapter} of {story.metadata.total_chapters ?? '?'}</strong> · Next unread: {nextUnread(story.last_read_chapter)}</p><p className="muted">{updateState(story)}</p><p className="field-help">{story.work.ao3_updated_at ? `AO3 updated: ${new Date(story.work.ao3_updated_at).toLocaleString()}` : 'AO3 last updated: unknown'} · Saved {new Date(story.updated_at).toLocaleDateString()}</p>
    <div className="story-actions">{next ? <a className="button primary" href={next} target="_blank" rel="noreferrer">Read Chapter {nextUnread(story.last_read_chapter)}</a> : <small>Next chapter URL unverified. <a href={savedWorkUrl(story)} target="_blank" rel="noreferrer">Open saved AO3 link</a></small>}<Link to={`/stories/${story.id}`}>See Full Details</Link></div><StoryControls story={story} />
  </article>
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
  const [query, setQuery] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function collectionAction(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); await refresh() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const collection = collections.find(c => c.id === selected)
  let shown = stories.filter(story => {
    if (selected === 'currently_reading') return active(story)
    if (selected === 'complete') return story.metadata.publication_status === 'complete'
    if (selected === 'new') return false // No verified update events are ingested during Phase 2.
    if (selected === 'waiting') return story.reading_status === 'waiting_for_updates'
    if (selected === 'to_read' || selected === 'finished' || selected === 'did_not_finish') return story.reading_status === selected
    if (selected === 'favorites') return story.is_favorite
    if (collection) return story.collectionIds.includes(collection.id)
    return true
  }).filter(s => `${s.metadata.title}\n${s.metadata.authors.join('\n')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  shown = [...shown].sort((a, b) => (b.work.ao3_updated_at ? Date.parse(b.work.ao3_updated_at) : 0) - (a.work.ao3_updated_at ? Date.parse(a.work.ao3_updated_at) : 0) || a.metadata.title.localeCompare(b.metadata.title))
  return <><div className="page-heading"><div><span className="eyebrow accent">YOUR PRIVATE READING SPACE</span><h1>Your Library</h1><p>A home for all the worlds you want to keep.</p></div><Link className="button primary" to="/add">Add Story</Link></div><LibraryBoundary>
    <div className="library-toolbar"><label>Search title or author<input type="search" placeholder="Search title or author" value={query} onChange={e => setQuery(e.target.value)} /></label><><button className="button secondary" disabled title="Phase 3">Import History from AO3 · Phase 3</button><button className="button secondary" disabled={busy} onClick={() => { const name = window.prompt('New collection name'); if (name !== null) void collectionAction(() => saveCollection(name)) }}>New Shelf</button></></div>
    <nav className="shelf-tabs" aria-label="Library shelves">{shelves.map(([key, label]) => <button className={selected === key ? 'selected' : ''} aria-pressed={selected === key} key={key} onClick={() => { if ((key === 'currently_reading' || key === 'to_read')) navigate(key === 'currently_reading' ? '/reading' : `/reading?shelf=${key}`); else setParams({ shelf: key }) }}>{label}</button>)}{collections.filter(c => !c.default_key).map(c => <button key={c.id} className={selected === c.id ? 'selected' : ''} aria-pressed={selected === c.id} onClick={() => setParams({ shelf: c.id })}>{c.name}</button>)}</nav>
    {collection && <div className="collection-heading"><h2>{collection.name}</h2><button disabled={busy} className="text-button" onClick={() => { const name = window.prompt('Rename collection', collection.name); if (name !== null) void collectionAction(() => saveCollection(name, collection.id)) }}>Rename collection</button><button disabled={busy} className="text-button" onClick={() => { if (window.confirm(`Delete collection “${collection.name}”? Stories will stay in your library.`)) void collectionAction(async () => { await deleteCollection(collection.id); setParams({ shelf: 'all' }) }) }}>Delete collection</button></div>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {shown.length ? <div className="story-grid">{shown.map(story => <StoryCard key={story.id} story={story} />)}</div> : <section className="library-empty"><h2>{selected === 'new' ? 'No verified chapter updates' : 'No stories here yet'}</h2><p>{selected === 'new' ? 'Automatic metadata checks and email updates arrive in later phases. No update events have been recorded.' : query ? 'Try another title or author.' : 'Add a story manually or choose another shelf.'}</p></section>}
  </LibraryBoundary></>
}
export function AddStoryPage() { return <><div className="page-heading"><div><h1>Add Story</h1><p>Save a fic by hand, even when metadata is unavailable.</p></div></div><LibraryBoundary><StoryForm /></LibraryBoundary></> }
export function StoryDetailsPage() {
  const { id } = useParams(), library = useLibrary(), [editing, setEditing] = useState(false)
  const story = library.stories.find(s => s.id === id)
  return <LibraryBoundary>{story ? <><div className="page-heading"><div><Link to="/library">← Library</Link><h1>{story.metadata.title}</h1><p>{story.metadata.authors.join(', ') || 'Author unknown'}</p></div><button className="button secondary" onClick={() => setEditing(!editing)}>{editing ? 'Close editor' : 'Edit story'}</button></div>{editing ? <StoryForm key={story.id} story={story} onCancel={() => setEditing(false)} /> : <><section className="settings-card"><h2>AO3 metadata</h2><p className="muted">Manually entered values are private field-level overrides.</p><dl className="metadata-list"><div><dt>AO3 work ID</dt><dd>{story.work.ao3_work_id}</dd></div><div><dt>Authors</dt><dd>{story.metadata.authors.join(', ') || 'Unknown'}</dd></div><div><dt>Fandoms</dt><dd>{story.metadata.fandoms.join(', ') || 'Unknown'}</dd></div><div><dt>AO3 rating</dt><dd>{story.metadata.rating || 'Unknown'}</dd></div><div><dt>Publication status</dt><dd>{publication(story)}</dd></div><div><dt>Published / total chapters</dt><dd>{story.metadata.published_chapters ?? '?'} / {story.metadata.total_chapters ?? '?'}</dd></div><div><dt>Word count</dt><dd>{story.metadata.word_count?.toLocaleString() ?? '?'}</dd></div><div><dt>AO3 tags</dt><dd>{story.metadata.ao3_tags.join(', ') || 'None saved'}</dd></div><div><dt>Series (manually saved)</dt><dd>{story.metadata.series?.join(', ') || 'None saved'}</dd></div><div><dt>AO3 last updated</dt><dd>{story.work.ao3_updated_at ? new Date(story.work.ao3_updated_at).toLocaleString() : 'Unknown'}</dd></div><div><dt>Metadata last checked</dt><dd>{story.work.last_metadata_check ? new Date(story.work.last_metadata_check).toLocaleString() : 'Never'}</dd></div><div><dt>Verified canonical URL</dt><dd>{story.work.canonical_url || 'Unverified'}</dd></div></dl><h3>Summary</h3><p className="story-summary">{story.metadata.summary || 'No summary saved.'}</p><a href={story.original_url} target="_blank" rel="noreferrer">Open original AO3 story URL</a><p className="field-help url-text">{story.original_url}</p>{savedWorkUrl(story) !== story.original_url && <p><a href={savedWorkUrl(story)} target="_blank" rel="noreferrer">Open updated AO3 URL</a></p>}{chapterUrl(story) && <a href={chapterUrl(story)!} target="_blank" rel="noreferrer">Read Chapter {nextUnread(story.last_read_chapter)}</a>}</section><section className="settings-card"><h2>Your reading</h2><p>Chapter {story.last_read_chapter} of {story.metadata.total_chapters ?? '?'} · Next unread chapter: {nextUnread(story.last_read_chapter)}</p><p>{updateState(story)}</p><StoryControls story={story} /><dl className="metadata-list"><div><dt>Personal rating</dt><dd>{story.personal_rating ? `${story.personal_rating} / 5` : 'Unrated'}</dd></div><div><dt>Custom collections</dt><dd>{library.collections.filter(c => story.collectionIds.includes(c.id)).map(c => c.name).join(', ') || 'None'}</dd></div><div><dt>Personal tags</dt><dd>{story.personalTags.join(', ') || 'None'}</dd></div><div><dt>Saved</dt><dd>{new Date(story.created_at).toLocaleString()}</dd></div><div><dt>Last edited</dt><dd>{new Date(story.updated_at).toLocaleString()}</dd></div></dl><h3>Private notes</h3><p className="story-summary">{story.notes || 'No notes saved.'}</p><button className="button secondary" onClick={() => setEditing(true)}>Edit notes, rating & collections</button></section></>}</> : <p>Story unavailable. <Link to="/library">Return to Library</Link></p>}</LibraryBoundary>
}
