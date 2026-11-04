import { Eye, EyeOff } from 'lucide-react'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { Tooltip } from '../../../components/Tooltip'

export function CollectionVisibilityButton({ hidden = false, onClick, disabled = false }: { hidden?: boolean; onClick: () => void; disabled?: boolean }) {
  const Icon = hidden ? EyeOff : Eye
  const label = hidden ? 'Show Collection' : 'Hide Collection'
  return <Tooltip description={label} placement="bottom">{descriptionId => <button type="button" className="button secondary collection-visibility-button" aria-label={label} aria-describedby={descriptionId} disabled={disabled} onClick={onClick}><Icon size={18} aria-hidden="true" /></button>}</Tooltip>
}

export function CollectionVisibilityDialog({ collection, onConfirm, onClose }: {
  collection: { id: string; name: string; hidden: boolean }; onConfirm: () => Promise<void>; onClose: () => void
}) {
  const { name, hidden } = collection
  const Icon = hidden ? EyeOff : Eye
  return <ConfirmationDialog title={hidden ? `Edit "${name}"` : `Hide “${name}”?`} confirmLabel={<><Icon size={18} aria-hidden="true" />{hidden ? 'Unhide' : 'Hide'}</>} pendingLabel={hidden ? 'Restoring…' : 'Hiding…'} onConfirm={onConfirm} onClose={onClose}>
    {hidden ? <p><strong>This collection is hidden from your shelves.</strong></p> : <>
      <p>Hide this collection from your shelves?</p>
      <p>This will not affect any stories in the collection. You can undo this at any time using View Hidden in Edit Collections.</p>
    </>}
  </ConfirmationDialog>
}
