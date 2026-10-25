import { useState } from 'react'
import type { DisplayLayout } from '../../../lib/use-layout'
import { previewViewports, savePreviewViewports, viewportPresets, type PreviewViewport } from './display-settings'
export function ViewportSizeFields({ value, onChange, label }: { value: PreviewViewport; onChange: (value: PreviewViewport) => void; label: string }) {
 const [custom, setCustom] = useState(false)
 const preset = custom ? 'custom' : Object.entries(viewportPresets).find(([, size]) => size.width === value.width && size.height === value.height)?.[0] ?? 'custom'
 return <fieldset className="viewport-size-fields"><legend>{label}</legend>
  <label>Device<select value={preset} onChange={event => { setCustom(event.target.value === 'custom'); const next = viewportPresets[event.target.value as keyof typeof viewportPresets]; if (next) onChange({ width: next.width, height: next.height }) }}><option value="custom">Custom Size</option>{Object.entries(viewportPresets).map(([key, size]) => <option key={key} value={key}>{size.label} · {size.width} × {size.height}</option>)}</select></label>
  <div className="form-grid form-grid-two-columns"><label>Width (px)<input type="number" min={280} max={3840} step={1} required value={value.width || ''} onChange={event => onChange({ ...value, width: Number(event.target.value) })} /></label><label>Height (px)<input type="number" min={320} max={3840} step={1} required value={value.height || ''} onChange={event => onChange({ ...value, height: Number(event.target.value) })} /></label></div>
 </fieldset>
}
export function ViewportSettings() {
 const [sizes, setSizes] = useState(previewViewports), [message, setMessage] = useState(''), [error, setError] = useState('')
 return <form className="story-form settings-subsection" onSubmit={event => { event.preventDefault(); try { savePreviewViewports(sizes); setMessage('Preview sizes saved.'); setError('') } catch (failure) { setError((failure as Error).message) } }}>
  <h3>Preview Screen Sizes</h3><p className="field-help">Choose a device or enter exact CSS pixel dimensions. These sizes control the tile and information-page previews; live layouts follow your browser width.</p>
  <div className="viewport-settings-grid">{(['mobile', 'desktop'] as DisplayLayout[]).map(layout => <ViewportSizeFields key={layout} label={layout === 'mobile' ? 'Mobile Preview' : 'Desktop Preview'} value={sizes[layout]} onChange={size => { setSizes(current => ({ ...current, [layout]: size })); setMessage('') }} />)}</div>
  <div className="form-actions"><button className="button secondary">Save Preview Sizes</button></div>{message && <p role="status">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}
 </form>
}
