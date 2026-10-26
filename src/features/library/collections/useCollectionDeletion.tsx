import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { useLibrary } from '../LibraryProvider'
import type { Collection } from '../model'
import { deleteCollection, deleteCollections } from '../repository'

export const collectionDeleteLabel = <><Trash2 size={16} aria-hidden="true" />Delete</>

export function useCollectionDeletion(selectedTargets: Collection[], bulk: boolean, onDeleted: () => void) {
  const { stories, series, navigation, catalogLoaded, refreshCollections } = useLibrary()
  const [confirmationTargets, setConfirmationTargets] = useState<Collection[] | null>(null)
  const targets = confirmationTargets ?? selectedTargets
  const confirming = confirmationTargets !== null
  const ids = targets.map(item => item.id)
  const hasStories = catalogLoaded === false && targets.some(target => !navigation?.[target.id]) || targets.some(target => (navigation?.[target.id]?.works ?? 0) + (navigation?.[target.id]?.series ?? 0) > 0) || stories.some(story => [...story.collectionIds, ...(story.automaticCollectionIds ?? [])].some(id => ids.includes(id))) || (series ?? []).some(series => series.collectionIds?.some(id => ids.includes(id)))
  const targetKey = [...ids].sort().join(',')
  const deleted = useRef<string | null>(null), pending = useRef(false)
  const [removedKey, setRemoved] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const removed = removedKey === targetKey
  const [failure, setFailure] = useState({ key: '', message: '' })
  const error = failure.key === targetKey ? failure.message : ''
  async function remove() {
    if (deleted.current !== targetKey) {
      if (bulk) await deleteCollections(ids)
      else await deleteCollection(ids[0])
      deleted.current = targetKey; setRemoved(targetKey)
    }
    await refreshCollections()
  }
  async function requestDelete() {
    if (pending.current || !ids.length) return
    if (hasStories && deleted.current !== targetKey) { setConfirmationTargets([...targets]); return }
    pending.current = true; setBusy(true); setFailure({ key: targetKey, message: '' })
    try { await remove(); onDeleted() }
    catch (error) { setFailure({ key: targetKey, message: error instanceof Error ? error.message : 'Could not delete collection.' }) }
    finally { pending.current = false; setBusy(false) }
  }
  const confirmation = confirming && <ConfirmationDialog title={bulk ? 'Delete Collections?' : 'Delete Collection?'} confirmLabel={collectionDeleteLabel} onClose={() => { setConfirmationTargets(null); if (deleted.current === targetKey) onDeleted() }} onConfirm={remove}><p>{bulk ? `Delete ${targets.length} collections?` : `Delete “${targets[0].name}”?`}</p><p>Stories will stay in your library.</p></ConfirmationDialog>
  return { requestDelete, busy, error, removed, confirming, confirmation }
}
