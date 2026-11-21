import { CollectionColorPicker } from '../collections/CollectionColorPicker'
import { MetadataTags } from '../MetadataTags'
import { defaultFandomAppearance, tagShapes, type FandomAppearance, type TagAppearance, type TagShape, type TagTextColor } from './display-settings'

export function TagTextColorControl({ label = 'Tag Text Color', value, disabled, onChange }: {
  label?: string; value: TagTextColor; disabled?: boolean; onChange: (value: TagTextColor) => void
}) {
  return <label>{label}<select value={value} disabled={disabled} onChange={event => onChange(event.target.value as TagTextColor)}>
    <option value="colored">Colored Text</option><option value="black">Black Text</option>
  </select></label>
}

export function TagShapeChoices({ appearance, values, disabled, onChange }: {
  appearance: TagAppearance; values: string[]; disabled?: boolean; onChange: (shape: TagShape) => void
}) {
  return <div className="display-tag-shape-options">{(Object.entries(tagShapes) as [TagShape, string][]).map(([shape, name]) =>
    <button type="button" className="tag-shape-option" key={shape} data-shape={shape} disabled={disabled} aria-pressed={appearance.shape === shape} onClick={() => onChange(shape)}>
      <MetadataTags values={values} appearance={appearance} shape={shape} /><span>{name}</span>
    </button>
  )}</div>
}

export function TagShapeSettings({ appearance, disabled, onChange }: {
  appearance: TagAppearance; disabled?: boolean; onChange: (shape: TagShape) => void
}) {
  return <fieldset className="display-tag-shapes settings-subsection"><legend>Tag Shape</legend>
    <TagShapeChoices appearance={appearance} values={['Humor', 'Fluff']} disabled={disabled} onChange={onChange} />
  </fieldset>
}

export function FandomTagSettings({ value = defaultFandomAppearance, examples, colorExample = examples[0], disabled, onChange }: {
  value?: FandomAppearance; examples: string[]; colorExample?: string; disabled?: boolean; onChange: (value: FandomAppearance) => void
}) {
  const appearance: TagAppearance = { shape: value.shape, textColor: value.textColor, colors: { tags: value.color } }
  return <fieldset className="display-tag-shapes settings-subsection"><legend>Fandom Tags</legend>
    <TagShapeChoices appearance={appearance} values={examples} disabled={disabled} onChange={shape => onChange({ ...value, shape })} />
    <div className="tag-color-modes fandom-color-controls">
      <TagTextColorControl label="Fandom Text Color" value={value.textColor} disabled={disabled} onChange={textColor => onChange({ ...value, textColor })} />
      <div className="fandom-tag-color" role="group" aria-label="Fandom Tag Color">
        <span>Tag Color</span>
        <CollectionColorPicker value={value.color} showHex disabled={disabled} onChange={color => onChange({ ...value, color })} />
        <div className="display-tag-example"><span>Ex.</span><MetadataTags values={[colorExample]} appearance={appearance} /></div>
      </div>
    </div>
  </fieldset>
}
