import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { authorPageUrl, blankMetadata, changedMetadata, initialProgress, parseLines, parseWorkUrl, ratings, savedWorkUrl, statuses, tagNames, validateProgress, type Metadata, type Status, type Story } from './model'
import { saveStory } from './repository'
import { StarRating } from './StarRating'
import { FavoriteButton } from './FavoriteButton'
import { useLibrary } from './LibraryProvider'
import { CollectionChoices, NewCollectionButton } from './CollectionChoices'
import { PersonalTagHelp, PersonalTagInput } from './PersonalTagInput'
export function StoryForm({ story, onCancel, section = 'all' }: { story?: Story; onCancel?: () => void; section?: 'all' | 'metadata' | 'reading' }) {
  const library = useLibrary(), navigate = useNavigate(), [params] = useSearchParams(), location = useLocation()
  const [metadata, setMetadata] = useState<Metadata>(story?.metadata ?? { ...blankMetadata })
  const [url, setUrl] = useState(story ? savedWorkUrl(story) : '')
  const [status, setStatus] = useState<Status>(story?.reading_status ?? (params.get('mode') === 'finished' ? 'finished' : params.get('mode') === 'starting' ? 'reading' : 'to_read'))
  const [statusTouched, setStatusTouched] = useState(Boolean(story) || params.has('mode'))
  const [progress, setProgress] = useState(String(story?.last_read_chapter ?? 0))
  const [notes, setNotes] = useState(story?.notes ?? '')
  const [personalRating, setPersonalRating] = useState<number | null>(story?.personal_rating ?? null)
  const [favorite, setFavorite] = useState(story?.is_favorite ?? false)
  const [collections, setCollections] = useState(story?.collectionIds ?? [])
  const [tags, setTags] = useState(story?.personalTags ?? [])
  const [authors, setAuthors] = useState(metadata.authors.join('\n')), [fandoms, setFandoms] = useState(metadata.fandoms.join('\n')), [otherTags, setOtherTags] = useState(metadata.ao3_tags.filter(tag => ![...tagNames(metadata, 'relationship'), ...tagNames(metadata, 'character'), ...tagNames(metadata, 'freeform')].includes(tag)).join('\n'))
  const [relationships, setRelationships] = useState(tagNames(metadata, 'relationship').join('\n'))
  const [characters, setCharacters] = useState(tagNames(metadata, 'character').join('\n'))
  const [additionalTags, setAdditionalTags] = useState(tagNames(metadata, 'freeform').join('\n'))
  const [series, setSeries] = useState(metadata.series?.join('\n') ?? '')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  function field<K extends keyof Metadata>(key: K, value: Metadata[K]) { setMetadata(m => ({ ...m, [key]: value })) }
  function urlDefaults() {
    if (story || statusTouched) return
    try { const defaults = initialProgress(url); setStatus(defaults.status); setProgress(String(defaults.lastRead)) } catch { /* Submission reports validation. */ }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    try {
      const identity = parseWorkUrl(url)
      if (story && identity.workId !== story.work.ao3_work_id) throw new Error('This URL belongs to a different work. Add it as a separate story to preserve the original record.')
      if (!metadata.title.trim()) throw new Error('A title is required.')
      for (const key of ['published_chapters', 'total_chapters', 'word_count'] as const) {
        const value = metadata[key]
        if (value !== null && (!Number.isInteger(value) || value < (key === 'total_chapters' ? 1 : 0) || value > 2147483647)) throw new Error('Enter valid whole chapter and word counts, or leave unknown values blank.')
      }
      if (metadata.published_chapters !== null && metadata.total_chapters !== null && metadata.published_chapters > metadata.total_chapters) throw new Error('Published chapters cannot exceed the total.')
      if (!progress.trim()) throw new Error('Enter the number of fully read chapters.')
      validateProgress(Number(progress), metadata)
      const authorLinks: Record<string, string> = {}
      if (section !== 'reading') for (const author of parseLines(authors)) {
        const value = metadata.author_links?.[author]?.trim()
        if (!value) continue
        const link = authorPageUrl(value)
        if (!link) throw new Error(`Enter a valid AO3 author page URL for ${author}.`)
        authorLinks[author] = link
      }
      setBusy(true)
      const nextMetadata: Metadata = section === 'reading' && story ? story.metadata : { ...metadata, manual_url: url, title: metadata.title.trim(), authors: parseLines(authors), author_links: authorLinks, fandoms: parseLines(fandoms), ao3_tags: [...new Set([...parseLines(otherTags), ...parseLines(relationships), ...parseLines(characters), ...parseLines(additionalTags)])], relationship_tags: parseLines(relationships), character_tags: parseLines(characters), additional_tags: parseLines(additionalTags), series: parseLines(series) }
      const id = await saveStory({ id: story?.id, url, metadata: nextMetadata, metadataChanges: story ? changedMetadata(story.metadata, nextMetadata) : undefined, status, progress: Number(progress), notes, personalRating, favorite, collections, tags: section === 'metadata' && story ? story.personalTags : tags })
      await library.refresh().catch(() => {})
      if (onCancel) onCancel()
      else navigate(`/stories/${id}`, { state: location.state })
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save story.') }
    finally { setBusy(false) }
  }
  return <form className="story-form" onSubmit={e => void submit(e)}>{section !== 'reading' && <fieldset disabled={busy}><legend>AO3 metadata · manually entered private overrides</legend><p className="muted">Your corrections are private overrides. Automatic metadata refresh preserves them.</p>
    <label>AO3 URL<input required type="url" value={url} onChange={e => setUrl(e.target.value)} onBlur={urlDefaults} /></label>
    <p className="field-help">{story ? 'You can update the link for this work. The original submission is preserved separately; work identity cannot be changed.' : 'Chapter IDs are not chapter numbers. Unverified links do not set progress; enter chapters read below.'}</p>
    <label>Title<input required value={metadata.title} onChange={e => field('title', e.target.value)} /></label>
    <div className="form-grid"><label>Authors (one per line)<textarea rows={3} value={authors} onChange={e => setAuthors(e.target.value)} /></label><label>Fandoms (one per line)<textarea rows={3} value={fandoms} onChange={e => setFandoms(e.target.value)} /></label></div>
    {!!parseLines(authors).length && <div className="form-grid">{parseLines(authors).map(author => <label key={author}>AO3 author page for {author} (optional)<input type="url" placeholder="https://archiveofourown.org/users/username" value={metadata.author_links?.[author] ?? ''} onChange={e => field('author_links', { ...metadata.author_links, [author]: e.target.value })} /></label>)}</div>}
    <label>Summary<textarea rows={5} value={metadata.summary} onChange={e => field('summary', e.target.value)} /></label>
    <div className="form-grid"><label>AO3 rating<select aria-label="AO3 rating" value={metadata.rating} onChange={e => field('rating', e.target.value)}><option value="">Unknown</option>{ratings.map(r => <option key={r}>{r}</option>)}</select></label><label>AO3 publication status<select aria-label="AO3 publication status" value={metadata.publication_status} onChange={e => field('publication_status', e.target.value as Metadata['publication_status'])}><option value="unknown">Unknown</option><option value="in_progress">In Progress</option><option value="complete">Complete</option><option value="abandoned">Abandoned</option></select></label></div>
    <p className="field-help">Abandoned means the author has discontinued the fic. Reading all published chapters moves it to Finished.</p>
    <div className="form-grid">{([['published_chapters', 'Published chapters'], ['total_chapters', 'Total chapters'], ['word_count', 'Word count']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min={key === 'total_chapters' ? 1 : 0} step="1" placeholder="Unknown (?)" value={metadata[key] ?? ''} onChange={e => field(key, e.target.value === '' ? null : Number(e.target.value))} /></label>)}</div>
    <label>Series names (one per line, manually entered)<textarea rows={2} value={series} onChange={e => setSeries(e.target.value)} /></label>
    <div className="form-grid"><label>Relationship tags (one per line)<textarea rows={3} value={relationships} onChange={e => setRelationships(e.target.value)} /></label><label>Characters (one per line)<textarea rows={3} value={characters} onChange={e => setCharacters(e.target.value)} /></label><label>Additional tags (one per line)<textarea rows={3} value={additionalTags} onChange={e => setAdditionalTags(e.target.value)} /></label></div>
    {otherTags && <label>Other or uncategorized AO3 tags (one per line)<textarea rows={3} value={otherTags} onChange={e => setOtherTags(e.target.value)} /></label>}</fieldset>}
    {section !== 'metadata' && <fieldset disabled={busy}><legend>Your reading & organization</legend><div className="form-grid reading-progress-row"><label>Reading status<select aria-label="Reading status" value={status} onChange={e => { setStatus(e.target.value as Status); setStatusTouched(true) }}>{Object.entries(statuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Last fully read chapter<input type="number" required min="0" step="1" value={progress} onChange={e => { setProgress(e.target.value); setStatusTouched(true) }} /><small>of {metadata.total_chapters ?? '?'} · next unread: {Number(progress) + 1}</small></label></div>
    <div className="rating-favorite-row"><StarRating value={personalRating} onChange={setPersonalRating} /><div className="favorite-choice"><FavoriteButton selected={favorite} disabled={busy} onChange={setFavorite} /></div></div>
    <label>Private notes<textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <div><span className="filter-name editable-field-heading">Personal tags<PersonalTagHelp /></span><PersonalTagInput value={tags} onChange={setTags} /></div>
    <div className="collection-choices"><div className="collection-heading"><strong>Custom collections</strong><NewCollectionButton iconOnly disabled={busy} onCreated={id => setCollections(current => [...current, id])} /></div><CollectionChoices collections={library.collections} selected={collections} onChange={setCollections} />{!library.collections.length && <p className="muted">Create a collection above to organize this story.</p>}</div></fieldset>}
    {error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save story'}</button>{onCancel ? <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button> : <Link className="button secondary" to="/library">Cancel</Link>}</div>
  </form>
}
