import { useRef, useState } from 'react'
import { useLayout } from '../../../lib/use-layout'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { ExpandableMetadataTags } from '../ExpandableMetadataTags'
import { workTagGroups } from '../work-tags'
import { exampleWork } from './display-examples'
import { allTagCategories, allTagOrder, type AllTagCategory, type TagAppearance } from './display-settings'

const exampleTags = workTagGroups(exampleWork.metadata)

/** Shared category ordering; individual tags retain their existing source order. */
export function TagOrderSettings({ appearance, onChange, disabled = false }: { appearance: TagAppearance; onChange: (next: TagAppearance) => void; disabled?: boolean }) {
 const order = allTagOrder(appearance.order)
 const [preview, setPreview] = useState<{ order: AllTagCategory[]; category: AllTagCategory }>()
 const shown = preview?.order ?? order
 const latest = useRef<AllTagCategory[] | undefined>(undefined)
 const layout = useLayout(650)
 const dragged = useRef<AllTagCategory | null>(null)
 function move(category: AllTagCategory, target: number, previewing = false) {
  const current = latest.current ?? order
  if (disabled || target < 0 || target >= current.length || current[target] === category) return
  const next = current.filter(item => item !== category)
  next.splice(target, 0, category)
  if (previewing) { latest.current = next; setPreview({ order: next, category }) }
  else onChange({ ...appearance, order: next })
 }
 function clearDrag() { dragged.current = null; latest.current = undefined; setPreview(undefined) }
 return <fieldset className="display-tag-order settings-subsection" disabled={disabled}><legend>All Tags Order</legend>
  <p className="field-help">Drag categories or use the arrows to change their order. Tags keep their order within each category.</p>
  <div className="tag-order-layout">
   <ol className="tag-order-list" onDragOver={event => { if (dragged.current) event.preventDefault() }} onDrop={event => {
    if (!dragged.current) return
    event.preventDefault()
    if (latest.current) onChange({ ...appearance, order: latest.current })
    clearDrag()
   }}>{shown.map((category, index) => <li key={category} draggable={!disabled} data-dragging={preview?.category === category ? true : undefined}
    onDragStart={event => { dragged.current = category; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', category) }}
    onDragEnd={clearDrag}
    onDragEnter={() => { if (dragged.current) move(dragged.current, index, true) }}>
    <GripVertical size={16} aria-hidden="true" /><span>{allTagCategories[category]}</span><div className="tag-order-actions">
     <button type="button" className="button secondary" disabled={index === 0} aria-label={`Move ${allTagCategories[category]} Up`} onClick={() => move(category, index - 1)}><ArrowUp size={16} aria-hidden="true" /></button>
     <button type="button" className="button secondary" disabled={index === order.length - 1} aria-label={`Move ${allTagCategories[category]} Down`} onClick={() => move(category, index + 1)}><ArrowDown size={16} aria-hidden="true" /></button>
    </div></li>)}</ol>
   <article className="settings-card tag-order-example" aria-label="Minimum Height Requirement Tag Preview">
    <ExpandableMetadataTags groups={exampleTags} appearance={preview ? { ...appearance, order: preview.order } : appearance} limit={layout === 'mobile' ? 4 : 7} />
   </article>
  </div>
 </fieldset>
}
