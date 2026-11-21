import { useId, useState, useSyncExternalStore } from 'react'
import { saveTextScale, subscribeDisplay, textScale, textScaleOptions } from '../features/library/display/display-settings'

export function TextScalingControl() {
 const description = useId()
 const scale = useSyncExternalStore(subscribeDisplay, textScale, () => 'standard')
 const [error, setError] = useState('')

 return <div className="text-scaling-control">
  <label>Text Scaling
   <select value={scale} aria-describedby={description} onChange={event => {
    try { saveTextScale(event.target.value); setError('') }
    catch { setError('Could not save text scaling. Check browser storage permissions.') }
   }}>
    {Object.entries(textScaleOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
   </select>
  </label>
  <p id={description} className="field-help">Change the size of text, buttons, and other items.</p>
  {error && <p role="alert">{error}</p>}
 </div>
}
