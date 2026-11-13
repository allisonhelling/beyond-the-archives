import type { Json } from '../../types/database'
import { InfoTooltip } from '../../components/InfoTooltip'
import { formatDateTime } from '../../lib/dates'
import type { HTMLAttributes } from 'react'
import { chapterReadEvents, type ReadingEvent } from './reading-history'

export function ChapterReadingHistory({ history, published, chapterLinks, ...attributes }: { history?: ReadingEvent[]; published?: number | null; chapterLinks?: Json } & HTMLAttributes<HTMLDivElement>) {
 const heading = <dt className="editable-field-heading">Chapter Reading History<InfoTooltip description="Mark a chapter read in the updated AO3 companion to record its word count, reading timestamp, and reread status." label="Chapter Reading History Information" size={14} /></dt>
 const links = chapterLinks && typeof chapterLinks === 'object' && !Array.isArray(chapterLinks) ? chapterLinks : {}
 const outOfRangeLinks = published === undefined || published === null ? [] : Object.keys(links).filter(key => Number.isInteger(Number(key)) && Number(key) > published)
 const linkWarning = outOfRangeLinks.length > 0 && <p className="field-help">{outOfRangeLinks.length} saved chapter links are outside the published count and need review. They are retained; reading actions will not use out-of-range positions.</p>
 const reads = chapterReadEvents(history)
 if (!reads.length) return <div {...attributes}>{heading}<dd>
  {linkWarning}<p className="muted">No chapter reads recorded yet.</p>
 </dd></div>
 const words = reads.reduce((total, read) => total + (read.word_count ?? 0), 0)
 return <div {...attributes}>{heading}<dd>{linkWarning}<details className="details-disclosure chapter-reading-history">
  <summary>{reads.length.toLocaleString()} {reads.length === 1 ? 'Chapter Read' : 'Chapter Reads'} · {words.toLocaleString()} Recorded Words</summary>
  <p className="field-help">Chapter text is counted locally when marked read; notes and summaries are excluded. Counts may differ from AO3. Rereads count separately. Earlier chapters marked read together are counted when their text is available. Unavailable chapter counts are shown as unknown. Undo removes the reads recorded by that action.</p>
  <ol>{reads.map((read, index) => <li key={read.id ?? index}>Chapter {read.chapter} · {read.word_count === null ? 'Word Count Unavailable' : `${read.word_count.toLocaleString()} Words`} · {read.is_reread ? 'Re-Read' : 'First Read'} · {published !== null && published !== undefined && read.chapter > published && <strong>Out of Range · Review Required · </strong>}<time dateTime={read.at}>{formatDateTime(read.at)}</time></li>)}</ol>
 </details></dd></div>
}
