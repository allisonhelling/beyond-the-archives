import { downloadFile } from '../../lib/download'
import { createZip } from '../../lib/zip'
import { loadLibrary } from '../library/repository'

export const csvFiles = [
  { name: 'works.csv', description: 'Saved works, metadata, reading progress, notes, ratings, and personal tags' },
  { name: 'series.csv', description: 'Saved series, metadata, notes, and personal settings' },
  { name: 'collections.csv', description: 'Collection names, descriptions, colors, symbols, ordering, and automatic rules' },
  { name: 'collection_memberships.csv', description: 'Links between collections and saved works or series, including automatic membership' },
] as const
export type CsvFile = typeof csvFiles[number]['name']
type Row = Record<string, unknown>

function csvCell(value: unknown): string {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  // Quoting alone does not stop spreadsheets from evaluating private text as a
  // formula. Prefix dangerous text with an apostrophe, keeping numbers numeric.
  if (typeof value === 'string' && (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function csv(rows: Row[], required: string[]): string {
  const columns = [...new Set([...required, ...rows.flatMap(row => Object.keys(row))])]
  // BOM and CRLF make Unicode and multiline notes portable to spreadsheet apps.
  return '\ufeff' + [columns.map(csvCell).join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\r\n') + '\r\n'
}

export function libraryCsvFiles(library: Awaited<ReturnType<typeof loadLibrary>>, selection: readonly CsvFile[]) {
  const { stories, series, collections } = library
  const names = new Map(collections.map(collection => [collection.id, collection.name]))
  const collectionNames = (ids: string[]) => ids.map(id => names.get(id) ?? id)
  const memberships: Row[] = []
  const memberIds = (item: { id: string; collectionIds?: string[]; automaticCollectionIds?: string[] }, type: 'work' | 'series') => {
    const manual = new Set(item.collectionIds ?? []), automatic = new Set(item.automaticCollectionIds ?? [])
    const ids = [...new Set([...manual, ...automatic])]
    for (const id of ids) memberships.push({ collection_id: id, collection_name: names.get(id) ?? '', item_type: type,
      library_entry_id: type === 'work' ? item.id : '', library_series_id: type === 'series' ? item.id : '',
      membership_type: automatic.has(id) ? manual.has(id) ? 'manual_and_automatic' : 'automatic' : 'manual' })
    return ids
  }
  const workCollections = new Map(stories.map(story => [story.id, memberIds(story, 'work')]))
  const seriesCollections = new Map(series.map(record => [record.id, memberIds(record, 'series')]))
  return [...new Set(selection)].map(name => {
    switch (name) {
      case 'works.csv': return { name, content: csv(stories.map(story => {
        const { work, metadata, is_rec, collectionIds: manualIds, automaticCollectionIds, personalTags, detailsLoaded, ...entry } = story
        void detailsLoaded
        const ids = workCollections.get(story.id)!
        return { ...metadata, ...entry, rec: is_rec, ...Object.fromEntries(Object.entries(work).map(([key, value]) => [`work_${key}`, value])),
          metadata, personal_tags: personalTags, collection_ids: ids, collection_names: collectionNames(ids),
          manual_collection_ids: manualIds, automatic_collection_ids: automaticCollectionIds ?? [] }
      }), ['id', 'work_id', 'title', 'authors', 'reading_status', 'last_read_chapter', 'notes', 'rec', 'personal_rating', 'personal_tags', 'collection_names']) }
      case 'series.csv': return { name, content: csv(series.map(record => {
        const { collectionIds, detailsLoaded, ...fields } = record
        void collectionIds; void detailsLoaded
        const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ? record.metadata : {}
        const ids = seriesCollections.get(record.id)!
        return { ...metadata, ...fields, collection_ids: ids, collection_names: collectionNames(ids) }
      }), ['id', 'ao3_series_id', 'title', 'notes', 'reading_status', 'is_favorite', 'metadata', 'collection_names']) }
      case 'collections.csv': return { name, content: csv(collections, ['id', 'name', 'description', 'color', 'symbol', 'sort_position', 'automatic_rules']) }
      case 'collection_memberships.csv': return { name, content: csv(memberships, ['collection_id', 'collection_name', 'item_type', 'library_entry_id', 'library_series_id', 'membership_type']) }
    }
  })
}

export async function exportLibraryCsv(selection: readonly CsvFile[]) {
  if (!selection.length) throw new Error('Choose at least one CSV file.')
  // Use the complete paginated loader, never the UI's partial catalog/cache.
  const files = libraryCsvFiles(await loadLibrary(), selection)
  downloadFile(createZip(files), `between-chapters-export-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`)
}
