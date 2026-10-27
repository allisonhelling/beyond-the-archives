import { sampleMode } from '../../lib/sample-mode'
import { supabase } from '../../lib/supabase'
import type { Story, Status } from '../library/model'
import { bookmarkReadingState, type CsvWork } from './ao3-csv'

export type ReadingSnapshot = { status: Status; progress: number; startedAt: string | null; finishedAt: string | null }
export type ReadingReview = { id: string; title: string; saved: ReadingSnapshot; proposed: ReadingSnapshot; progressKnown: boolean; savedProgressKnown: boolean; source: string }
export type ReadingProvenance = { source?: string; progressKnown?: boolean; review?: Omit<ReadingReview, 'id' | 'title'>; dismissed?: Omit<ReadingReview, 'id' | 'title'> }
export type ReadingReviews = { reviews: ReadingReview[]; total: number; changed: number; skipped: number }
export const readingSnapshot = (story: Story): ReadingSnapshot => ({ status: story.reading_status, progress: story.last_read_chapter, startedAt: story.started_at, finishedAt: story.finished_at })
export function importProgressKnown(work: CsvWork) {
 const state = bookmarkReadingState(work)
 return Boolean(work.importReadingStatusOrigin !== 'default' && work.importReadingStatus === 'to_read' || state.status === 'finished' && work.metadata.published_chapters !== undefined
  || state.status === 'reading' && work.bookmarkDate && work.metadata.chapter_dates?.['1'])
}
export async function reviewImportReading(ids: string[] = [], action: 'list' | 'accept' | 'keep' = 'list', page = 1): Promise<ReadingReviews> {
 if (sampleMode) return (await import('../library/sample/repository')).reviewSampleImportReading(ids, action, page)
 if (!supabase) throw new Error('Connect your library to review reading corrections.')
 const { data, error } = await supabase.rpc('review_import_reading', { p_ids: ids, p_action: action, p_page: page })
 if (error) throw new Error('Could not review reading corrections. Check your connection and apply the latest migrations, then retry.')
 return data as unknown as ReadingReviews
}
