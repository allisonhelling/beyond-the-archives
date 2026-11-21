import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Dialog } from '../../components/Dialog'
import { sampleMode } from '../../lib/sample-mode'
import { chapterUrl, savedWorkUrl, statuses, storyOrganization, type Status, type Story, type StoryOrganization } from './model'
import { useLibrary } from './LibraryProvider'
import { CollectionChoices } from './collections/CollectionChoices'
import { PersonalTagInput } from './PersonalTagInput'
import { StarRating } from './StarRating'
import { loadStoryCompletion, loadStoryVersions, writeStoryCompletion, writeStoryVersions, type StoryCompletion, type StoryVersions as VersionSet } from './repository'
import { capturedStoryLinks, sourceLabel, storySourceVersion } from './story-source'
import { StoryChapterGroups } from './StoryChapterGroups'
import { publicationStatuses } from './publication-status'
import { readingLabel } from './chapter-edit'
import { Pagination } from './browsing/Pagination'

function VersionSummary({ story }: { story: Story }) {
 const [page, setPage] = useState(1)
 const size = 25
 const chapters = useMemo(() => Object.keys(story.work.verified_chapters ?? {}).map(Number)
  .filter(ordinal => Number.isInteger(ordinal) && ordinal > 0 && chapterUrl(story, ordinal))
  .sort((left, right) => left - right), [story])
 const pages = Math.max(1, Math.ceil(chapters.length / size)), current = Math.min(page, pages)
 return <section className="settings-card version-summary">
  <h3>{story.metadata.title}</h3>
  {story.metadata.authors.length > 0 && <p>By {story.metadata.authors.join(', ')}</p>}
  <p>{readingLabel(story) ?? statuses[story.reading_status]} · {story.last_read_chapter} / {story.metadata.published_chapters ?? '?'} Chapters Read</p>
  <p>{publicationStatuses[story.metadata.publication_status].label.replace(/ on AO3$/, '').replace(/^AO3 Status Unknown$/, 'Publication Status Unknown')}</p>
  {story.metadata.summary && <details><summary>Summary</summary><p>{story.metadata.summary}</p></details>}
  {!!story.metadata.ao3_tags.length && <details><summary>Source Tags</summary><p>{story.metadata.ao3_tags.join(', ')}</p></details>}
  {chapters.length > 0 && <details><summary>Verified Chapter Links</summary><ol>{chapters.slice((current - 1) * size, current * size).map(ordinal =>
   <li key={ordinal} value={ordinal}><a href={chapterUrl(story, ordinal)!} target="_blank" rel="noreferrer">Chapter {ordinal}</a></li>
  )}</ol>{pages > 1 && <Pagination page={current} pages={pages} size={size} total={chapters.length} onPage={setPage} itemLabel="chapters" />}</details>}
  <a className="clickable-text" href={savedWorkUrl(story)} target="_blank" rel="noreferrer">{sourceLabel(story)}</a>
 </section>
}

function OrganizationReview({ versions, shared, busy, action, onSave }: {
 versions: Story[]; shared?: StoryOrganization; busy: boolean; action: string; onSave: (settings: StoryOrganization) => void
}) {
 const { collections } = useLibrary()
 const [draft, setDraft] = useState<StoryOrganization>(() => shared ?? { favorite: false, rating: null, collections: [], tags: [], notes: '' })
 const names = new Map(collections.map(collection => [collection.id, collection.name]))
 const list = (values: string[]) => values.join(', ') || 'None'
 return <form className="story-form" onSubmit={event => { event.preventDefault(); onSave(draft) }}>
  <h3>Reconcile Shared Settings</h3>
  <p>Choose the settings for the linked story. Each source keeps its original settings, reading progress, and history.</p>
  <fieldset disabled={busy}>
   <div className="form-grid version-grid">{versions.map(version => {
    const source = version.sourceOrganization ?? storyOrganization(version)
    return <section className="settings-card" key={version.id}>
     <h4>{version.metadata.title} · {sourceLabel(version)}</h4>
     <dl>
      <div className="version-personal"><div><dt>Favorite</dt><dd>{source.favorite ? 'Yes' : 'No'}</dd></div>
      <div><dt>Personal Rating</dt><dd>{source.rating === null ? 'Unrated' : `${source.rating}/5`}</dd></div></div>
      <dt>Collections</dt><dd>{list(source.collections.map(id => names.get(id) ?? id))}</dd>
      <dt>Personal Tags</dt><dd>{list(source.tags)}</dd>
      <dt>Private Notes</dt><dd className="story-summary">{source.notes || 'None'}</dd>
     </dl>
     <button type="button" className="button secondary"
      aria-label={`Copy Settings From ${version.metadata.title} · ${sourceLabel(version)}`}
      onClick={() => setDraft(source)}>Copy These Settings</button>
    </section>
   })}</div>
   <div className="version-personal"><label className="check-label"><input type="checkbox" checked={draft.favorite} onChange={event => setDraft({ ...draft, favorite: event.target.checked })} />Shared Favorite</label>
   <StarRating value={draft.rating} onChange={rating => setDraft({ ...draft, rating })} /></div>
   <fieldset><legend>Shared Collections</legend><CollectionChoices collections={collections} selected={draft.collections} onChange={selected => setDraft({ ...draft, collections: selected })} /></fieldset>
   <fieldset><legend>Shared Personal Tags</legend><PersonalTagInput value={draft.tags} onChange={tags => setDraft({ ...draft, tags })} /></fieldset>
   <label>Shared Private Notes<textarea rows={4} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
   <button type="submit" className="button primary">{action}</button>
  </fieldset>
 </form>
}

