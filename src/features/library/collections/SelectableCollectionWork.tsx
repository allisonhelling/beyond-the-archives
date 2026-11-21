import type { ReactNode } from 'react'
import { Square, SquareCheck } from 'lucide-react'
import type { TileSelection } from './useCollectionWorkSelection'

export function SelectableCollectionWork({ title, selection, children }: { title: string; selection?: TileSelection; children: ReactNode }) {
  if (!selection) return children
  const Mark = selection.pressed ? SquareCheck : Square
  return <div className="selectable-collection-work" data-selected={selection.pressed}>
    <div className="selectable-collection-content" inert>{children}</div>
    <button type="button" className="collection-work-toggle" aria-label={`Select ${title}`} aria-pressed={selection.pressed} disabled={selection.disabled} onClick={selection.toggle}><Mark size={22} aria-hidden="true" /></button>
  </div>
}
