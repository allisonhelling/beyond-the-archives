import { formatDateTime } from '../../lib/dates'
import type { HTMLAttributes } from 'react'
import { chapterReadEvents, type ReadingEvent } from './reading-history'

export function ChapterReadingHistory({ history, ...attributes }: { history?: ReadingEvent[] } & HTMLAttributes<HTMLDivElement>) {
 const reads = chapterReadEvents(history)
 if (!reads.length) return <div {...attributes}><dt>Chapter Reading History</dt><dd>
  <p className="muted">No chapter reads recorded yet.</p>
  <p className="field-help">Mark a chapter read in the updated AO3 companion to record its word count, reading timestamp, and reread status. Earlier reading progress does not include chapter read records.</p>
 </dd></div>
 const words = reads.reduce((total, read) => total + (read.word_count ?? 0), 0)
 return <div {...attributes}><dt>Chapter Reading History</dt><dd><details className="details-disclosure">
  <summary>{reads.length.toLocaleString()} {reads.length === 1 ? 'Chapter Read' : 'Chapter Reads'} · {words.toLocaleString()} Recorded Words</summary>
  <p className="field-help">Chapter text is counted locally when marked read; notes and summaries are excluded. Counts may differ from AO3. Rereads count separately. Skipped chapters have no recorded count.</p>
  <ol>{reads.map((read, index) => <li key={read.id ?? index}>Chapter {read.chapter} · {read.word_count === null ? 'Word Count Unavailable' : `${read.word_count.toLocaleString()} Words`} · {read.is_reread ? 'Re-Read' : 'First Read'} · <time dateTime={read.at}>{formatDateTime(read.at)}</time></li>)}</ol>
 </details></dd></div>
}
