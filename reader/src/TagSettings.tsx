import { useEffect, useState } from 'react'
import { TagOrderSettings } from '../../src/features/library/display/TagOrderSettings'
import { TagColorSettings } from '../../src/features/library/display/TagColorSettings'
import { collectionColorPattern } from '../../src/features/library/collections/collection-colors'
import { ReaderSection } from './ReaderSettings'
import { MetadataTags } from '../../src/features/library/MetadataTags'
import { tagShapes, type TagAppearance, type TagShape } from '../../src/features/library/display/display-settings'

export function TagSettings({asPage=false, appearance, linked, connected, loaded, error, onShape, onColors, onOrder, onLink, onClose }: {asPage?:boolean; appearance: TagAppearance; linked: boolean; connected: boolean; loaded: boolean; error: string; onShape: (shape: TagShape) => void; onColors: (colors: TagAppearance['colors']) => void; onOrder: (order: NonNullable<TagAppearance['order']>) => void; onLink: (linked: boolean) => void; onClose: () => void }) {
 const [colors, setColors] = useState(appearance.colors)
 const savedColors = JSON.stringify(appearance.colors)
 useEffect(() => setColors(JSON.parse(savedColors) as TagAppearance['colors']), [savedColors])
 const valid = Object.values(colors).every(value => new RegExp(collectionColorPattern).test(value))
 const dirty = JSON.stringify(colors) !== JSON.stringify(appearance.colors)
 const draft = { ...appearance, colors }
 return <ReaderSection page={asPage} title="Tag Format" className="tag-format-dialog" onClose={onClose}>
  <p>Choose how tags appear on your bookshelf, in work details, and below the filters.</p>
  <label>Tag Style<select aria-label="Tag Style" value={appearance.shape} disabled={linked} onChange={event => onShape(event.target.value as TagShape)}>{Object.entries(tagShapes).map(([shape, label]) => <option key={shape} value={shape}>{label}{shape === 'filled' ? ' (Reader Default)' : ''}</option>)}</select></label>
  <div className="tag-format-preview"><MetadataTags values={['Humor', 'Found Family']} appearance={draft} /></div>
  <p className="muted">Filled Chips uses the Additional Tags color for all tags. Other styles use category colors.</p>
  <TagOrderSettings appearance={appearance} disabled={linked} onChange={next=>onOrder(next.order!)} />
  <TagColorSettings appearance={draft} disabled={linked} onChange={next => setColors(next.colors)} />
  {!valid && <p role="alert">Enter colors as # followed by six hexadecimal digits.</p>}
  <button disabled={linked || !dirty || !valid} onClick={() => onColors(colors)}>Save Colors</button>
  {connected ? <label><input type="checkbox" checked={linked} onChange={event => onLink(event.target.checked)} />Sync Tag Format With Organizer</label> : <p className="muted">Connect the organizer to link tag settings. Your reader settings stay independent until you choose to link them.</p>}
  {linked && <p className="muted">The reader follows your organizer’s tag style, colors, and All Tags category order. Unlink to restore your independent reader format. {loaded ? 'Saved organizer settings are available offline.' : 'Waiting for organizer settings; your reader format is kept until they load.'}</p>}
  {error && <p role="alert">{error}</p>}
 </ReaderSection>
}
