import type { BookDetails, Preferences } from '../model'
export type SampleFile = { type: string; base64: string }
export type ReaderSampleSnapshot = { version: 1; completeSnapshot: true; books: { file: SampleFile | null; state?: BookDetails }[]; preferences?: Preferences }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
export function isReaderSampleSnapshot(value: unknown): value is ReaderSampleSnapshot {
  if (!object(value) || value.version !== 1 || value.completeSnapshot !== true || !Array.isArray(value.books)) return false
  return (value.preferences === undefined || object(value.preferences)) && value.books.every(book => {
    if (!object(book)) return false
    const file = book.file, state = book.state
    if (file !== null && (!object(file) || file.type !== 'application/epub+zip' || typeof file.base64 !== 'string' || !file.base64.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64))) return false
    return (file !== null || state !== undefined) && (state === undefined || object(state) && typeof state.id === 'string' && object(state.metadata) && typeof state.metadata.title === 'string' && Array.isArray(state.chapters) && Array.isArray(state.history) && Array.isArray(state.completed) && object(state.position) && typeof state.notes === 'string' && Array.isArray(state.collections))
  })
}
