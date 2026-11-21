import { useId, useState, type ReactNode } from 'react'
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
export function ViewportSizeFields({ value, onChange, label, description, className, children, collapsible = false, unit: selectedUnit, onUnitChange, unitsAfterDimensions = false }: { value: PreviewViewport; onChange: (value: PreviewViewport) => void; label: string; description?: string; className?: string; children?: ReactNode; collapsible?: boolean; unit?: ViewportUnit; onUnitChange?: (unit: ViewportUnit) => void; unitsAfterDimensions?: boolean }) {
 const [choice, setChoice] = useState<string>(), [localUnit, setLocalUnit] = useState<ViewportUnit>('in')
 const [expanded, setExpanded] = useState(false), contentId = useId()
 const unit = selectedUnit ?? localUnit
 const setUnit = (next: ViewportUnit) => { if (onUnitChange) onUnitChange(next); else setLocalUnit(next) }
 const chosen = choice && choice !== 'custom' ? viewportPresets[choice as keyof typeof viewportPresets] : undefined
 const preset = choice === 'custom' ? 'custom' : chosen?.width === value.width && chosen?.height === value.height ? choice : Object.entries(viewportPresets).find(([, size]) => size.width === value.width && size.height === value.height)?.[0] ?? 'custom'
 const unitsControl = <label className="viewport-unit-field">Units<select value={unit} onChange={event => setUnit(event.target.value as ViewportUnit)}>{Object.entries(viewportUnits).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
 const fields = <>
  {description && <p className="field-help">{description}</p>}
  <label>Device<select value={preset} onChange={event => { setChoice(event.target.value); const next = viewportPresets[event.target.value as keyof typeof viewportPresets]; if (next) onChange({ width: next.width, height: next.height }) }}><option value="custom">Custom Size</option>{Object.entries(viewportPresets).map(([key, size]) => <option key={key} value={key}>{size.label} · {formatViewportSize(size, unit)}</option>)}</select></label>
  {!unitsAfterDimensions && unitsControl}
  <div className="form-grid form-grid-two-columns">{(['width', 'height'] as const).map(axis => <ViewportLengthField key={`${axis}:${unit}`} axis={axis} pixels={value[axis]} unit={unit} onChange={pixels => { setChoice('custom'); onChange({ ...value, [axis]: pixels }) }} />)}</div>
  {unitsAfterDimensions && unitsControl}
  <p className="field-help viewport-size-conversion">{formatViewportSize(value, unit === 'in' ? 'mm' : 'in')}</p>
  {children}
 </>
 return <fieldset className={className ? `viewport-size-fields ${className}` : 'viewport-size-fields'}>
  <legend className={collapsible ? 'display-tile-heading' : undefined}>
   {collapsible ? <button type="button" className="disclosure-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(current => !current)}>{label}</button> : label}
  </legend>
  {collapsible ? <div id={contentId} className="viewport-size-content" hidden={!expanded}>{fields}</div> : fields}
 </fieldset>
}
export function ViewportSettings() {
 const [sizes, setSizes] = useState(previewViewports), [message, setMessage] = useState(''), [error, setError] = useState('')
 return <form className="story-form mobile-preview-form" onSubmit={event => { event.preventDefault(); try { savePreviewViewports(sizes); setMessage('Preview sizes saved.'); setError('') } catch (failure) { setError((failure as Error).message) } }}>
  <ViewportSizeFields
   label="Mobile Preview Screen Size"
   collapsible
   className="settings-subsection mobile-preview-settings"
   description="Choose a device or enter dimensions in inches or millimeters. Measurements use CSS units (1 in = 25.4 mm = 96 CSS pixels) for the preview canvas."
   value={sizes.mobile}
   onChange={size => { setSizes(current => ({ ...current, mobile: size })); setMessage('') }}
  >
   <div className="form-actions"><button className="button secondary">Save Preview Sizes</button></div>
   {message && <p role="status">{message}</p>}
   {error && <p role="alert" className="error-message">{error}</p>}
  </ViewportSizeFields>
 </form>
}
