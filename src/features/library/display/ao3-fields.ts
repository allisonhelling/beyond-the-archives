/** AO3 fields share the same names in tile and information-page editors. */
export const ao3MetadataLabels = {
  authors: 'Authors', fandoms: 'Fandoms', series: 'Series', rating: 'AO3 Rating', words: 'Word Count', chapters: 'Chapter Count', summary: 'Summary',
  relationships: 'Relationships', characters: 'Characters', tags: 'Additional Tags', warnings: 'AO3 Warnings', category: 'Category',
  kudos: 'AO3 Kudos', bookmarks: 'AO3 Bookmarks', comments: 'AO3 Comments', hits: 'AO3 Hits',
  published: 'Date Published', updated: 'Date Updated', language: 'Language', publication: 'Publication Status', workId: 'AO3 Work ID', source: 'AO3 Link', allTags: 'All Tags',
}
export const newWorkTileFields = ['category', 'bookmarks', 'comments', 'hits', 'published', 'language', 'publication', 'workId', 'source', 'allTags'] as const
export const newWorkInfoFields = ['authors', 'fandoms', 'series', 'rating', 'words', 'chapters', 'warnings', 'category', 'kudos', 'bookmarks', 'comments', 'hits', 'published', 'updated', 'language', 'publication', 'workId', 'source'] as const

export function metadataLabels<K extends keyof typeof ao3MetadataLabels>(keys: readonly K[]): Pick<typeof ao3MetadataLabels, K> {
  return Object.fromEntries(keys.map(key => [key, ao3MetadataLabels[key]])) as Pick<typeof ao3MetadataLabels, K>
}
