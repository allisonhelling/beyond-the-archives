import { Tooltip } from '../../../components/Tooltip'
import { safeBookFusionLink, type BookFusionLink } from './bookfusion'

export function BookFusionFields({ value, onChange }: { value: BookFusionLink | null | undefined; onChange: (value: BookFusionLink | null) => void }) {
  return <div>
    <label>BookFusion Link<input type="url" value={value?.url ?? ''} placeholder="https://www.bookfusion.com/…" onChange={event => onChange(event.target.value ? { url: event.target.value, kind: value?.kind ?? 'book' } : null)} /></label>
    <label>BookFusion Link Type<select value={value?.kind ?? 'book'} onChange={event => onChange({ url: value?.url ?? '', kind: event.target.value as BookFusionLink['kind'] })}><option value="book">Book · Latest Position</option><option value="bookmark">Bookmark · Fixed Location</option></select></label>
    <p className="field-help">Upload or import the EPUB in BookFusion first, then paste its reader or content link. Use a book-level link without a query or fragment to let BookFusion manage your latest position. Bookmark links preserve the exact destination, including location parameters. Opening a link does not update organizer chapter progress. Clear the link to remove the association.</p>
  </div>
}

export function BookFusionButton({ value, variant = 'spine' }: { value: BookFusionLink | null | undefined; variant?: 'spine' | 'details' }) {
  const link = safeBookFusionLink(value)
  if (!link) return null
  return <Tooltip description={variant === 'details' ? 'Open in Bookfusion' : link.kind === 'bookmark' ? 'Open in BookFusion · fixed bookmark location' : 'Open in BookFusion'}>{descriptionId => <a className={variant === 'details' ? 'button secondary' : 'spine-action'} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={variant === 'details' ? 'Bookfusion' : 'Open in BookFusion'} aria-describedby={descriptionId}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h7a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4Z" /><path d="M9 4v12a4 4 0 0 0 4 4h7V8a4 4 0 0 0-4-4H9Z" /></svg>{variant === 'details' && 'Bookfusion'}</a>}</Tooltip>
}
