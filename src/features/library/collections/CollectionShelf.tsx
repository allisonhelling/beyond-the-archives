import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Check, Library, Plus } from 'lucide-react'
import { NewCollectionButton } from './CollectionChoices'
import { CollectionSpineLabel } from './CollectionSpineLabel'
import { useCollectionDrag } from './useCollectionDrag'
import { SpineBookmark } from './SpineBookmark'
import type { Collection } from '../model'
import type { SpineDesign } from './SpineDetails'
import { defaultShelfDesigns as shelfDesigns, automaticCollectionSpineDesign, defaultShelfColors as shelfColors, automaticCollectionIcons as shelfSymbols, collectionColors, collectionSymbols, type CollectionAppearance } from './collection-appearance'

const heightOrder = [0, 1, 2, 1]

export function CollectionShelf({ items, selected, disabled, onSelect, editing = false, onEdit, onMove, selectedIds = [], selecting = false, onSelectionChange, onAutomaticEdit, showHidden = false, readOnly = false }: {
  items: { id: string; name: string; count?: number; countLabel?: string; hidden?: boolean; color?: string | null; symbol?: string | null; spineDesign?: SpineDesign; automatic_rules?: Collection['automatic_rules'] }[]; selected: string; disabled: boolean; onSelect: (id: string) => void; editing?: boolean; onEdit?: (id: string, appearance: CollectionAppearance, shiftKey: boolean, direct?: boolean) => void; selectedIds?: string[]; selecting?: boolean; onSelectionChange?: (ids: string[]) => void; onMove?: (id: string, target: string) => void | Promise<void>; onAutomaticEdit?: (id: string) => void; readOnly?: boolean; showHidden?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [capacity, setCapacity] = useState(1)
  const [mobile, setMobile] = useState(() => window.innerWidth <= 650)
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean }>({ x: 0, y: 0, fired: false })
  function cancelHold() { clearTimeout(hold.current.timer) }
  useEffect(() => () => clearTimeout(hold.current.timer), [])
  const shelfRef = useRef<HTMLDivElement>(null)
  const shelfId = useId()
  const dragInstructionsId = useId()
  const { drag, preventDragClick } = useCollectionDrag(shelfRef, editing && !disabled, onMove, onSelectionChange ? { selectedIds, onChange: onSelectionChange } : undefined)
  useEffect(() => {
    const shelf = shelfRef.current!
    function measure() {
      setMobile(window.innerWidth <= 650)
      const styles = getComputedStyle(shelf)
      const width = parseFloat(styles.getPropertyValue('--collection-spine-width'))
      const gap = parseFloat(styles.getPropertyValue('--collection-spine-gap'))
      if (!Number.isFinite(width) || !Number.isFinite(gap)) return
      setCapacity(Math.max(1, Math.floor((shelf.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight) + gap) / (width + gap))))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(shelf)
    return () => observer.disconnect()
  }, [])
  const showAll = editing || expanded
  const displayedItems = items.filter(item => !item.hidden || editing && showHidden)
  const visible = displayedItems
  // Reserve the final slot for creation, in both the single and multiple shelf views.
  const customItems = items.filter(item => !shelfSymbols[item.id])
  const appearanceItems = [...customItems].sort((a, b) => a.name.localeCompare(b.name))
  const spines = [...visible.map((item, index) => {
    const customIndex = customItems.findIndex(custom => custom.id === item.id)
    const appearanceIndex = appearanceItems.findIndex(custom => custom.id === item.id)
    const color = shelfColors[item.id as keyof typeof shelfColors] ?? item.color ?? collectionColors[(Object.keys(shelfSymbols).length + appearanceIndex) % collectionColors.length].value
    const symbol = item.symbol ?? collectionSymbols[appearanceIndex % collectionSymbols.length]?.value ?? collectionSymbols[0].value
    const Icon = shelfSymbols[item.id] ?? collectionSymbols.find(option => option.value === symbol)?.Icon ?? Library
    const editable = editing
    const design = item.automatic_rules ? automaticCollectionSpineDesign : item.spineDesign ?? shelfDesigns[item.id]
    const spine = <button type="button" key={item.id} className={`collection-spine collection-spine-height-${heightOrder[index % heightOrder.length]}${item.hidden ? ' collection-spine-hidden' : ''}${selected === item.id ? ' selected' : ''}${selectedIds.includes(item.id) ? ' collection-spine-selected' : ''}`} style={{ '--cover-color': color } as CSSProperties} data-spine-design={design} aria-label={item.name} aria-description={`${item.hidden ? 'Hidden collection. ' : ''}${item.countLabel ?? `${item.count} ${item.id === 'series' ? 'series' : item.count === 1 ? 'story' : 'stories'}`}`} aria-pressed={selecting && customIndex >= 0 ? selectedIds.includes(item.id) : editing ? undefined : selected === item.id} aria-describedby={editable ? dragInstructionsId : undefined} aria-haspopup={editing && (!selecting || customIndex < 0) ? 'dialog' : undefined} disabled={disabled} onPointerDown={event => {
      cancelHold(); hold.current = { x: event.clientX, y: event.clientY, fired: false }
      if (!mobile || editing || event.pointerType === 'mouse') return
      hold.current.timer = setTimeout(() => {
        hold.current.fired = true
        if (customIndex >= 0) onEdit?.(item.id, { color, symbol }, false, true)
        else onAutomaticEdit?.(item.id)
      }, 500)
    }} onPointerMove={event => { if (Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 10) cancelHold() }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onContextMenu={event => { if (mobile) event.preventDefault() }} title={editable ? `Edit ${item.name}` : item.name} onClick={event => {
      if (hold.current.fired) { hold.current.fired = false; event.preventDefault(); return }
      if (editing && customIndex < 0 && onAutomaticEdit) { onAutomaticEdit(item.id); return }
      const direct = event.metaKey || event.ctrlKey
      if (customIndex >= 0 && onEdit && (editing || event.shiftKey || direct)) {
        event.preventDefault()
        onEdit(item.id, { color, symbol }, event.shiftKey, direct)
      } else onSelect(item.id)
    }}>{selected === item.id && <SpineBookmark />}{selectedIds.includes(item.id) && <span className="collection-selection-mark" aria-hidden="true"><Check size={16} /></span>}<CollectionSpineLabel design={design} name={item.id === 'all' ? item.name.replace(' ', '\n') : item.name} Icon={Icon} count={item.count} /></button>
    return editable ? <div className={`collection-spine-movable${customIndex >= 0 ? ' collection-spine-editor' : ''}`} data-collection-group={customIndex >= 0 ? 'custom' : 'default'} data-collection-id={item.id} data-dragging={drag?.ids.includes(item.id) || undefined} data-drop-target={drag?.target === item.id && !drag.ids.includes(item.id) || undefined} key={item.id} style={drag?.ids.includes(item.id) ? { '--drag-x': `${drag.x}px`, '--drag-y': `${drag.y}px` } as CSSProperties : undefined} onDragStart={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}>{spine}</div> : spine
  }), ...(!readOnly ? [<NewCollectionButton key="new" label={<CollectionSpineLabel name="New Collection" Icon={Plus} />} className={`collection-spine collection-spine-new collection-spine-height-${heightOrder[visible.length % heightOrder.length]}`} disabled={disabled} />] : [])]
  const expandable = !editing && (mobile || displayedItems.length + 1 > capacity)
  const bookendArtwork =
    <svg viewBox="6 0 88 118" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 114V43.834C12 12.257 43.667-7.479 69 8.309 80.757 15.637 88 29.179 88 43.834V114Z" fill="var(--bookend-wood)" stroke="none" />
      <path d="M19 108.603V44.913C19 19.153 44.833 3.052 65.5 15.933 75.091 21.911 81 32.958 81 44.913V108.603" strokeWidth="2" />
      <path d="M24 107.523V45.993C24 24.387 45.667 10.884 63 21.686 71.044 26.701 76 35.966 76 45.993V107.523" strokeWidth="1.2" />
      <circle cx="50" cy="49" r="21" fill="var(--bookend-plate)" strokeWidth="1.7" />
      <circle cx="50" cy="49" r="16" strokeWidth="2" />
      {expandable && <path d={expanded ? 'm42 52 8-8 8 8' : 'm42 46 8 8 8-8'} stroke="var(--bookend-ink)" strokeWidth="3" />}
      <path d="M32 101h36" strokeWidth="2" />
      <rect x="8" y="109" width="84" height="8" rx="2" fill="var(--bookend-wood)" strokeWidth="2" />
      <rect x="27.902" y="78.358" width="44" height="16" rx="2" fill="var(--bookend-plate)" strokeWidth="1.5" />
      {expandable && <text x="49.902" y="89.358" textAnchor="middle" fontFamily="Georgia, serif" fontSize={expanded ? 9 : 10} fill="var(--bookend-ink)" stroke="none">{expanded ? 'SEE LESS' : 'SEE ALL'}</text>}
    </svg>
  const bookend = expandable
    ? <button type="button" key="bookend" className="collection-shelf-toggle" aria-label={expanded ? 'Show Fewer Collections' : 'Show All Collections'} title={expanded ? 'Show Fewer Collections' : 'Show All Collections'} aria-expanded={expanded} aria-controls={shelfId} onClick={() => setExpanded(!expanded)}>{bookendArtwork}</button>
    : <div key="bookend" className="collection-shelf-toggle" aria-hidden="true">{bookendArtwork}</div>
  const leadingBookend = <div key="bookend" className="collection-shelf-bookend">
    {!readOnly && <NewCollectionButton label={<CollectionSpineLabel name="New Collection" Icon={Plus} design="plain" />} className="collection-spine collection-spine-new collection-spine-mini" disabled={disabled} />}
    {bookend}
  </div>
  const shelfContents = [leadingBookend, ...spines]
  const rowSize = showAll ? capacity : shelfContents.length
  const rows = Array.from({ length: Math.ceil(shelfContents.length / rowSize) }, (_, index) => shelfContents.slice(index * rowSize, (index + 1) * rowSize))
  return <nav className={`collection-shelves${showAll ? ' collection-shelves-expanded' : ''}${editing ? ' collection-shelves-editing' : ''}`} aria-label="Library Shelves" onClickCapture={preventDragClick}>
    {editing && <span id={dragInstructionsId} className="sr-only">Drag to reorder collections in any position. Use Alt plus Left or Right Arrow to move with the keyboard. Press Escape to cancel dragging. Shift-click or Shift-drag to select collections for bulk editing. Start Shift-drag on a selected collection to deselect a range. Drag a selected collection to move the selected group. Press Delete or Backspace to delete selected collections; non-empty collections require confirmation.</span>}
    <div id={shelfId} className="collection-shelf-rows" ref={shelfRef}>{rows.map((row, index) => <div className="collection-shelf-row" key={index}>{row}</div>)}</div>
  </nav>
}
