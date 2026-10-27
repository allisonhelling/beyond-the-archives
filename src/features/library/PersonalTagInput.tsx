import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { GripVertical, Info, X } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'

const mobileTagQuery = '(max-width: 650px), (pointer: coarse)'
const tagInstructions = 'Press Enter to add a tag. Use arrow keys to move between tags; Backspace selects, then deletes the previous tag.'
const mobileTagInstructions = 'Hold the grip beside the typing field, drag it between tags, and release to move the typing position. Tap a tag to select it, then tap it again to delete it.'

export function PersonalTagHelp({ inline = false }: { inline?: boolean }) {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(mobileTagQuery).matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.(mobileTagQuery)
    if (!query) return
    const update = () => setMobile(query.matches)
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  const description = mobile ? mobileTagInstructions : tagInstructions
  if (inline) return <details className="field-info personal-tag-help"><summary aria-label="Personal Tags Help" role="button"><Info aria-hidden="true" /></summary><span>{description}</span></details>
  return <Tooltip pinOnClick description={description}>{descriptionId => <button type="button" className="icon-button inline-edit-icon personal-tag-help-button" aria-label="Personal Tags Help" aria-describedby={descriptionId}><Info size={12} aria-hidden="true" /></button>}</Tooltip>
}

export function PersonalTagInput({ value, onChange, inlineHelp = false }: { value: string[]; onChange: (tags: string[]) => void; inlineHelp?: boolean }) {
  const [draft, setDraft] = useState(''), [position, setPosition] = useState(value.length), [selected, setSelected] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null), editor = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; x: number; y: number; active: boolean; target: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [dropPosition, setDropPosition] = useState<number | null>(null)
  useEffect(() => () => { clearTimeout(drag.current?.timer) }, [])
  const restoreFocus = useRef(false)
  const cursor = Math.min(position, value.length)
  useLayoutEffect(() => { if (restoreFocus.current) { input.current?.focus({ preventScroll: true }); restoreFocus.current = false } })
  function move(next: number) {
    restoreFocus.current = true
    setPosition(next); setSelected(null)
  }
  function startCursorMove(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || drag.current) return
    event.preventDefault()
    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)
    drag.current = { pointerId, x: event.clientX, y: event.clientY, active: false, target: cursor, timer: setTimeout(() => {
      if (drag.current?.pointerId !== pointerId) return
      drag.current.active = true
      setSelected(null); setDropPosition(cursor)
    }, 300) }
  }
  function updateCursorMove(event: PointerEvent<HTMLButtonElement>) {
    const pending = drag.current
    if (!pending || pending.pointerId !== event.pointerId) return
    if (!pending.active) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 8) finishCursorMove(event, false)
      return
    }
    event.preventDefault()
    let distance = Infinity
    for (const slot of editor.current?.querySelectorAll<HTMLElement>('[data-tag-position]') ?? []) {
      const rect = slot.getBoundingClientRect()
      const next = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2))
      if (next < distance) { distance = next; pending.target = Number(slot.dataset.tagPosition) }
    }
    setDropPosition(pending.target)
  }
  function finishCursorMove(event: PointerEvent<HTMLButtonElement>, commit: boolean) {
    const pending = drag.current
    if (!pending || pending.pointerId !== event.pointerId) return
    clearTimeout(pending.timer); drag.current = null; setDropPosition(null)
    if (event.currentTarget.hasPointerCapture(pending.pointerId)) event.currentTarget.releasePointerCapture(pending.pointerId)
    if (commit && pending.active) move(pending.target)
  }
  function add(keepFocus = true) {
    const name = draft.trim()
    if (!name) return
    if (!value.some(tag => tag.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      onChange([...value.slice(0, cursor), name, ...value.slice(cursor)])
      if (keepFocus) move(cursor + 1)
      else setPosition(cursor + 1)
    }
    setDraft(''); setSelected(null)
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
    move(Math.max(0, cursor - (index < cursor ? 1 : 0)))
  }
  function activateTag(index: number) {
    const confirmDeletion = window.matchMedia?.(mobileTagQuery).matches ?? false
    if (confirmDeletion && selected !== index) setSelected(index)
    else remove(index)
  }
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') { event.preventDefault(); add() }
    else if (event.key === 'Backspace' && !draft && cursor > 0) {
      event.preventDefault()
      if (selected === cursor - 1) remove(selected)
      else setSelected(cursor - 1)
    } else if (event.key === 'ArrowLeft' && event.currentTarget.selectionStart === 0 && cursor > 0) {
      event.preventDefault(); move(cursor - 1)
    } else if (event.key === 'ArrowRight' && event.currentTarget.selectionEnd === draft.length && cursor < value.length) {
      event.preventDefault(); move(cursor + 1)
    } else setSelected(null)
  }
  return <div className="personal-tag-editor">
    <div ref={editor} className="metadata-tags tag-input" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { add(false); setSelected(null) } }}>
      {Array.from({ length: value.length + 1 }, (_, index) => index).flatMap(index => [
        cursor === index ? <span key="typing-field" className="tag-input-entry" data-tag-position={index} data-drop-target={dropPosition === index || undefined}>
          <span className="tag-input-measure" aria-hidden="true"><span>Type a tag…</span><span>{draft}{'\u200b'}</span></span>
          <input ref={input} size={1} aria-label="Personal Tags" placeholder="Type a tag…" value={draft} onChange={event => { setDraft(event.target.value); setSelected(null) }} onKeyDown={keyboard} />
          <button type="button" className="tag-cursor-handle" aria-label="Move Tag Typing Position" aria-pressed={dropPosition !== null} onPointerDown={startCursorMove} onPointerMove={updateCursorMove} onPointerUp={event => finishCursorMove(event, true)} onPointerCancel={event => finishCursorMove(event, false)} onLostPointerCapture={event => finishCursorMove(event, false)} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(Math.max(0, Math.min(value.length, cursor + (event.key === 'ArrowLeft' ? -1 : 1)))) }
          }}><GripVertical aria-hidden="true" /></button>
        </span> : <button key={`gap-${index}`} type="button" className="tag-insertion-point" data-tag-position={index} data-drop-target={dropPosition === index || undefined} aria-label={`Insert Tag ${index === 0 ? 'at Start' : `After ${value[index - 1]}`}`} onClick={() => move(index)} />,
        index < value.length ? <button key={`tag-${value[index]}`} type="button" className={`metadata-tag removable-tag${selected === index ? ' tag-selected' : ''}`} aria-label={`Delete Personal Tag ${value[index]}`} aria-pressed={selected === index} onClick={() => activateTag(index)}><span className="tag-label">{value[index]}</span><span className="tag-remove-cap"><X size={13} aria-hidden="true" /></span></button> : null,
      ])}
    </div>
    <PersonalTagHelp inline={inlineHelp} />
  </div>
}
