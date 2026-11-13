import { savedWorkIdentity } from '../library/model'
import { readerWorkIdentities } from '../../lib/reader-work-identities'
import { useSearchParams } from 'react-router-dom'
import { useOffline } from './OfflineProvider'
import { hostedReaderUrl } from '../../lib/reader-connection'
import { readerWorkUrl } from './storage'

export function useReaderDestination({ workId, bookId, chapter }: { workId: number | null; bookId?: string; chapter?: number }) {
  const { snapshot } = useOffline()
  const [readerId, setReaderId] = useSearchParams()
  const reports = (snapshot?.connected === false ? [] : snapshot?.readers ?? []).filter(reader => workId !== null && reader.works.includes(String(workId)))
  const reader = reports.find(reader => reader.id === readerId.get('reader')) ?? reports[0]
  const cloud = snapshot?.connected !== false ? snapshot?.cloudBooks?.find(book => bookId ? book.id === bookId : readerWorkIdentities(book).includes(String(workId))) : undefined
  let href: string | undefined
  const targetWork = workId ?? (cloud && (cloud.workCount ?? 0) <= 1 ? savedWorkIdentity(cloud) : null)
  let invalid = false
  if ((workId || bookId) && (reader || cloud)) {
    try { href = readerWorkUrl(reader?.url ?? (snapshot?.readers[0]?.url || import.meta.env.VITE_READER_URL || hostedReaderUrl), targetWork ?? cloud!.id, targetWork ? 'work' : 'book', chapter) } catch { invalid = true }
  }
  return { href, invalid, reader, reports, readerId, setReaderId }
}
