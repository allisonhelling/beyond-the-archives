import { Info } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { formatDateTime } from '../../lib/dates'
import type { HTMLAttributes } from 'react'
import { chapterReadEvents, type ReadingEvent } from './reading-history'

export function ChapterReadingHistory({ history, ...attributes }: { history?: ReadingEvent[] } & HTMLAttributes<HTMLDivElement>) {
 const heading = <dt className="editable-field-heading">Chapter Reading History<Tooltip pinOnClick description="Mark a chapter read in the updated AO3 companion to record its word count, reading timestamp, and reread status.">{id => <button type="button" className="icon-button inline-edit-icon" aria-label="Chapter Reading History Information" aria-describedby={id}><Info size={14} aria-hidden="true" /></button>}</Tooltip></dt>
 const reads = chapterReadEvents(history)
 if (!reads.length) return <div {...attributes}>{heading}<dd>
  <p className="muted">No chapter reads recorded yet.</p>
 </dd></div>
 const words = reads.reduce((total, read) => total + (read.word_count ?? 0), 0)
 return <div {...attributes}>{heading}<dd><details className="details-disclosure chapter-reading-history">
  <summary>{reads.length.toLocaleString()} {reads.length === 1 ? 'Chapter Read' : 'Chapter Reads'} · {words.toLocaleString()} Recorded Words</summary>
  <p className="field-help">Chapter text is counted locally when marked read; notes and summaries are excluded. Counts may differ from AO3. Rereads count separately. Earlier chapters marked read together are counted when their text is available. Unavailable chapter counts are shown as unknown. Undo removes the reads recorded by that action.</p>
  <ol>{reads.map((read, index) => <li key={read.id ?? index}>Chapter {read.chapter} · {read.word_count === null ? 'Word Count Unavailable' : `${read.word_count.toLocaleString()} Words`} · {read.is_reread ? 'Re-Read' : 'First Read'} · <time dateTime={read.at}>{formatDateTime(read.at)}</time></li>)}</ol>
 </details></dd></div>
}
