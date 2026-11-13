import { fieldConfidence } from './story-source'
import { progressReadingStatus, type Metadata, type Story, type Status } from './model'

export type ChapterChoice = 'keep_read' | 'read_all' | 'keep_finished' | 'reduce'
export function chapterState(metadata: Metadata) {
 return { published_chapters: metadata.published_chapters, total_chapters: metadata.total_chapters, publication_status: metadata.publication_status }
}
export function explicitReadingStatus(story: Story) {
 const provenance = story.reading_provenance
 return !(provenance && typeof provenance === 'object' && !Array.isArray(provenance) && provenance.statusOrigin === 'derived')
}
export function chapterReview(story: Story | undefined, metadata: Metadata): 'increase' | 'reduce' | null {
 const total = metadata.published_chapters
 if (!story || total === null || total === story.metadata.published_chapters) return null
 if (total < story.last_read_chapter) return 'reduce'
 if ((story.metadata.published_chapters === null || total > story.metadata.published_chapters) && total > story.last_read_chapter && story.reading_status === 'finished' && explicitReadingStatus(story)) return 'increase'
 return null
}
export function reviewedChapterProgress(story: Story, metadata: Metadata, choice: ChapterChoice) {
 const total = metadata.published_chapters!
 switch (choice) {
  case 'read_all': return { progress: total, status: 'finished' as const }
  case 'keep_finished': return { progress: story.last_read_chapter, status: 'finished' as const }
  case 'keep_read': return { progress: story.last_read_chapter, status: 'reading' as const }
  case 'reduce': return { progress: total, status: explicitReadingStatus(story) && ['finished','re_reading','paused_reading','did_not_finish'].includes(story.reading_status) ? story.reading_status : progressReadingStatus(total, metadata, story.reading_status) }
 }
}
export function readingMetadata(story: Story): Metadata {
 return ['abandoned','deleted'].includes(story.metadata.publication_status) && fieldConfidence(story, 'publication_status') !== 'manual' ? { ...story.metadata, publication_status: 'unknown' } : story.metadata
}
export function needsCompletionVerification(story: Story) { return readingMetadata(story).publication_status === 'unknown' }
export function readingLabel(story: Story) {
 const published = story.metadata.published_chapters
 if (story.reading_status === 'finished' && published !== null && story.last_read_chapter < published) return explicitReadingStatus(story) ? 'Finished · Manual Override · Unread Chapters' : 'Finished · New Chapters Available · Review Progress'
 if (['reading', 'waiting_for_updates'].includes(story.reading_status) && published !== null && published > 0 && story.last_read_chapter === published && needsCompletionVerification(story)) return 'Caught Up · Completion Unconfirmed'
 return null
}

export function readingStatusOrigin(previous: Story | undefined, status: Status, intent: 'explicit' | 'derived' | 'preserve' = 'explicit') {
 if (intent === 'explicit' || previous && previous.reading_status === status && explicitReadingStatus(previous)) return 'explicit'
 return intent === 'preserve' ? previous && !explicitReadingStatus(previous) ? 'derived' : 'explicit' : 'derived'
}
