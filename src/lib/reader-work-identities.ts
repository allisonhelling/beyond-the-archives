import { savedWorkIdentity, type Metadata } from '../features/library/model'

type ReaderIdentity = { workId: string | null; metadata: Metadata & { calibre_work_link?: string }; works?: { workId: string | null }[]; workIds?: string[]; workCount?: number }
/** Known member identities describe availability, never the identity of a whole anthology. */
export function readerWorkIdentities(book: ReaderIdentity): string[] {
  const members = [...(book.workIds ?? []), ...(book.works?.flatMap(work => work.workId ? [work.workId] : []) ?? [])]
  const anthology = (book.works?.length ?? book.workCount ?? 0) > 1 || (book.workIds?.length ?? 0) > 1
  const identities = anthology ? members : [...members, savedWorkIdentity(book)].filter((id): id is string => Boolean(id))
  return [...new Set(identities.filter(id => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))))]
}
