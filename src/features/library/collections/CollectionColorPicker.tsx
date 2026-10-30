import './color-picker.css'
import { useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useDismissible } from '../../../components/useDismissible'
import { collectionColorPattern, collectionColors } from './collection-colors'

type Hsv = { h: number; s: number; v: number }
const validHex = new RegExp(collectionColorPattern)

function toHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const sector = !delta ? 0 : max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return { h: (sector * 60 + 360) % 360, s: max ? delta / max : 0, v: max }
}

function toHex({ h, s, v }: Hsv) {
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(5)}${channel(3)}${channel(1)}`
}

export function CollectionColorPicker({ value, onChange, disabled = false, showHex = false }: { value: string; onChange: (hex: string) => void; disabled?: boolean; showHex?: boolean }) {
  const [open, setOpen] = useState(false)
  const [hsv, setHsv] = useState(() => toHsv(value))
  const current = validHex.test(value) && toHex(hsv) !== value.toLowerCase() ? toHsv(value) : hsv
  // Let the outside click finish before collapsing this inline panel moves its target.
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false), { outsideEvent: 'click', dismissOnFocus: false })
  const trigger = useRef<HTMLButtonElement>(null)
  const hexInput = useRef<HTMLInputElement>(null)
  const panelId = useId()
  const customColor = validHex.test(value) && !collectionColors.some(option => option.value === value.toLowerCase())
  function change(next: Hsv) { setHsv(next); onChange(toHex(next)) }
  function shade(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    change({ ...current, s: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), v: 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) })
  }
  return <div className="collection-custom-color" ref={ref} style={{ '--picker-hue': current.h } as CSSProperties} onKeyDown={event => {
    if (open && (event.key === 'Escape' || event.key === 'Enter')) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
  }}>
    <button ref={trigger} type="button" className="button secondary collection-color-trigger" disabled={disabled} aria-label="Custom Color" title={value} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
      <span className="collection-color-swatch" style={{ '--cover-color': validHex.test(value) ? value : toHex(current) } as CSSProperties} aria-hidden="true" />{showHex || customColor ? value : 'Custom Color'}
    </button>
    <div id={panelId} className="collection-color-picker" hidden={!open} data-open={open || undefined}>
      {open && <div className="collection-color-controls" role="group" aria-label="Color Picker">
        <div className="collection-color-shade" style={{ '--picker-saturation': `${current.s * 100}%`, '--picker-darkness': `${(1 - current.v) * 100}%` } as CSSProperties} onPointerDown={event => {
          if (disabled || event.button !== 0) return
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); shade(event)
        }} onPointerMove={event => { if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) shade(event) }} onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) { shade(event); event.currentTarget.releasePointerCapture(event.pointerId) }
        }}>
          <span className="collection-color-cursor" aria-hidden="true" />
          <input className="sr-only" type="range" aria-label="Saturation" min="0" max="100" value={Math.round(current.s * 100)} disabled={disabled} onChange={event => change({ ...current, s: Number(event.target.value) / 100 })} />
          <input className="sr-only" type="range" aria-label="Brightness" min="0" max="100" value={Math.round(current.v * 100)} disabled={disabled} onChange={event => change({ ...current, v: Number(event.target.value) / 100 })} />
        </div>
        <input className="collection-color-hue" type="range" aria-label="Hue" min="0" max="360" value={current.h} disabled={disabled} onChange={event => change({ ...current, h: Number(event.target.value) })} />
      </div>}
      <label className="collection-color-hex"><span className="sr-only">Custom Color (Hex)</span><input ref={hexInput} type="text" required pattern={collectionColorPattern} maxLength={7} placeholder="#970000" title="Enter # followed by six hexadecimal digits." autoCapitalize="none" spellCheck={false} value={value} disabled={disabled} onInvalid={event => { event.preventDefault(); setOpen(true); requestAnimationFrame(() => hexInput.current?.focus()) }} onChange={event => onChange(event.target.value)} /></label>
    </div>
  </div>
}
