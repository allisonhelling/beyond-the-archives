import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { loadLibrary } from '../library/repository'
import { blankMetadata } from '../library/model'
import { readReadingHistory } from '../library/reading-history'
import type { StatsWork } from './stats'

const pending = new Map<string, Promise<StatsWork[]>>()
export function loadStatsWorks(scope: string): Promise<StatsWork[]> {
 const existing = pending.get(scope)
 if (existing) return existing
 const request = readStatsWorks().finally(() => { pending.delete(scope) })
 pending.set(scope, request)
 return request
}

async function readStatsWorks(): Promise<StatsWork[]> {
 if (sampleMode) return (await loadLibrary()).stories.map(story => ({ ...story, key: story.work.ao3_work_id ? `ao3:${story.work.ao3_work_id}` : story.original_url || story.id, archived: false }))
 if (!supabase) throw new Error('Database is not configured.')
 const works: StatsWork[] = []
 let after: string | undefined
 while (true) {
  const { data, error } = await supabase.rpc('reading_stats_works', { p_after: after, p_limit: 500 }).abortSignal(AbortSignal.timeout(20000))
  if (error || !Array.isArray(data)) throw new Error('Could not load reading statistics. Check your connection and apply the latest migrations.')
  const page = data as unknown as StatsWork[]
  works.push(...page.map(work => ({ ...work, metadata: { ...blankMetadata, ...work.metadata }, reading_history: readReadingHistory(work.reading_history) })))
  if (page.length < 500) return works
  after = page.at(-1)!.id
 }
}
