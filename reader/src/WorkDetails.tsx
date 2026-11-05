import { WorkSummary } from '../../src/features/library/summaries/WorkSummary'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { Dialog } from '../../src/components/Dialog'
import { dateFields, facets, numericFields } from './filters'
import { isAnthology, statuses, type BookDetails } from './model'
import { workTags } from './metadata'
import { PublicationStatusIndicator } from '../../src/features/library/PublicationStatusIndicator'
import { WorkTags } from './WorkTags'
import { anthologyLabel, workChapters } from './anthology'
import { organizerAppUrl } from '../../src/lib/connected-login'

function savedValue(value: string | number | boolean | null | undefined) {
  return value === null || value === undefined || value === '' ? 'Unknown / Not Saved' : typeof value === 'number' ? value.toLocaleString() : typeof value === 'boolean' ? value ? 'Yes' : 'No' : value
}
export function WorkDetails({ book, onClose, onReview, onOpenWork, onCheckLinks, organizerAccount, appearance }: { book: BookDetails; onClose: () => void; onReview?: () => void; onOpenWork?: (workId: string) => void; onCheckLinks?: () => void; organizerAccount?: string; appearance: TagAppearance }) {
  const metadata = book.metadata, chapter = book.chapters.find(chapter => chapter.id === book.position.chapter)
  const rows = [
    { label: 'Summary', value: metadata.summary },
    ...facets.filter(facet => !['status', 'collection', 'version', 'fandomCount'].includes(facet.key)).map(facet => ({ label: facet.label, value: facet.values(book) })),
    ...numericFields.map(field => ({ label: field.label, value: field.value(book) })),
    { label: 'Total Chapters', value: metadata.total_chapters },
    { label: 'One-Shot', value: metadata.one_shot },
    { label: 'Language Code', value: metadata.language_code },
    ...dateFields.map(field => ({ label: field.label, value: field.value(book) })),
    { label: 'Metadata Snapshot Saved', value: book.metadataAt },
    { label: 'Source Work Link', value: metadata.manual_url },
    { label: 'Calibre Work Link', value: metadata.calibre_work_link },
    { label: 'Author Links', value: Object.entries(metadata.author_links ?? {}).map(([name, url]) => `${name}: ${url}`) },
    { label: 'Series Memberships', value: metadata.series_memberships?.map(series => `${series.name}${series.position === null ? '' : ` · Part ${series.position}`} · ${series.url}`) },
    { label: 'AO3 Collections', value: metadata.ao3_collections },
    { label: 'BookFusion Link', value: metadata.bookfusion_link ? `${metadata.bookfusion_link.kind === 'bookmark' ? 'Bookmark' : 'Book'} · ${metadata.bookfusion_link.url}` : undefined },
  ]
  return <Dialog title="View Details" onClose={onClose} className="work-details" topEdgeLabel="Go to Details Top"><h3>{metadata.title}{'\u00a0'}<PublicationStatusIndicator portal status={metadata.publication_status} /></h3>
    <p className="muted">Information saved with this EPUB. Publication details may differ from the current online work.</p>
    {isAnthology(book) && <section aria-label="Anthology Contents"><h4>{anthologyLabel(book)}</h4><ol>{book.works!.map(work => {
      const chapters = workChapters(book, work).filter(chapter => chapter.kind !== 'frontmatter')
      const checked = Boolean(organizerAccount && work.account === organizerAccount), linked = checked && work.remote
      const href = linked ? new URL(`/stories/${encodeURIComponent(linked.id)}`, organizerAppUrl()).href : undefined
      const add = new URL('/add', organizerAppUrl())
      if (work.workId) { add.searchParams.set('import', 'link'); add.searchParams.set('url', `https://archiveofourown.org/works/${work.workId}`) }
      return <li key={work.key}><strong>{work.title}</strong> · {chapters.filter(chapter => book.completed.includes(chapter.id)).length} of {chapters.length} chapters read
        <p>{!work.workId ? 'AO3 work link needed.' : linked ? 'Organizer Linked' : checked ? 'Not in Organizer' : organizerAccount ? 'Organizer link not checked.' : 'Connect your organizer account to check this work.'}</p>
        <div className="form-actions">{href && <a href={href} target="_blank" rel="noopener noreferrer">View in Organizer</a>}{checked && !linked && work.workId && <a href={add.href} target="_blank" rel="noopener noreferrer">Add to Organizer</a>}{!work.workId && onReview && <button onClick={onReview}>Review Anthology Contents</button>}{work.workId && onOpenWork && <button onClick={() => onOpenWork(work.workId!)}>Read This Fic</button>}{work.workId && <a href={`https://archiveofourown.org/works/${work.workId}`} target="_blank" rel="noopener noreferrer">Open Work on AO3</a>}</div>
      </li>
    })}</ol></section>}
    {isAnthology(book) && organizerAccount && onCheckLinks && <button onClick={onCheckLinks}>Refresh Organizer Links</button>}
    {onReview && <button onClick={onReview}>Review Anthology Contents</button>}
    {book.workId && /^[1-9]\d*$/.test(book.workId) && <p><a href={`https://archiveofourown.org/works/${book.workId}`} target="_blank" rel="noopener noreferrer">Open Work on AO3</a> · Work {book.workId}</p>}
    <dl className="work-details-list">{rows.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{label === 'Summary' ? <WorkSummary metadata={metadata} fallback="Unknown / Not Saved" /> : Array.isArray(value) ? value.length ? <ul>{value.map((item, index) => <li key={index}>{item}</li>)}</ul> : 'Unknown / Not Saved' : savedValue(value)}</dd></div>)}</dl>
    <h4>All Tags</h4>{workTags(metadata).length ? <WorkTags metadata={metadata} limit={Infinity} appearance={appearance} /> : <p>Unknown / Not Saved</p>}
    <h4>Your Reading Information</h4><dl className="work-details-list">{[
      { label: 'Reading Status', value: statuses[book.status] },
      { label: 'Chapters Read', value: `${book.chapters.filter(chapter => chapter.kind !== 'frontmatter' && book.completed.includes(chapter.id)).length} of ${book.chapters.filter(chapter => chapter.kind !== 'frontmatter').length}` },
      { label: 'Saved Position', value: chapter ? `${chapter.title} · ${Math.round(book.position.fraction * 100)}% through section` : undefined },
      { label: 'Personal Notes', value: book.notes },
      { label: 'Organizer Collections', value: book.collections.join(' · ') },
      { label: 'Organizer Link', value: book.remote && book.account && book.workId ? 'Linked' : 'Not Linked' },
      { label: 'EPUB Version', value: book.active ? 'Active Version' : 'Retained Version' },
      { label: 'Download', value: book.hasFile ? 'Available Here' : 'Removed From This Device' },
    ].map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{savedValue(value)}</dd></div>)}</dl>
  </Dialog>
}
