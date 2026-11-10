import { readerProgress, statuses, type BookDetails, type Preferences } from './model'
export type CloudValue = { key: string; value: unknown; revision: number }
export type CloudEdit = { id: string; key: string; value: unknown; base: number }
export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function cloudBookFields(book: BookDetails): Record<string, unknown> {
  // Organizer pairing, copied organizer state, and layout-dependent pixels never leave this installation.
  const { lastOpenedAt: _lastOpenedAt, account: _account, remote: _remote, hasFile: _file, works, position, history, completed, progress: _progress, notes, status, active, favorite, rec, ...manifest } = book
  void _lastOpenedAt; void _account; void _remote; void _file; void _progress
  const members = works?.map(({ remote: _remote, account: _account, ...work }) => { void _remote; void _account; return work })
  return { manifest: { ...manifest, ...(members && { works: members }) }, favorite: Boolean(favorite), rec: Boolean(rec), progress: readerProgress(book), position: { chapter: position.chapter, fraction: position.fraction, textOffset: position.textOffset }, completed, notes, status, active, ...Object.fromEntries(history.map(event => [`history:${event.id}`, event])) }
}
export function cloudPreferences(preferences: Preferences) {
  const { tagSyncAccount: _account, ...value } = preferences
  void _account
  return value
}

export function cloudFieldLabel(key: string) {
 const field = key.split('/').at(-1) ?? ''
 return ({ favorite: 'Favorite', rec: 'Recommended', position: 'Reading Position', completed: 'Chapters Read', progress: 'Reading Progress', notes: 'Personal Notes', status: 'Reading Status', active: 'Active EPUB Version', manifest: 'Book Information', preferences: 'Reader Preferences', deleted: 'EPUB Removal' } as Record<string, string>)[field] ?? (field.startsWith('history:') ? 'Reading History' : 'Saved Reading Information')
}
export function describeCloudValue(key: string, value: unknown, book?: BookDetails): string {
 const field = key.split('/').at(-1), data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
 if (field === 'favorite' || field === 'rec') return value ? 'Marked.' : 'Not marked.'
 if (field === 'notes') return typeof value === 'string' && value ? value : 'No personal notes.'
 if (field === 'status') return statuses[value as keyof typeof statuses] ?? 'No reading status saved.'
 if (field === 'progress') return `${typeof value === 'number' ? value : 0} chapters read.`
 if (field === 'completed') return Array.isArray(value) ? `${value.length} ${value.length === 1 ? 'chapter' : 'chapters'} marked read.` : 'No chapters marked read.'
 if (field === 'position') {
  const chapter = book?.chapters.find(chapter => chapter.id === data.chapter)
  return `${chapter?.title ?? 'Saved chapter'} · ${Math.round(Number(data.fraction ?? 0) * 100)}% through the section.`
 }
 if (field === 'deleted') return value ? 'This EPUB and its reading data were removed.' : 'This EPUB is kept in the library.'
 if (field === 'active') return value ? 'Use this EPUB as the active version.' : 'Keep this EPUB as a retained version.'
 if (field === 'manifest') {
  const metadata = data.metadata as Record<string, unknown> | undefined
  return `${typeof metadata?.title === 'string' ? metadata.title : 'Book information'}${Array.isArray(metadata?.authors) ? ` by ${metadata.authors.join(', ')}` : ''}. Publication details or EPUB information changed.`
 }
 if (field === 'preferences') return `Reader display settings: ${data.dark ? 'dark' : 'light'} mode, ${data.layout === 'pages' ? 'paginated' : 'scrolling'} layout${typeof data.size === 'number' ? `, font size ${data.size}` : ''}${typeof data.width === 'number' ? `, reading width ${data.width}` : ''}. Saved tag formatting and tile layouts also belong to this version.`
 if (field?.startsWith('history:')) {
  const chapter = book?.chapters.find(chapter => chapter.id === data.chapter)
  return `${data.reread ? 'Reread' : 'Read'} ${chapter?.title ?? 'a chapter'}${typeof data.at === 'string' ? ` on ${new Date(data.at).toLocaleString()}` : ''}${typeof data.words === 'number' ? ` · ${data.words.toLocaleString()} words` : ''}.`
 }
 return 'This version contains different saved reading information.'
}
