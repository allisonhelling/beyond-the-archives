import type { Story, Status } from './model'

export type ChapterReadEvent = { action: 'chapter_read'; at: string; status: Status; id: string; chapter: number; chapter_id: string | null; word_count: number | null; is_reread: boolean }
export type ReadingEvent = { action: 'added' | 'status' | 'paused_reading' | 'resumed' | 'finished'; at: string; status: Status; previous_status?: Status } | ChapterReadEvent

export function readReadingHistory(value: unknown): ReadingEvent[] {
  return Array.isArray(value) ? value.filter((event): event is ReadingEvent => event && typeof event === 'object' && typeof event.at === 'string' && typeof event.status === 'string' && typeof event.action === 'string') : []
}

export function chapterReadEvents(history: ReadingEvent[] = []): ChapterReadEvent[] {
  return history.filter((event): event is ChapterReadEvent => event.action === 'chapter_read'
    && Number.isInteger(event.chapter) && event.chapter > 0
    && (event.word_count === null || Number.isInteger(event.word_count) && event.word_count >= 0)
    && typeof event.is_reread === 'boolean' && Number.isFinite(Date.parse(event.at)))
}

/** Preserve the reading mode when returning from a pause, including a re-read. */
export function resumeReadingStatus(story: Pick<Story, 'reading_history'>): Status {
  const pause = [...(story.reading_history ?? [])].reverse().find(event => event.action === 'paused_reading')
  return pause && 'previous_status' in pause && pause.previous_status === 're_reading' ? 're_reading' : 'reading'
}

/** Elapsed calendar time since saving, excluding recorded pauses; not time spent on-page. */
export function readingMilliseconds(story: Pick<Story, 'created_at' | 'finished_at' | 'reading_status' | 'reading_history' | 'dnf_since'>, now = Date.now()): number {
  const start = Date.parse(story.created_at)
  const stopped = story.reading_status === 'finished' ? story.finished_at : story.reading_status === 'did_not_finish' ? story.dnf_since : null
  const end = stopped ? Date.parse(stopped) : now
  let pausedAt: number | null = null, paused = 0
  for (const event of story.reading_history ?? []) {
    const at = Math.max(start, Math.min(end, Date.parse(event.at)))
    if (!Number.isFinite(at)) continue
    if (event.status === 'paused_reading' && pausedAt === null) pausedAt = at
    else if (event.status !== 'paused_reading' && pausedAt !== null) { paused += Math.max(0, at - pausedAt); pausedAt = null }
  }
  if (pausedAt !== null) paused += Math.max(0, end - pausedAt)
  return Math.max(0, end - start - paused)
}

/** Sample mode mirrors the database status trigger, including the history baseline. */
export function recordReadingTransition(story: Story, previous?: Story, at = new Date().toISOString()) {
  story.reading_history = [...(previous?.reading_history ?? story.reading_history ?? [])]
  if (previous && previous.reading_status === story.reading_status) return
  if (!story.reading_history.length) story.reading_history.push({ action: 'added', at: previous ? at : story.created_at, status: previous?.reading_status ?? story.reading_status })
  const status = story.reading_status
  const action = status === 'finished' ? 'finished' : status === 'paused_reading' ? 'paused_reading' : previous?.reading_status === 'paused_reading' ? 'resumed' : 'status'
  story.reading_history.push({ action, at, status, ...(previous && { previous_status: previous.reading_status }) })
  if (status === 'finished') story.finished_at = at
  story.dnf_since = status === 'did_not_finish' ? at : null
  if (['reading', 're_reading'].includes(status)) story.started_at ??= at
}