function SharedStoryCompletion({ story }: { story: Story }) {
 const [completion, setCompletion] = useState<StoryCompletion | null>()
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 useEffect(() => {
  let current = true
  void loadStoryCompletion(story.id).then(value => { if (current) setCompletion(value) }, (reason: Error) => { if (current) setError(reason.message) })
  return () => { current = false }
 }, [story.id, story.updated_at, story.last_read_chapter, story.metadata.published_chapters])
 async function save(status: Status | null, prompt?: string) {
  if (!completion) return
  setBusy(true); setError('')
  try {
   await writeStoryCompletion(story.id, status, completion, prompt)
   setCompletion(await loadStoryCompletion(story.id))
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save story completion.') }
  finally { setBusy(false) }
 }
 const unread = story.metadata.published_chapters === null ? 0 : story.metadata.published_chapters - story.last_read_chapter
 return <>
  {completion && <section aria-label="Linked Story Status" className="form-actions">
   <label>Linked Story Status<select disabled={busy} value={completion.override ?? ''} onChange={event => void save(event.target.value as Status || null)}>
    <option value="">{completion.status && !completion.override ? `${statuses[completion.status]} (From Reviewed Versions)` : 'From Reviewed Versions'}</option>
    {Object.entries(statuses).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
   </select></label>
   {completion.status === 'finished' && unread > 0 && <p>This source has {unread} unread {unread === 1 ? 'chapter' : 'chapters'}.</p>}
   {completion.prompt && <div>
    <span>A linked version is caught up and another still has unread chapters.</span>
    <button type="button" className="button secondary" disabled={busy} onClick={() => void save('finished', completion.prompt!)}>Mark Shared Story Finished</button>
    <button type="button" className="button secondary" disabled={busy} onClick={() => void save(null, completion.prompt!)}>Keep Separate</button>
   </div>}
  </section>}
  {error && <p role="alert">{error}</p>}
 </>
}

function CompareVersions({ story, onClose, onChanged }: { story: Story; onClose: () => void; onChanged: (ids: string[]) => Promise<void> }) {
 const location = useLocation()
 const [versions, setVersions] = useState<VersionSet>()
 const [review, setReview] = useState<{ versionSet: VersionSet; target?: Story }>()
 const target = review?.target
 const reviewedSource = review?.versionSet.versions.find(version => version.id === story.id)
 const [comparedId, setComparedId] = useState('')
 const [query, setQuery] = useState('')
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const currentSource = versions?.versions.find(version => version.id === story.id)
 const otherVersions = versions?.versions.filter(version => version.id !== story.id) ?? []
 const compared = otherVersions.find(version => version.id === comparedId) ?? otherVersions[0]
 const sourceLinks = useMemo(() => new Set(capturedStoryLinks(story)), [story])
 const sourceUrl = storySourceVersion(story).normalizedUrl
 useEffect(() => {
  let current = true
  void loadStoryVersions(story).then(value => { if (current) setVersions(value) }, (reason: Error) => { if (current) setError(reason.message) })
  return () => { current = false }
 }, [story])
 async function search() {
  setBusy(true); setError(''); setReview(undefined)
  try { setVersions(await loadStoryVersions(story, query)) }
  catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not find saved versions.') }
  finally { setBusy(false) }
 }
 async function change(action: 'link' | 'unlink' | 'prefer' | 'reconcile', selected: Story, organization?: StoryOrganization) {
  if (!versions) return
  setBusy(true); setError('')
  try {
   await writeStoryVersions(story.id, selected, action, organization && review ? review.versionSet.revision : versions.revision, organization)
   const entries = new Set([...versions.versions.map(version => version.id), selected.id])
   setVersions(await loadStoryVersions(story))
   setReview(undefined)
   await onChanged([...entries])
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the story versions.') }
  finally { setBusy(false) }
 }
 return <Dialog title="Compare Versions" className="story-versions-dialog" onClose={onClose} busy={busy}>
  {error && <p role="alert">{error} <button type="button" className="text-button" disabled={busy} onClick={() => void search()}>Reload Versions</button></p>}
  {!versions && !error && <p role="status">Loading saved versions…</p>}
  {versions && <>
   <div className="form-grid version-grid">{versions.versions.map((version, index) => <div key={version.id}>
    <VersionSummary story={version} />
    {versions.versions.length > 1 && <div className="form-actions">
     {index === 0 ? <span>Preferred Version</span> : <button type="button" className="button secondary" disabled={busy} onClick={() => void change('prefer', version)}>Make Preferred Version</button>}
     {version.id !== story.id && <Link to={`/stories/${version.id}`} state={location.state} onClick={onClose}>View Version</Link>}
     <button type="button" className="button secondary" disabled={busy} onClick={() => void change('unlink', version)}>Unlink {sourceLabel(version)} Version</button>
    </div>}
   </div>)}{target && <VersionSummary story={target} />}</div>
   {currentSource?.organizationGroup && versions.versions.length === 2 && <p className="field-help">Unlinking either version restores each source’s saved settings and discards the group’s shared settings.</p>}
   {currentSource && !currentSource.organizationGroup && otherVersions.length > 0 && !review && <button type="button" className="button secondary" disabled={busy} onClick={() => setReview({ versionSet: versions })}>Review Shared Settings</button>}
   {currentSource && review && !target && <OrganizationReview key={review.versionSet.revision} versions={review.versionSet.versions} busy={busy} action="Save Shared Settings"
    onSave={settings => void change('reconcile', currentSource, settings)} />}
   {currentSource && compared && <>
    {otherVersions.length > 1 && <label>Compare Chapters With<select value={compared.id} disabled={busy} onChange={event => setComparedId(event.target.value)}>
     {otherVersions.map((version, index) => <option value={version.id} key={version.id}>{index + 1}. {version.metadata.title} · {sourceLabel(version)}</option>)}
    </select></label>}
    <StoryChapterGroups key={compared.id} source={currentSource} target={compared} revision={versions.revision} onChanged={async () => {
     setVersions(await loadStoryVersions(story))
     await onChanged([story.id, compared.id])
    }} />
   </>}
   <form className="story-form" onSubmit={event => { event.preventDefault(); void search() }}>
    <label>Find Another Saved Version<input type="search" placeholder="Search library for story name" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} disabled={busy} /></label>
    <button className="button secondary" disabled={busy}>Search</button>
   </form>
   {versions.candidates.length > 0 && <section>
    <h3>Possible Crossposts</h3>
    <p>Review the sources before linking. A matching title or author cannot establish chapter equivalence.</p>
    <ul>{versions.candidates.map(candidate => <li key={candidate.id}>
     <button type="button" className="button secondary" disabled={busy} onClick={() => { setError(''); setReview({ target: candidate, versionSet: versions }) }}>{candidate.metadata.title} · {sourceLabel(candidate)}</button>
    </li>)}</ul>
   </section>}
   {target && review && reviewedSource && <section>
    <h3>Review Selected Version</h3>
    {sourceUrl && sourceLinks.has(storySourceVersion(target).normalizedUrl ?? '') && capturedStoryLinks(target).includes(sourceUrl) && <p>The captured source summaries link to each other.</p>}
    <OrganizationReview key={target.id} versions={[...review.versionSet.versions, target]} shared={reviewedSource.organizationGroup ? storyOrganization(reviewedSource) : undefined}
     busy={busy} action="Confirm Same Story" onSave={settings => void change('link', target, settings)} />
   </section>}
   {review && <button type="button" className="button secondary" disabled={busy} onClick={() => setReview(undefined)}>Cancel Shared Settings Review</button>}
  </>}
 </Dialog>
}

export function StoryVersions({ story, source, example = false, onChanged }: { story: Story; source: ReactNode; example?: boolean; onChanged: (ids: string[]) => Promise<void> }) {
 const [open, setOpen] = useState(false)
 const [reviewRevision, setReviewRevision] = useState(0)
 return <div className="details-published-on">
  <dt className="published-on-heading"><span>Published On</span>{!example && <button type="button" className="button secondary compact version-trigger" disabled={sampleMode} onClick={() => setOpen(true)}>{story.crosspost_group_id ? 'Compare Versions' : 'Link Crosspost'}</button>}</dt>
  <dd>{source}
  {story.crosspost_group_id && <>
   <p className="field-help">{story.organizationGroup ? 'Favorites, collections, ratings, personal tags, and notes are shared across linked versions.' : 'Review shared settings in Compare Versions.'}</p>
   <SharedStoryCompletion key={`${story.id}:${reviewRevision}`} story={story} />
  </>}
  {open && <CompareVersions key={story.id} story={story} onClose={() => { setOpen(false); setReviewRevision(value => value + 1) }} onChanged={onChanged} />}
  </dd>
 </div>
}
