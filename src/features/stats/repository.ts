import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { allRows, loadLibrary } from '../library/repository'
import { blankMetadata, type Metadata } from '../library/model'
import { readReadingHistory } from '../library/reading-history'
import type { StatsWork } from './stats'

export async function loadStatsWorks(): Promise<StatsWork[]> {
 const [library, archived] = await Promise.all([
  loadLibrary(),
  sampleMode ? [] : allRows((from, to) => {
   if (!supabase) throw new Error('Database is not configured.')
   return supabase.from('reading_records').select('*').order('id').range(from, to)
  }),
 ])
 const activeIds = new Set(library.stories.map(story => story.id))
 return [
  ...library.stories.map(story => ({ ...story, key: story.work.ao3_work_id ? `ao3:${story.work.ao3_work_id}` : story.original_url || story.id, archived: false })),
  ...archived.filter(record => !activeIds.has(record.id)).map(record => ({ ...record,
   key: record.ao3_work_id ? `ao3:${record.ao3_work_id}` : record.original_url || record.id,
   metadata: { ...blankMetadata, ...(record.metadata as Partial<Metadata>) },
   reading_history: readReadingHistory(record.reading_history), personal_rating: null, archived: true,
  })),
 ]
}
