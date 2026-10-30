import { useState } from 'react'
import { CollectionColorPicker } from '../collections/CollectionColorPicker'
import { MetadataTags } from '../MetadataTags'
import { tagColors, type TagAppearance, type TagCategory } from './display-settings'
import './tag-colors.css'

export function TagColorSettings({ appearance, onChange: change, disabled = false }: { appearance: TagAppearance; onChange: (value: TagAppearance) => void; disabled?: boolean }) {
  const [allColor, setAllColor] = useState<string>(tagColors.tags.color)
  const [undoColors, setUndoColors] = useState<TagAppearance['colors'] | null>(null)
  return (
    <fieldset className="display-tag-colors settings-subsection" disabled={disabled}><legend>Tag Colors</legend><div className="display-tag-color-grid">{(Object.keys(tagColors) as TagCategory[]).map(category => <div key={category} role="group" aria-label={`${tagColors[category].label} Color`}><span className="field-help">{tagColors[category].label}:</span><CollectionColorPicker disabled={disabled} showHex value={appearance.colors[category] ?? tagColors[category].color} onChange={color => change({ ...appearance, colors: { ...appearance.colors, [category]: color } })} /><span className="display-tag-example"><span>Ex.</span><MetadataTags values={[tagColors[category].example]} category={category} appearance={appearance} /></span></div>)}</div>
      <div className="display-all-colors"><div role="group" aria-label="Change All Tags"><span className="field-help">Change All Tags:</span><CollectionColorPicker disabled={disabled} showHex value={allColor} onChange={setAllColor} /></div><button type="button" className="button secondary" disabled={!/^#[a-fA-F0-9]{6}$/.test(allColor)} onClick={() => { setUndoColors({ ...appearance.colors }); change({ ...appearance, colors: Object.fromEntries(Object.keys(tagColors).map(category => [category, allColor])) }) }}>Apply</button><button type="button" className="button secondary" disabled={!undoColors} onClick={() => { if (undoColors) { change({ ...appearance, colors: undoColors }); setUndoColors(null) } }}>Undo</button></div>
    </fieldset>
  )
}
