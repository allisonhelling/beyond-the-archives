import { useState } from 'react'
import type { DisplayLayout } from '../../../lib/use-layout'
import { formatViewportSize, viewportLength, viewportPixels, viewportRanges, viewportUnits, previewViewports, savePreviewViewports, viewportPresets, type PreviewViewport, type ViewportUnit } from './display-settings'

function ViewportLengthField({ axis, pixels, unit, onChange }: { axis: 'width' | 'height'; pixels: number; unit: ViewportUnit; onChange: (pixels: number) => void }) {
 const [draft, setDraft] = useState({ pixels, text: pixels ? String(viewportLength(pixels, unit)) : '' })
 if (draft.pixels !== pixels) setDraft({ pixels, text: pixels ? String(viewportLength(pixels, unit)) : '' })
 const range = viewportRanges[axis]
 return <label>{axis === 'width' ? 'Width' : 'Height'} ({unit})<input type="number" min={viewportLength(range.min, unit)} max={viewportLength(range.max, unit)} step="any" required value={draft.text} onChange={event => {
  const text = event.target.value, next = viewportPixels(Number(text), unit)
  setDraft({ pixels: next, text }); onChange(next)
 }} /></label>
}
export function ViewportSizeFields({ value, onChange, label }: { value: PreviewViewport; onChange: (value: PreviewViewport) => void; label: string }) {
 const [choice, setChoice] = useState<string>(), [unit, setUnit] = useState<ViewportUnit>('in')
 const chosen = choice && choice !== 'custom' ? viewportPresets[choice as keyof typeof viewportPresets] : undefined
 const preset = choice === 'custom' ? 'custom' : chosen?.width === value.width && chosen?.height === value.height ? choice : Object.entries(viewportPresets).find(([, size]) => size.width === value.width && size.height === value.height)?.[0] ?? 'custom'
 return <fieldset className="viewport-size-fields"><legend>{label}</legend>
  <label>Device<select value={preset} onChange={event => { setChoice(event.target.value); const next = viewportPresets[event.target.value as keyof typeof viewportPresets]; if (next) onChange({ width: next.width, height: next.height }) }}><option value="custom">Custom Size</option>{Object.entries(viewportPresets).map(([key, size]) => <option key={key} value={key}>{size.label} · {formatViewportSize(size, unit)}</option>)}</select></label>
  <label>Units<select value={unit} onChange={event => setUnit(event.target.value as ViewportUnit)}>{Object.entries(viewportUnits).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
  <div className="form-grid form-grid-two-columns">{(['width', 'height'] as const).map(axis => <ViewportLengthField key={`${axis}:${unit}`} axis={axis} pixels={value[axis]} unit={unit} onChange={pixels => { setChoice('custom'); onChange({ ...value, [axis]: pixels }) }} />)}</div>
  <p className="field-help">{formatViewportSize(value, unit === 'in' ? 'mm' : 'in')}</p>
 </fieldset>
}
export function ViewportSettings() {
 const [sizes, setSizes] = useState(previewViewports), [message, setMessage] = useState(''), [error, setError] = useState('')
 return <form className="story-form settings-subsection" onSubmit={event => { event.preventDefault(); try { savePreviewViewports(sizes); setMessage('Preview sizes saved.'); setError('') } catch (failure) { setError((failure as Error).message) } }}>
  <h3>Preview Screen Sizes</h3><p className="field-help">Choose a device or enter dimensions in inches or millimeters. Measurements use CSS units (1 in = 25.4 mm = 96 CSS pixels) for the preview canvas. These sizes control tile and information-page previews; live layouts follow your browser width.</p>
  <div className="viewport-settings-grid">{(['mobile', 'desktop'] as DisplayLayout[]).map(layout => <ViewportSizeFields key={layout} label={layout === 'mobile' ? 'Mobile Preview' : 'Desktop Preview'} value={sizes[layout]} onChange={size => { setSizes(current => ({ ...current, [layout]: size })); setMessage('') }} />)}</div>
  <div className="form-actions"><button className="button secondary">Save Preview Sizes</button></div>{message && <p role="status">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}
 </form>
}
