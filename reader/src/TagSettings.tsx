import { Dialog } from '../../src/components/Dialog'
import { MetadataTags } from '../../src/features/library/MetadataTags'
import { tagShapes, type TagAppearance, type TagShape } from '../../src/features/library/display/display-settings'

export function TagSettings({ appearance, linked, connected, loaded, error, onShape, onLink, onClose }: { appearance: TagAppearance; linked: boolean; connected: boolean; loaded: boolean; error: string; onShape: (shape: TagShape) => void; onLink: (linked: boolean) => void; onClose: () => void }) {
 return <Dialog title="Tag Format" onClose={onClose}>
  <p>Choose how tags appear on your bookshelf, in work details, and below the filters.</p>
  <label>Tag Style<select aria-label="Tag Style" value={appearance.shape} disabled={linked} onChange={event => onShape(event.target.value as TagShape)}>{Object.entries(tagShapes).map(([shape, label]) => <option key={shape} value={shape}>{label}{shape === 'filled' ? ' (Reader Default)' : ''}</option>)}</select></label>
  <div className="tag-format-preview"><MetadataTags values={['Humor', 'Found Family']} appearance={appearance} /></div>
  {connected ? <label><input type="checkbox" checked={linked} onChange={event => onLink(event.target.checked)} />Sync Tag Format With Organizer</label> : <p className="muted">Connect the organizer to link tag settings. Your reader settings stay independent until you choose to link them.</p>}
  {linked && <p className="muted">The reader follows your organizer’s tag style and colors. Unlink to restore your independent reader format. {loaded ? 'Saved organizer settings are available offline.' : 'Waiting for organizer settings; your reader format is kept until they load.'}</p>}
  {error && <p role="alert">{error}</p>}
 </Dialog>
}
