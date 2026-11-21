import { CollectionColorPicker } from '../collections/CollectionColorPicker'
import { MetadataTags } from '../MetadataTags'
import { defaultAllTagColor, tagColors, type TagAppearance, type TagCategory } from './display-settings'
import './tag-colors.css'

type ColorSettingsProps = { appearance: TagAppearance; onChange: (value: TagAppearance) => void; disabled?: boolean }

export function TagColorMode({ appearance, onChange, disabled }: ColorSettingsProps) {
  return <label>Tag Color Mode<select disabled={disabled} value={appearance.colorMode ?? 'multi'} onChange={event => onChange({ ...appearance, colorMode: event.target.value === 'mono' ? 'mono' : 'multi' })}>
    <option value="mono">Mono Color</option><option value="multi">Multicolor</option>
  </select></label>
}

export function TagColorSettings({ appearance, onChange: change, disabled = false }: ColorSettingsProps) {
  const monochrome = appearance.colorMode === 'mono'
  return <fieldset className="display-tag-colors settings-subsection" disabled={disabled}><legend>Tag Colors</legend>
    <div className="display-tag-color-grid">
      {(Object.keys(tagColors) as TagCategory[]).map(category => <div key={category} role="group" aria-label={`${tagColors[category].label} Color`}>
        <span className="field-help">{tagColors[category].label}:</span>
        <CollectionColorPicker disabled={disabled || monochrome} showHex value={appearance.colors[category] ?? tagColors[category].color} onChange={color => change({ ...appearance, colors: { ...appearance.colors, [category]: color } })} />
        <span className="display-tag-example"><span>Ex.</span><MetadataTags values={[tagColors[category].example]} category={category} appearance={appearance} /></span>
      </div>)}
      <div role="group" aria-label="All Tags Color"><span className="field-help">All Tags:</span>
        <CollectionColorPicker disabled={disabled || !monochrome} showHex value={appearance.allColor ?? defaultAllTagColor} onChange={allColor => change({ ...appearance, allColor })} />
        <span className="display-tag-example"><span>Ex.</span><MetadataTags values={['Fluff']} appearance={{ ...appearance, colorMode: 'mono' }} /></span>
      </div>
    </div>
  </fieldset>
}
