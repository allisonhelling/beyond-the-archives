import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Info, X } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'

export function PersonalTagHelp() {
  return <Tooltip description="Press Enter to add a tag. Use arrow keys to move between tags; Backspace selects, then deletes the previous tag.">{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label="Personal tags help" aria-describedby={descriptionId}><Info size={14} aria-hidden="true" /></button>}</Tooltip>
}

export function PersonalTagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState(''), [position, setPosition] = useState(value.length), [selected, setSelected] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const restoreFocus = useRef(false)
  const cursor = Math.min(position, value.length)
  useLayoutEffect(() => { if (restoreFocus.current) { input.current?.focus(); restoreFocus.current = false } })
  function move(next: number) {
    restoreFocus.current = true
    setPosition(next); setSelected(null)
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
    <div className="metadata-tags tag-input" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { add(false); setSelected(null) } }}>
      {Array.from({ length: value.length + 1 }, (_, index) => <Fragment key={index}>
        {cursor === index ? <input ref={input} aria-label="Personal tags" placeholder="Type a tag…" value={draft} onChange={event => { setDraft(event.target.value); setSelected(null) }} onKeyDown={keyboard} /> : <button type="button" className="tag-insertion-point" aria-label={`Insert tag ${index === 0 ? 'at start' : `after ${value[index - 1]}`}`} onClick={() => move(index)} />}
        {index < value.length && <button type="button" className={`metadata-tag removable-tag${selected === index ? ' tag-selected' : ''}`} aria-label={`Delete personal tag ${value[index]}`} onClick={() => remove(index)}><span>{value[index]}</span><X size={13} aria-hidden="true" /></button>}
      </Fragment>)}
    </div>
  </div>
}
