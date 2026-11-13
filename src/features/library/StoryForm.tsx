import { sourceLocation, sourceIdentityKey, fieldConfidence, SourceDuplicateError, type SourceDuplicateCandidate } from './story-source'
import { chapterReview, explicitReadingStatus, reviewedChapterProgress, type ChapterChoice } from './chapter-edit'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { ChapterReadingHistory } from './ChapterReadingHistory'
import { InfoTooltip } from '../../components/InfoTooltip'
import { useActivity } from '../../lib/use-activity'
import { BookFusionFields } from './bookfusion/BookFusionFields'
import { validateBookFusionLink } from './bookfusion/bookfusion'
import { EditConflictReview } from './EditConflictReview'
import { editSnapshot, EditConflict } from './edit-merge'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { authorPageUrl, blankMetadata, changedMetadata, initialProgress, progressReadingStatus, isOneShot, parseLines, parseWorkUrl, ratingLabel, ratings, savedWorkUrl, statuses, tagNames, validateProgress, type Metadata, type Status, type Story } from './model'
import { saveStory } from './repository'
import { StarRating } from './StarRating'
import { FavoriteButton, PersonalToggleButton } from './FavoriteButton'
import { useLibrary } from './LibraryProvider'
import { CollectionChoices, NewCollectionButton } from './collections/CollectionChoices'
import { PersonalTagInput } from './PersonalTagInput'
import { FilePicker } from '../../components/FilePicker'
import { epubMaxBytes, readEpub } from '../imports/epub'
export function StoryForm({ story, onCancel, section = 'all' }: { story?: Story; onCancel?: () => void; section?: 'all' | 'metadata' | 'reading' }) {
  const library = useLibrary(), navigate = useNavigate(), [params] = useSearchParams(), location = useLocation()
  const ensureCatalog = library.ensureCatalog
  useEffect(() => { if (!story && ensureCatalog) void ensureCatalog().catch(() => {}) }, [story, ensureCatalog])
  const [duplicates, setDuplicates] = useState<SourceDuplicateCandidate[]>([])
  const [metadata, setMetadata] = useState<Metadata>(story?.metadata ?? { ...blankMetadata })
  const [url, setUrl] = useState(story ? savedWorkUrl(story) : '')
  const [status, setStatus] = useState<Status>(story?.reading_status ?? (params.get('mode') === 'finished' ? 'finished' : params.get('mode') === 'starting' ? 'reading' : 'to_read'))
  const [statusTouched, setStatusTouched] = useState(Boolean(story) || params.has('mode'))
  const [progress, setProgress] = useState(String(story?.last_read_chapter ?? 0))
  const [publicationConfirmed, setPublicationConfirmed] = useState(false)
  const [statusChanged, setStatusChanged] = useState(false)
  const [progressChanged, setProgressChanged] = useState(false)
  const initialFinishedProgress = !story && status === 'finished' && !progressChanged ? metadata.published_chapters ?? metadata.total_chapters : null
  const readProgress = initialFinishedProgress ?? Number(progress)
  const [reviewOpen, setReviewOpen] = useState(false), [reviewRecords, setReviewRecords] = useState(false)
  const [reviewChoice, setReviewChoice] = useState<ChapterChoice>('keep_read')
  let universal = Boolean(story?.source_url)
  if (!story && url) try { universal = sourceLocation(url).identity.kind === 'url' } catch { /* Submission validates. */ }
  const [notes, setNotes] = useState(story?.notes ?? '')
  const [personalRating, setPersonalRating] = useState<number | null>(story?.personal_rating ?? null)
  const [rec, setRec] = useState(story?.is_rec ?? false)
  const [favorite, setFavorite] = useState(story?.is_favorite ?? false)
  const [collections, setCollections] = useState(story?.collectionIds ?? [])
  const [tags, setTags] = useState(story?.personalTags ?? [])
  const [authors, setAuthors] = useState(metadata.authors.join('\n')), [fandoms, setFandoms] = useState(metadata.fandoms.join('\n')), [otherTags, setOtherTags] = useState(metadata.ao3_tags.filter(tag => ![...tagNames(metadata, 'relationship'), ...tagNames(metadata, 'character'), ...tagNames(metadata, 'freeform')].includes(tag)).join('\n'))
  const [relationships, setRelationships] = useState(tagNames(metadata, 'relationship').join('\n'))
  const [characters, setCharacters] = useState(tagNames(metadata, 'character').join('\n'))
  const [additionalTags, setAdditionalTags] = useState(tagNames(metadata, 'freeform').join('\n'))
  const [series, setSeries] = useState(metadata.series?.join('\n') ?? '')
  const [initialMetadata] = useState(story?.metadata)
  const [base] = useState(story ? editSnapshot(story) : undefined)
  const [conflict, setConflict] = useState<EditConflict | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useActivity(Boolean(busy), 'Processing your story…')
  const [epubMessage, setEpubMessage] = useState('')
  async function importEpub(file: File) {
    setError(''); setEpubMessage(''); setBusy(true)
    try {
      if (file.size > epubMaxBytes) throw new Error('Choose an EPUB smaller than 50 MB.')
      const imported = await readEpub(await file.arrayBuffer())
      if (story?.work.ao3_work_id && imported.url && parseWorkUrl(imported.url).workId !== story.work.ao3_work_id) throw new Error('This EPUB belongs to a different AO3 work. Add it as a separate story.')
      const next = { ...editedMetadata(), ...imported.metadata, ...(metadata.publication_status === 'deleted' ? { publication_status: 'deleted' as const } : {}) }
      setMetadata(next)
      setAuthors(next.authors.join('\n')); setFandoms(next.fandoms.join('\n')); setSeries(next.series?.join('\n') ?? '')
      setRelationships(tagNames(next, 'relationship').join('\n')); setCharacters(tagNames(next, 'character').join('\n')); setAdditionalTags(tagNames(next, 'freeform').join('\n'))
      setOtherTags(next.ao3_tags.filter(tag => ![...tagNames(next, 'relationship'), ...tagNames(next, 'character'), ...tagNames(next, 'freeform')].includes(tag)).join('\n'))
      if (!story && imported.url) setUrl(imported.url)
      setEpubMessage(`EPUB metadata loaded. Review the fields below, then save.${!imported.url && !story ? ' The original AO3 URL was not found; enter it below.' : ''}`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not read the EPUB file.') }
    finally { setBusy(false) }
  }
  function field<K extends keyof Metadata>(key: K, value: Metadata[K]) { setMetadata(m => ({ ...m, [key]: value })) }
  function editedMetadata(): Metadata {
    return { ...metadata, ...(metadata.bookfusion_link !== undefined && { bookfusion_link: metadata.bookfusion_link?.url.trim() ? validateBookFusionLink(metadata.bookfusion_link) : null }), manual_url: url, ...(!story && { chapter_count_manual: metadata.chapter_count_manual ?? false }), title: metadata.title.trim(), authors: parseLines(authors), fandoms: parseLines(fandoms), ao3_tags: [...new Set([...parseLines(otherTags), ...parseLines(relationships), ...parseLines(characters), ...parseLines(additionalTags)])], relationship_tags: parseLines(relationships), character_tags: parseLines(characters), additional_tags: parseLines(additionalTags), series: parseLines(series) }
  }
  function urlDefaults() {
    if (story || statusTouched) return
    try { const defaults = initialProgress(url); setStatus(defaults.status); setProgress(String(defaults.lastRead)) } catch { /* Submission reports validation. */ }
  }
  async function saved(id: unknown) {
    await library.refreshStory(String(id ?? story?.id)).catch(() => {})
    if (onCancel) onCancel()
    else navigate(`/stories/${String(id)}`, { state: location.state })
  }
  function failed(error: unknown) {
    if (error instanceof SourceDuplicateError) { setDuplicates(error.candidates); setError('') }
    else if (error instanceof EditConflict) { setConflict(error); setError('') }
    else setError(error instanceof Error ? error.message : 'Could not save story.')
  }
  async function submit(event?: FormEvent, choice?: ChapterChoice, saveSeparately = false) {
    event?.preventDefault(); if (conflict) return; setError('')
    try {
      const identity = story?.work.ao3_work_id === null && (url === story.original_url || url === story.source_url) ? null : sourceLocation(url).identity
      if (story && identity && (identity.kind !== 'native' || Number(identity.nativeWorkId) !== story.work.ao3_work_id)) throw new Error('This URL belongs to a different work. Add it as a separate story to preserve the original record.')
      if (!story && universal && (metadata.published_chapters === null || !Number.isInteger(metadata.published_chapters) || metadata.published_chapters < 1 || metadata.published_chapters > 100000)) throw new Error('Enter a whole published chapter count from 1 to 100,000.')
      if (!story && !saveSeparately) {
        const candidate = sourceLocation(url)
        const matches = (library.stories ?? []).flatMap(existing => {
          try {
            const saved = existing.source_url ? sourceLocation(existing.source_url) : existing.work.ao3_work_id ? sourceLocation(`https://archiveofourown.org/works/${existing.work.ao3_work_id}`) : null
            if (!saved) return []
            const exact = sourceIdentityKey(candidate.identity) === sourceIdentityKey(saved.identity)
            const a = new URL(candidate.normalizedUrl), b = new URL(saved.normalizedUrl)
            return exact || a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '') ? [{ id: existing.id, title: existing.metadata.title, exact }] : []
          } catch { return [] }
        })
        if (matches.length) { setDuplicates(matches); return }
      }
      if (!metadata.title.trim()) throw new Error('A title is required.')
      for (const key of ['published_chapters', 'total_chapters', 'word_count'] as const) {
        const value = metadata[key]
        if (value !== null && (!Number.isInteger(value) || value < (key === 'total_chapters' ? 1 : 0) || value > 2147483647)) throw new Error('Enter valid whole chapter and word counts, or leave unknown values blank.')
      }
      if (!universal && metadata.published_chapters !== null && metadata.total_chapters !== null && metadata.published_chapters > metadata.total_chapters && (!story || metadata.total_chapters !== initialMetadata?.total_chapters)) throw new Error('Published chapters cannot exceed the total.')
      if (!progress.trim()) throw new Error('Enter the number of fully read chapters.')
      const progressMetadata = story && !publicationConfirmed && metadata.publication_status === story.metadata.publication_status && ['abandoned','deleted'].includes(metadata.publication_status) && fieldConfidence(story,'publication_status') !== 'manual' ? { ...metadata, publication_status: 'unknown' as const } : metadata
      const review = chapterReview(story, metadata)
      if (review && !choice) { setReviewChoice(review === 'increase' ? 'keep_read' : 'reduce'); setReviewOpen(true); return }
      let nextReading = story && choice ? reviewedChapterProgress(story, progressMetadata, choice) : { progress: readProgress, status }
      const metadataReadingEvent = story ? metadata.published_chapters !== story.metadata.published_chapters || metadata.publication_status !== story.metadata.publication_status || publicationConfirmed : universal
      if (!choice && !statusChanged && (progressChanged || metadataReadingEvent || story && !explicitReadingStatus(story))) {
        const protectedStatus = !progressChanged && ['finished','re_reading','paused_reading','did_not_finish'].includes(status) && (!story || explicitReadingStatus(story))
        if (!protectedStatus) nextReading = { progress: readProgress, status: progressReadingStatus(readProgress, progressMetadata, status) }
      }
      validateProgress(nextReading.progress, metadata)
      const authorLinks: Record<string, string> = {}
      if (section !== 'reading') for (const author of parseLines(authors)) {
        const value = metadata.author_links?.[author]?.trim()
        if (!value) continue
        const link = authorPageUrl(value)
        if (!link) throw new Error(`Enter a valid AO3 author page URL for ${author}.`)
        authorLinks[author] = link
      }
      setBusy(true)
      const nextMetadata: Metadata = section === 'reading' && story ? story.metadata : { ...editedMetadata(), author_links: authorLinks }
      const id = await saveStory({ allowSeparate: saveSeparately, id: story?.id, base, url, metadata: nextMetadata, statusOrigin: statusChanged || choice === 'read_all' || choice === 'keep_finished' ? 'explicit' : choice === 'reduce' && story && explicitReadingStatus(story) && nextReading.status === story.reading_status ? 'preserve' : choice || progressChanged || nextReading.status !== status || story && !explicitReadingStatus(story) ? 'derived' : 'preserve', ...(choice && { chapterChoice: choice }), metadataChanges: story ? { ...changedMetadata(initialMetadata!, nextMetadata), ...(publicationConfirmed && { publication_status: metadata.publication_status }) } : undefined, status: nextReading.status, progress: nextReading.progress, notes, personalRating, favorite, rec, collections, tags: section === 'metadata' && base ? base.tags as string[] : tags })
      await saved(id)
    } catch (e) { failed(e) }
    finally { setBusy(false) }
  }
  return <form className="story-form" onSubmit={e => void submit(e)}>{section !== 'reading' && <fieldset disabled={busy || Boolean(conflict)}><legend>Story Metadata · Manually Entered Private Overrides</legend><p className="muted">Your corrections are private overrides. Automatic metadata refresh preserves them.</p>
    <FilePicker label="Recover Metadata from EPUB" accept=".epub,application/epub+zip" disabled={busy || Boolean(conflict)} onChange={files => void importEpub(files[0])} />
    <p className="field-help">Recover information from a downloaded EPUB, including a deleted work. The file is read on your device; only reviewed metadata is saved. Choose Deleted under AO3 Publication Status if appropriate. Reading history and personal details stay unchanged.</p>
    {epubMessage && <p role="status">{epubMessage}</p>}
    <label>Story URL<input required type="url" readOnly={Boolean(story?.source_url) || story?.work.ao3_work_id === null} value={url} onChange={e => { setUrl(e.target.value); setDuplicates([]) }} onBlur={urlDefaults} /></label>
    <p className="field-help">{story ? story.source_url ? 'The submitted source URL is preserved. Add a separate story for a different source; source identity is not verified.' : 'You can update the link for this work. The original submission is preserved separately; work identity cannot be changed.' : 'Chapter IDs are not chapter numbers. Unverified links do not set progress; enter chapters read below.'}</p>
    <BookFusionFields value={metadata.bookfusion_link} onChange={value => field('bookfusion_link', value)} />
    <label>Title<input required value={metadata.title} onChange={e => field('title', e.target.value)} /></label>
    <div className="form-grid"><label>Authors (one per line)<textarea rows={3} value={authors} onChange={e => setAuthors(e.target.value)} /></label><label>Fandoms (one per line)<textarea rows={3} value={fandoms} onChange={e => setFandoms(e.target.value)} /></label></div>
    {!!parseLines(authors).length && <div className="form-grid">{parseLines(authors).map(author => <label key={author}>AO3 Author Page for {author} (optional)<input type="url" placeholder="https://archiveofourown.org/users/username" value={metadata.author_links?.[author] ?? ''} onChange={e => field('author_links', { ...metadata.author_links, [author]: e.target.value })} /></label>)}</div>}
    <label>Summary<textarea rows={5} value={metadata.summary} onChange={e => field('summary', e.target.value)} /></label>
    <div className="form-grid"><label>AO3 Rating<select aria-label="AO3 Rating" value={metadata.rating} onChange={e => field('rating', e.target.value)}><option value="">Unknown</option>{ratings.map(r => <option key={r} value={r}>{ratingLabel(r)}</option>)}</select></label><label>{universal ? 'Publication Status' : 'AO3 Publication Status'}<select aria-label={universal ? 'Publication Status' : 'AO3 Publication Status'} value={metadata.publication_status} onChange={e => { field('publication_status', e.target.value as Metadata['publication_status']); setPublicationConfirmed(true) }}><option value="unknown">Unknown</option><option value="in_progress">In Progress</option><option value="complete">Complete</option><option value="hiatus">On Hiatus</option><option value="abandoned">Abandoned</option><option value="deleted">Deleted</option></select></label></div>
    {story && ['abandoned','deleted'].includes(metadata.publication_status) && fieldConfidence(story,'publication_status') !== 'manual' && <label className="check-label"><input type="checkbox" checked={publicationConfirmed} onChange={event => setPublicationConfirmed(event.target.checked)} />I Confirm This Publication Status</label>}
    <p className="field-help">Abandoned means the author has discontinued the fic. Reading all published chapters moves it to Finished.</p>
    <div className="form-grid">{([['published_chapters', 'Published Chapters'], ['total_chapters', 'Planned Total Chapters'], ['word_count', 'Word Count']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min={key === 'total_chapters' || key === 'published_chapters' && universal && !story ? 1 : 0} max={key === 'published_chapters' && universal && !story ? 100000 : 2147483647} step="1" placeholder="Unknown (?)" value={metadata[key] ?? ''} onChange={e => field(key, e.target.value === '' ? null : Number(e.target.value))} /></label>)}</div>
    {metadata.published_chapters !== null && metadata.total_chapters !== null && metadata.published_chapters > metadata.total_chapters && <p role="status" className="field-help">The planned total is below the published count. It will be retained separately; review the plan if it has changed.</p>}
    <label className="check-label"><input type="checkbox" checked={metadata.chapter_count_manual ?? false} onChange={e => field('chapter_count_manual', e.target.checked)} />Manually Entered Chapter Count</label>
    <p className="field-help">Check to confirm your count. Unchecked counts remain unconfirmed. Published and planned totals are stored separately.</p>
    <div className="editable-field-heading"><label className="check-label"><input type="checkbox" checked={isOneShot({ ...metadata, ao3_tags: [...parseLines(otherTags), ...parseLines(relationships), ...parseLines(characters), ...parseLines(additionalTags)], additional_tags: parseLines(additionalTags) }, section === 'metadata' && story ? story.personalTags : tags)} onChange={event => field('one_shot', event.target.checked)} />One-Shot</label>
    <InfoTooltip description="Automatically marked for complete one-chapter works or One-shot, One shot, or Oneshot tags. You can correct this label, including works with extra art or other chapters." label="One-Shot Help" size={14} /></div>
    <label>Series Names (one per line, manually entered)<textarea rows={2} value={series} onChange={e => setSeries(e.target.value)} /></label>
    <div className="form-grid"><label>Relationship Tags (one per line)<textarea rows={3} value={relationships} onChange={e => setRelationships(e.target.value)} /></label><label>Characters (one per line)<textarea rows={3} value={characters} onChange={e => setCharacters(e.target.value)} /></label><label>Additional Tags (one per line)<textarea rows={3} value={additionalTags} onChange={e => setAdditionalTags(e.target.value)} /></label></div>
    {otherTags && <label>Other or Uncategorized AO3 Tags (one per line)<textarea rows={3} value={otherTags} onChange={e => setOtherTags(e.target.value)} /></label>}</fieldset>}
    {section !== 'metadata' && <fieldset disabled={busy || Boolean(conflict)}><legend>Your Reading & Organization</legend><div className="form-grid reading-progress-row"><label>Reading Status<select aria-label="Reading Status" value={status} onChange={e => { const next = e.target.value as Status; setStatus(next); setStatusTouched(true); setStatusChanged(true); if (next === 'finished') setProgress(String(metadata.published_chapters ?? metadata.total_chapters ?? readProgress)); if (next === 're_reading') setProgress('0') }}>{Object.entries(statuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Last Fully Read Chapter<input type="number" required min="0" step="1" value={initialFinishedProgress ?? progress} onChange={e => { setProgress(e.target.value); setStatusTouched(true); setProgressChanged(true) }} /><small>of {metadata.published_chapters ?? '?'} published · {metadata.published_chapters !== null && readProgress === metadata.published_chapters ? 'all published chapters read' : `next unread: ${readProgress + 1}`}</small></label></div>
    <div className="rating-favorite-row"><StarRating value={personalRating} onChange={setPersonalRating} /><div className="favorite-choice"><FavoriteButton selected={favorite} disabled={busy || Boolean(conflict)} onChange={setFavorite} /><PersonalToggleButton kind="rec" selected={rec} disabled={busy || Boolean(conflict)} onChange={setRec} /></div></div>
    <label>Private Notes<textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <div><span className="filter-name editable-field-heading">Personal Tags</span><PersonalTagInput value={tags} onChange={setTags} /></div>
    <div className="collection-choices"><div className="collection-heading"><strong>Custom Collections</strong><NewCollectionButton iconOnly disabled={busy || Boolean(conflict)} onCreated={id => setCollections(current => [...current, id])} /></div><CollectionChoices collections={library.collections} selected={collections} onChange={setCollections} />{!library.collections.length && <p className="muted">Create a collection above to organize this story.</p>}</div></fieldset>}
    {duplicates.length > 0 && <section className="settings-card" role="alert"><h2>Review Similar Story URLs</h2><p>No identity match has been verified. Open an existing story or explicitly save a distinct URL separately.</p><ul>{duplicates.map(existing => <li key={existing.id}><Link to={`/stories/${existing.id}`}>{existing.title}</Link></li>)}</ul><div className="form-actions">{!duplicates.some(match => match.exact) && <button type="button" className="button secondary" onClick={() => { setDuplicates([]); void submit(undefined, undefined, true) }}>Save Separately</button>}<button type="button" className="button secondary" onClick={() => setDuplicates([])}>Cancel</button></div></section>}
    {reviewRecords && story && <section className="settings-card" aria-label="Review Chapter Records"><h2>Review Chapter Records</h2><p>Current progress: {story.last_read_chapter}; new published total: {metadata.published_chapters}. Historical events will be preserved.</p><dl><ChapterReadingHistory history={story.reading_history} published={metadata.published_chapters} chapterLinks={story.work.verified_chapters} /></dl><button type="button" className="button secondary" onClick={() => setReviewRecords(false)}>Close Review</button></section>}
    {reviewOpen && story && <ConfirmationDialog title={chapterReview(story, metadata) === 'reduce' ? 'Review Chapter Progress' : 'Review Finished Status'} confirmLabel={reviewChoice === 'reduce' ? `Reduce Current Progress to ${metadata.published_chapters}/${metadata.published_chapters}` : 'Apply Choice and Save'} pendingLabel="Saving…" onClose={() => setReviewOpen(false)} onConfirm={() => submit(undefined, reviewChoice)}>
      <p>Published chapters: {story.metadata.published_chapters ?? '?'} → {metadata.published_chapters}. Current chapters read: {story.last_read_chapter}.</p>
      {chapterReview(story, metadata) === 'reduce' ? <><p>Your current reading progress will be reduced by {story.last_read_chapter - metadata.published_chapters!} chapters. Chapter-read events and reread history will be retained; out-of-range records will be flagged for review.</p><button type="button" className="button secondary" onClick={() => { setReviewOpen(false); setReviewRecords(true) }}>Review Chapter Progress Before Saving</button></> : <fieldset><legend>Choose How to Continue</legend>{([['keep_read', `Keep ${story.last_read_chapter} Read`], ['read_all', `I've Read All ${metadata.published_chapters}`], ['keep_finished', 'Keep Finished as Manual Override']] as const).map(([value, label]) => <label className="check-label" key={value}><input type="radio" name="chapter-choice" value={value} checked={reviewChoice === value} onChange={() => setReviewChoice(value)} />{label}</label>)}</fieldset>}
    </ConfirmationDialog>}
    {conflict && <EditConflictReview key={JSON.stringify(conflict.review)} conflict={conflict} collections={library.collections} onSaved={saved} onError={failed} onCancel={() => setConflict(null)} />}
    {error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button primary" disabled={busy || Boolean(conflict)} type="submit">{busy ? 'Saving…' : 'Save Story'}</button>{onCancel ? <button type="button" className="button secondary" disabled={busy || Boolean(conflict)} onClick={onCancel}>Cancel</button> : <Link className="button secondary" to="/library">Cancel</Link>}</div>
  </form>
}
