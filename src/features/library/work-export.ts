import { brandSlug } from '../../lib/brand'
import { downloadFile } from '../../lib/download'
import { libraryCsvFiles } from '../backups/csv-export'
import type { Collection, Story } from './model'

export function exportWork(story: Story, format: 'json' | 'csv', collections: Collection[]) {
 const filename = `${brandSlug}-work-${story.work.ao3_work_id ?? story.id}.${format}`
 const { detailsLoaded, ...work } = story
 void detailsLoaded
 const content = format === 'json'
  ? JSON.stringify({ format: 'beyond-the-archives-work', version: 1, exported_at: new Date().toISOString(), work }, null, 2)
  : libraryCsvFiles({ stories: [story], series: [], collections }, ['works.csv'])[0].content
 downloadFile(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }), filename)
}
