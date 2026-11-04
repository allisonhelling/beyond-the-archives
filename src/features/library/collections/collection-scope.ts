import { active, savedWorkIdentity, type Story } from '../model'

/** One work per shelf, regardless of how many EPUB versions represent it. */
export function distinctCollectionWorks(stories: Story[]) {
 const seen = new Set<string>()
 return stories.filter(story => {
  const key = savedWorkIdentity({ workId: story.work.ao3_work_id?.toString() ?? null, metadata: story.metadata }) ?? story.id
  if (seen.has(key)) return false
  seen.add(key); return true
 })
}

export function collectionStories(stories: Story[], shelf: string) {
 return stories.filter(story => {
  if (shelf === 'all') return true
  if (shelf === 'currently_reading') return active(story)
  if (shelf === 'complete') return story.metadata.publication_status === 'complete'
  if (shelf === 'waiting') return story.reading_status === 'waiting_for_updates'
  if (shelf === 'favorites') return story.is_favorite
  if (shelf === 'recs') return story.is_rec
  if (shelf === 'series') return Boolean(story.metadata.series?.length || story.metadata.series_memberships?.length)
  if (shelf === 'finished') return ['finished', 're_reading'].includes(story.reading_status)
  return story.reading_status === shelf || [...story.collectionIds, ...(story.automaticCollectionIds ?? [])].includes(shelf)
 })
}
