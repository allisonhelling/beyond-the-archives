import { expect, it } from 'vitest'
import { readingMilliseconds, recordReadingTransition, resumeReadingStatus } from './reading-history'
import { exampleWork } from './display-examples'

it('excludes each pause, closes a pause on finish, and stops the estimate at the finish date', () => {
 const story = { ...exampleWork, created_at: '2026-10-01T00:00:00Z', finished_at: '2026-10-11T00:00:00Z', reading_status: 'finished' as const,
  reading_history: [
   { action: 'paused_reading' as const, at: '2026-10-03T00:00:00Z', status: 'paused_reading' as const, previous_status: 're_reading' as const },
   { action: 'resumed' as const, at: '2026-10-06T00:00:00Z', status: 're_reading' as const },
   { action: 'paused_reading' as const, at: '2026-10-09T00:00:00Z', status: 'paused_reading' as const, previous_status: 're_reading' as const },
   { action: 'finished' as const, at: '2026-10-11T00:00:00Z', status: 'finished' as const },
  ] }
 expect(readingMilliseconds(story)).toBe(5 * 86400000)
 expect(resumeReadingStatus(story)).toBe('re_reading')
 expect(resumeReadingStatus({})).toBe('reading')
})
it('excludes an open pause and tracks a resumed re-read in sample mode without resetting chapter placement', () => {
 const at = '2026-10-03T00:00:00Z'
 const story = { ...exampleWork, reading_status: 're_reading' as const, created_at: '2026-10-01T00:00:00Z' }
 const paused = { ...story, reading_status: 'paused_reading' as const }
 recordReadingTransition(paused, story, at)
 expect(readingMilliseconds(paused, Date.parse('2026-10-08T00:00:00Z'))).toBe(2 * 86400000)
 const resumed = { ...paused, reading_status: resumeReadingStatus(paused) }
 recordReadingTransition(resumed, paused, '2026-10-09T00:00:00Z')
 expect(resumed.last_read_chapter).toBe(story.last_read_chapter)
 expect(resumed.reading_history?.at(-1)).toMatchObject({ action: 'resumed', status: 're_reading' })
 const finished = { ...resumed, reading_status: 'finished' as const }
 recordReadingTransition(finished, resumed, '2026-10-11T00:00:00Z')
 expect(finished.finished_at).toBe('2026-10-11T00:00:00Z')
 const edited = { ...finished, notes: 'More notes' }
 recordReadingTransition(edited, finished, '2026-10-12T00:00:00Z')
 expect(edited.finished_at).toBe(finished.finished_at)
 expect(edited.reading_history).toEqual(finished.reading_history)
})
