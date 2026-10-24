import { localExtensionConnectionHelp } from './extension-config'
import { load } from 'cheerio'
import { blankMetadata, initialProgress, type Metadata, type Status } from '../library/model'
import { ensureSampleSeries, loadSampleLibrary, saveSampleStory } from '../library/sample/repository'
import { extractWorkMetadata } from './ao3-metadata'
import { captureWorkWithExtension, connectExtension } from './extension'
import { groupWorks, parseWorkUrl } from './urls'

/** The normal bulk-link form, using local sample storage instead of backend jobs. */
export async function importSampleWorkUrls(urls: string[], status: Status, seriesIds: number[], updateReadingLocation = true) {
 const groups = groupWorks(urls)
 if (!groups.size) throw new Error('Paste at least one valid AO3 work URL, or select works from a series.')
 if (!await connectExtension()) throw new Error(localExtensionConnectionHelp)
 const saved = new Set((await loadSampleLibrary()).stories.map(story => story.work.ao3_work_id))
 let requested = false
 for (const [workId, links] of groups) {
  if (saved.has(workId)) continue
  // Match the scraper's conservative default between requested work pages.
  if (requested) await new Promise(resolve => setTimeout(resolve, 15000))
  requested = true
  const original = links.at(-1)!
  const page = await captureWorkWithExtension(original.normalizedUrl)
  if (parseWorkUrl(page.url).workId !== workId) throw new Error('AO3 returned another work. Your pasted links have been preserved; retry the import.')
  const { metadata: automatic, chapters } = extractWorkMetadata(load(page.html), page.url)
  if (!automatic.title) throw new Error('The requested work is not ready. Complete AO3 sign-in or confirmation, then retry.')
  const metadata: Metadata = { ...blankMetadata, ...automatic, publication_status: automatic.is_complete === undefined ? 'unknown' : automatic.is_complete ? 'complete' : 'in_progress' }
  const reading = initialProgress(original.original, updateReadingLocation ? chapters : {})
  await saveSampleStory({ url: original.original, metadata, status: status === 'to_read' && reading.lastRead > 0 ? 'reading' : status,
   progress: status === 'finished' ? metadata.published_chapters ?? 0 : reading.lastRead, notes: '', personalRating: null, favorite: false, collections: [], tags: [] }, chapters, automatic)
  saved.add(workId)
  for (const series of metadata.series_memberships ?? []) if (seriesIds.includes(series.id)) await ensureSampleSeries({ seriesId: series.id, title: series.name })
 }
}
