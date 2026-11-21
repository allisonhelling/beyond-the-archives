import { useEffect, useState } from 'react'
import { FandomTagSettings, TagShapeSettings, TagTextColorControl } from '../../src/features/library/display/TagAppearanceControls'
import { TagOrderSettings } from '../../src/features/library/display/TagOrderSettings'
import { TagColorMode, TagColorSettings } from '../../src/features/library/display/TagColorSettings'
import { collectionColorPattern } from '../../src/features/library/collections/collection-colors'
import { ReaderSection } from './ReaderSettings'
import { tagTextColor, type TagTextColor, type TagAppearance, type TagShape } from '../../src/features/library/display/display-settings'

type TagColorDraft = Pick<TagAppearance, 'colors' | 'allColor' | 'colorMode' | 'fandom'>

export function TagSettings({asPage=false, appearance, linked, connected, loaded, error, onShape, onTextColor, onColors, onOrder, onLink, onClose }: {asPage?:boolean; appearance: TagAppearance; linked: boolean; connected: boolean; loaded: boolean; error: string; onShape: (shape: TagShape) => void; onTextColor: (color: TagTextColor) => void; onColors: (colors: TagColorDraft) => void; onOrder: (order: NonNullable<TagAppearance['order']>) => void; onLink: (linked: boolean) => void; onClose: () => void }) {
 const savedColors = JSON.stringify({ colors: appearance.colors, allColor: appearance.allColor, colorMode: appearance.colorMode, fandom: appearance.fandom })
 const [colors, setColors] = useState(() => JSON.parse(savedColors) as TagColorDraft)
 useEffect(() => setColors(JSON.parse(savedColors)), [savedColors])
 const valid = [...Object.values(colors.colors), ...(colors.fandom ? [colors.fandom.color] : []), ...(colors.allColor === undefined ? [] : [colors.allColor])].every(value => new RegExp(collectionColorPattern).test(value))
 const dirty = JSON.stringify(colors) !== savedColors
 const draft = { ...appearance, ...colors }
 const changeColors = ({ colors, allColor, colorMode, fandom }: TagAppearance) => setColors({ colors, allColor, colorMode, fandom })
 return <ReaderSection page={asPage} title="Tag Format" className="tag-format-dialog" onClose={onClose}>
  <p>Choose how tags appear on your bookshelf, in work details, and below the filters.</p>
  <TagShapeSettings appearance={draft} disabled={linked} onChange={onShape} />
  <div className="tag-color-modes"><TagColorMode appearance={draft} disabled={linked} onChange={changeColors} /><TagTextColorControl value={tagTextColor(appearance)} disabled={linked} onChange={onTextColor} /></div>
  <TagColorSettings appearance={draft} disabled={linked} onChange={changeColors} />
  <TagOrderSettings appearance={appearance} disabled={linked} onChange={next=>onOrder(next.order!)} />
  <FandomTagSettings value={draft.fandom} examples={['Example Fandom', 'Another Fandom']} disabled={linked} onChange={fandom => setColors(current => ({ ...current, fandom }))} />
  {!valid && <p role="alert">Enter colors as # followed by six hexadecimal digits.</p>}
  <button disabled={linked || !dirty || !valid} onClick={() => onColors(colors)}>Save Colors</button>
  {connected ? <label className="check-label"><input type="checkbox" checked={linked} onChange={event => onLink(event.target.checked)} />Sync Tag Format With Organizer</label> : <p className="muted">Connect the organizer to link tag settings. Your reader settings stay independent until you choose to link them.</p>}
  {linked && <p className="muted">The reader follows your organizer’s tag style, colors, and All Tags category order. Unlink to restore your independent reader format. {loaded ? 'Saved organizer settings are available offline.' : 'Waiting for organizer settings; your reader format is kept until they load.'}</p>}
  {error && <p className="tag-sync-error" role="alert">{error}</p>}
 </ReaderSection>
}
