import { usePreviewViewports } from './useDisplayPreference'
import { useLayout, type DisplayLayout } from '../../../lib/use-layout'
import { ViewportFrame } from '../../../components/ViewportFrame'
import { ViewportSettings } from './ViewportSettings'
import type { PreviewViewport } from './display-settings'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { displaySettingsSection } from './settings-sections'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { MetadataTags } from '../MetadataTags'
import { CollectionColorPicker } from '../collections/CollectionColorPicker'
import { StoryCard, StoryDetailsPage } from '../LibraryPages'
import { SeriesCard } from '../series/SeriesCollection'
import { SeriesPage } from '../series/SeriesPage'
import { DisplayEditorContext, type DisplayField } from './display-editor-context'
import { exampleSeries, exampleWork } from './display-examples'
import { displayGroups, displayDivider, displayFieldLabel, tagShapes, type TagShape, displayLine, displayPreferences, moveDisplaySelection, deleteDisplaySelection, tagColors, type TagCategory, type TagAppearance, removeDisplayLine, separateDisplayField, saveDisplay, sameTagAppearance, subscribeDisplay, type DisplayGroup, type DisplayPreferences } from './display-settings'

const workTileGroups: DisplayGroup[] = ['workTile']
const seriesTileGroups: DisplayGroup[] = ['seriesTile']
const tileGroups = [...workTileGroups, ...seriesTileGroups]
const pageGroups = (kind: 'work' | 'series') => (Object.keys(displayGroups) as DisplayGroup[]).filter(group => group.startsWith(kind) && !tileGroups.includes(group))
const same = (a: DisplayField | null, b: DisplayField | null) => a?.group === b?.group && a?.field === b?.field
const label = (item: DisplayField) => displayFieldLabel(item.group, item.field)

function useDisplayDraft(groups: DisplayGroup[], editTags = false, layout: DisplayLayout = 'desktop') {
  const [baseline, setBaseline] = useState(() => displayPreferences(undefined, layout))
  const [draft, setDraft] = useState(baseline)
  const [version, setVersion] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dirty = groups.some(group => JSON.stringify(draft[group]) !== JSON.stringify(baseline[group])) || editTags && !sameTagAppearance(draft.tagAppearance, baseline.tagAppearance)
  const dirtyRef = useRef(dirty)
  useLayoutEffect(() => { dirtyRef.current = dirty }, [dirty])
  useEffect(() => {
    if (!editTags) return
    return subscribeDisplay(() => {
      if (dirtyRef.current) return
      const appearance = displayPreferences(undefined, layout).tagAppearance
      setBaseline(previous => ({ ...previous, tagAppearance: appearance }))
      setDraft(previous => ({ ...previous, tagAppearance: appearance }))
    })
  }, [editTags, layout])
  function change(next: DisplayPreferences) { setDraft(next); setMessage(''); setError('') }
  function cancel() { const saved = displayPreferences(undefined, layout); setBaseline(saved); setDraft(saved); setVersion(value => value + 1); setMessage('Changes discarded.'); setError('') }
  function commit(source: DisplayPreferences, message: string) {
    const next = displayPreferences(undefined, layout)
    for (const group of groups) next[group] = source[group]
    if (editTags) next.tagAppearance = source.tagAppearance
    saveDisplay(next, layout); setBaseline(next); setDraft(next); setMessage(message); setError('')
  }
  function restoreDefaults() {
    commit(displayPreferences('{}', layout), 'Default settings restored.')
    setVersion(value => value + 1)
  }
  function save() {
    if (editTags && Object.values(draft.tagAppearance.colors).some(color => !/^#[a-fA-F0-9]{6}$/.test(color))) { setError('Enter a tag color as # followed by six hexadecimal digits before saving.'); return false }
    try {
      commit(draft, 'Display settings saved.')
      return true
    } catch { setError('Could not save display settings. Check browser storage permissions and try again.'); return false }
  }
  return { draft, change, dirty, version, message, error, cancel, restoreDefaults, save }
}
type Draft = ReturnType<typeof useDisplayDraft>
function SaveControls({ state, onCancel, onSave }: { state: Draft; onCancel?: () => void; onSave?: () => void }) {
  const [confirmRestore, setConfirmRestore] = useState(false)
  return <><div className="display-save-bar"><div className="form-actions"><button className="button primary" type="button" disabled={!state.dirty} onClick={() => { if (state.save()) onSave?.() }}>Save</button><button className="button secondary" type="button" disabled={!onCancel && !state.dirty} onClick={() => { state.cancel(); onCancel?.() }}>Cancel</button><button className="button secondary" type="button" onClick={() => setConfirmRestore(true)}>Restore to Default</button></div><p role="status" className="field-help">{state.message || (state.dirty ? 'Unsaved changes' : 'No unsaved changes')}</p>{state.error && <p role="alert" className="error-message">{state.error}</p>}</div>{confirmRestore && <ConfirmationDialog title="Restore to Default?" confirmLabel="Restore to Default" pendingLabel="Restoring…" onClose={() => setConfirmRestore(false)} onConfirm={async () => state.restoreDefaults()}><p>Reset this editor to its original defaults? This immediately replaces all saved customizations and discards unsaved changes.</p></ConfirmationDialog>}</>
}

/** Adds editing behavior around the site's actual tiles and information pages. */
function DisplayEditor({ title, groups, state, children, showTitle = true, viewport }: { title: string; groups: DisplayGroup[]; state: Draft; children: ReactNode; showTitle?: boolean; viewport?: PreviewViewport }) {
  const [selection, setSelection] = useState<DisplayField[]>([])
  const selected = selection[0] ?? null
  const [managing, setManaging] = useState(false)
  const [target, setTarget] = useState<DisplayField | null>(null)
  const [lineGroup, setLineGroup] = useState<DisplayGroup>(groups[0])
  const [dragged, setDragged] = useState<DisplayField | null>(null)
  const drag = useRef<{ source: DisplayField; x: number; y: number; moved: boolean; shift: boolean; scrollX: number; scrollY: number; bounds: { field: DisplayField; rect: DOMRect }[] } | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  function fieldAt(element: EventTarget | null): DisplayField | null {
    const node = element && 'nodeType' in element ? (element as Element).closest<HTMLElement>('[data-display-field]') : null
    const group = node?.dataset.displayGroup as DisplayGroup | undefined
    return node && surface.current?.contains(node) && group && groups.includes(group) ? { group, field: node.dataset.displayField! } : null
  }
  function apply(fields: DisplayField[], operation: (preference: DisplayPreferences[DisplayGroup], fields: string[]) => DisplayPreferences[DisplayGroup], preserveSelection = false) {
    const next = { ...state.draft }
    for (const group of new Set(fields.map(field => field.group))) next[group] = operation(next[group], fields.filter(field => field.group === group).map(field => field.field))
    state.change(next); setSelection(current => preserveSelection ? current.length ? current : fields : [])
  }
  function remove(fields: DisplayField[]) { apply(fields, deleteDisplaySelection) }
  function move(source: DisplayField, destination: DisplayField, preserveSelection = false) {
    if (source.group !== destination.group || same(source, destination)) return
    const fields = selection.some(field => same(field, source)) ? selection.filter(field => field.group === destination.group) : [source]
    apply(fields, (preference, keys) => moveDisplaySelection(preference, keys, destination.field), preserveSelection)
  }
  function activate(field: DisplayField, shift = false) {
    setLineGroup(field.group)
    if (shift) setSelection(current => current.some(item => same(item, field)) ? current.filter(item => !same(item, field)) : [...current, field])
    else if (managing) setSelection([field])
    else if (selection.some(item => same(item, field))) setSelection(selection.length > 1 ? [field] : [])
    else if (selected && selected.group === field.group) move(selected, field)
    else setSelection([field])
  }
  function clearDrag() { drag.current = null; setTarget(null); setDragged(null) }
  function addEntry(kind: 'line' | 'divider' | 'short-divider') {
    const next = { ...state.draft }, areas = [...new Set(selection.length ? selection.map(field => field.group) : [lineGroup])]
    for (const group of areas) {
      let preference = next[group]
      const fields = selection.filter(field => field.group === group).map(field => field.field)
      const members = fields.flatMap(field => displayLine(field) ? preference.lines?.[field] ?? [] : displayDivider(field) ? [] : [field])
      const anchor = fields[0] ? (Object.keys(preference.lines ?? {}).find(line => preference.lines![line].includes(fields[0])) ?? fields[0]) : undefined
      const id = `${kind === 'short-divider' ? 'divider:short-' : `${kind}:`}${crypto.randomUUID()}`, order = [...preference.order]
      order.splice(anchor ? order.indexOf(anchor) + 1 : group === 'workTile' ? order.indexOf('progress') : order.length, 0, id)
      preference = { ...preference, order, ...(kind === 'line' && { lines: { ...preference.lines, [id]: [] } }) }
      if (kind === 'line') {
        for (const field of fields.filter(displayLine)) preference = removeDisplayLine(preference, field)
        preference = moveDisplaySelection(preference, [...new Set(members)], id)
      }
      next[group] = preference
    }
    state.change(next); setSelection([]); setManaging(false)
  }
  function toggle(field: DisplayField, shown: boolean) {
    const preference = state.draft[field.group]
    if (!shown) { setSelection([field]); surface.current?.focus({ preventScroll: true }); return }
    const parent = Object.keys(preference.lines ?? {}).find(line => preference.lines![line].includes(field.field))
    state.change({ ...state.draft, [field.group]: { ...preference, hidden: preference.hidden.filter(key => key !== field.field && key !== parent) } })
  }
  const managementSections = groups.map(group => ({ group, fields: [...Object.keys(displayGroups[group].fields), ...state.draft[group].order.filter(field => displayLine(field) || displayDivider(field))].map(field => ({ group, field })) }))
  const isHidden = (field: DisplayField) => state.draft[field.group].hidden.includes(field.field)
  const moving = dragged && !selection.some(field => same(field, dragged)) ? [dragged] : selection
  let dropPreview
  if (dragged && target && dragged.group === target.group) {
    const preference = state.draft[target.group]
    const selectedKeys = moving.filter(field => field.group === target.group).map(field => field.field)
    const fields = selectedKeys.filter(key => !Object.entries(preference.lines ?? {}).some(([line, members]) => selectedKeys.includes(line) && members.includes(key)))
    const projected = moveDisplaySelection(preference, fields, target.field)
    if (projected !== preference) dropPreview = { group: target.group, preference: projected, fields }
  }
  return <DisplayEditorContext value={{ preferences: state.draft, groups, selected: dragged ?? selected, selectedFields: moving, dropPreview }}><section className="display-editor" aria-label={`${title} Editor`}>
    <div className="display-editor-toolbar">{showTitle && <h3>{title}</h3>}<div className="form-actions display-editor-actions">
      <button className="button secondary" type="button" aria-expanded={managing} onClick={() => { setManaging(!managing); setSelection([]) }}>Hide/Show Information</button>
      <button className="button secondary" type="button" onClick={() => addEntry('line')}>Add Grouped Line</button>
      <button className="button secondary" type="button" onClick={() => addEntry('divider')}>Add Divider</button>
      <button className="button secondary" type="button" onClick={() => addEntry('short-divider')}>Add Short Divider</button>
    </div>
      {groups.length > 1 && <label className="display-group-area">Add Lines and Dividers To<select className="filter-input" value={selected?.group ?? lineGroup} onChange={event => { setLineGroup(event.target.value as DisplayGroup); setSelection([]) }}>{groups.map(group => <option key={group} value={group}>{displayGroups[group].title}</option>)}</select><span className="field-help">Choose the page area for new lines and dividers. Selected elements use their own area; information can move within that area.</span></label>}
      <p className="field-help" role="status">{selection.length > 1 ? `${selection.length} elements selected. Group, move, hide or delete them together.` : managing ? 'Add or hide information below, or select information in the preview and press Backspace to remove it. Shift-click to select multiple elements.' : selected ? `${label(selected)} selected. Shift-click to select more; click a destination to move. Delete hides information or removes lines and dividers.` : 'Drag information onto a grouped line or select a field and use Move to Own Line. Shift-click selects multiple elements. Save applies your changes.'}</p>
      {selected && <div className="form-actions" aria-label="Move Selected Information">
        <button className="button secondary" type="button" onClick={() => remove(selection)}>Hide/Delete Selected</button>
        {selection.some(item => Object.values(state.draft[item.group].lines ?? {}).some(fields => fields.includes(item.field))) && <button className="button secondary" type="button" onClick={() => apply(selection, (preference, fields) => [...fields].reverse().reduce((value, field) => separateDisplayField(value, field), preference))}>Move to Own Line</button>}
        {selection.some(item => displayLine(item.field)) && <button className="button secondary" type="button" onClick={() => apply(selection, (preference, fields) => fields.filter(displayLine).reduce((value, field) => removeDisplayLine(value, field), preference))}>Remove Grouped Line</button>}
        {[-1, 1].map(direction => {
          const preference = state.draft[selected.group]
          const order = (Object.values(preference.lines ?? {}).find(fields => fields.includes(selected.field)) ?? preference.order).filter(field => !preference.hidden.includes(field))
          const indices = selection.filter(field => field.group === selected.group).map(field => order.indexOf(field.field)).filter(index => index >= 0)
          const index = direction < 0 ? Math.min(...indices) : Math.max(...indices)
          const destination = order[index + direction]
          return <button key={direction} className="button secondary" type="button" disabled={!destination} aria-label={`Move ${selection.length > 1 ? 'Selected Elements' : label(selected)} ${direction < 0 ? 'Up' : 'Down'}`} onClick={() => { if (destination) move(selected, { group: selected.group, field: destination }, true) }}>{direction < 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}{direction < 0 ? 'Move Up' : 'Move Down'}</button>
        })}
      </div>}
      {managing && <div className="display-available">{[false, true].map(hidden => <section key={String(hidden)} aria-label={hidden ? 'Available Information' : 'Shown Information'}>
        <h4>{hidden ? 'Available Information' : 'Shown Information'}</h4>
        {managementSections.map(({ group, fields }) => {
          const items = fields.filter(field => isHidden(field) === hidden)
          return items.length > 0 && <details key={group} className="details-disclosure" open>
            <summary>{displayGroups[group].title}</summary>
            <ul>{items.map(item => <li key={item.field}><button className="button secondary" type="button" onClick={() => toggle(item, hidden)}>{hidden ? 'Add' : 'Select'} {label(item)}</button></li>)}</ul>
          </details>
        })}
      </section>)}</div>}

    </div>
      <ViewportFrame viewport={viewport} title={`${title} Viewport`} tile={groups.length === 1}><div ref={surface} tabIndex={-1} className="display-edit-surface" data-hide-information={managing} aria-label={`${title} Preview`} onMouseDownCapture={event => event.preventDefault()} onDragStartCapture={event => event.preventDefault()} onClickCapture={event => {
        event.preventDefault(); event.stopPropagation()
        const field = fieldAt(event.target)
        if (field) { activate(field, event.shiftKey); surface.current?.focus({ preventScroll: true }) }
      }} onChangeCapture={event => { event.preventDefault(); event.stopPropagation() }} onSubmitCapture={event => { event.preventDefault(); event.stopPropagation() }} onKeyDownCapture={event => {
        if (event.key === 'Escape') { clearDrag(); setSelection([]); setManaging(false); return }
        if (event.key === 'Delete' || event.key === 'Backspace') { if (selection.length) { event.preventDefault(); event.stopPropagation(); remove(selection) }; return }
        const field = fieldAt(event.target) ?? selected
        if (!field) return
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activate(field, event.shiftKey) }
        if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation()
          const preference = state.draft[field.group], order = (Object.values(preference.lines ?? {}).find(fields => fields.includes(field.field)) ?? preference.order).filter(key => !preference.hidden.includes(key))
          const destination = order[order.indexOf(field.field) + (event.key === 'ArrowUp' ? -1 : 1)]
          if (destination) move(field, { group: field.group, field: destination }, true)
        }
      }} onPointerDownCapture={event => {
        if (event.button !== 0 || !event.isPrimary) return
        const field = fieldAt(event.target)
        if (!field) return
        event.preventDefault(); event.stopPropagation()
        const bounds = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-display-field]')].reverse().flatMap(node => node.dataset.displayGroup === field.group ? [...node.getClientRects()].map(rect => ({ field: { group: field.group, field: node.dataset.displayField! }, rect })) : [])
        drag.current = { source: field, x: event.clientX, y: event.clientY, moved: false, shift: event.shiftKey, scrollX: window.scrollX, scrollY: window.scrollY, bounds }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerMove={event => {
        if (!drag.current) return
        if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 6) drag.current.moved = true
        if (drag.current.moved) {
          const x = event.clientX + window.scrollX - drag.current.scrollX, y = event.clientY + window.scrollY - drag.current.scrollY
          setDragged(drag.current.source)
          setTarget(drag.current.bounds.find(({ rect }) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)?.field ?? null)
        }
      }} onPointerUp={event => {
        const current = drag.current
        if (current?.moved) { if (target) move(current.source, target) }
        else if (current) activate(current.source, current.shift)
        clearDrag(); event.currentTarget.focus({ preventScroll: true })
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }} onPointerCancel={clearDrag} onLostPointerCapture={clearDrag}>{children}</div></ViewportFrame>
  </section></DisplayEditorContext>
}

function TagAppearanceSettings({ state }: { state: Draft }) {
  const [allColor, setAllColor] = useState<string>(tagColors.tags.color)
  const [undoColors, setUndoColors] = useState<TagAppearance['colors'] | null>(null)
  const appearance = state.draft.tagAppearance
  function change(next: TagAppearance) { state.change({ ...state.draft, tagAppearance: next }) }
  return <DisplayEditorContext value={{ preferences: state.draft, groups: [], selected: null }}><section className="display-tag-appearance" aria-label="Site-Wide Tag Appearance"><p className="field-help">Tag shape and colors apply throughout the site and sync with your organizer account. Save applies your changes. Linked EPUB readers follow these settings; unlinked readers keep their own format.</p>
    <fieldset className="display-tag-shapes settings-subsection"><legend>Tag Shape</legend><div className="display-tag-shape-options">{(Object.entries(tagShapes) as [TagShape, string][]).map(([shape, name]) => <button type="button" className="tag-shape-option" key={shape} aria-pressed={appearance.shape === shape} onClick={() => change({ ...appearance, shape })}><MetadataTags values={['Humor', 'Fluff']} shape={shape} /><span>{name}</span></button>)}</div></fieldset>
    <fieldset className="display-tag-colors settings-subsection"><legend>Tag Colors</legend><div className="display-tag-color-grid">{(Object.keys(tagColors) as TagCategory[]).map(category => <div key={category} role="group" aria-label={`${tagColors[category].label} Color`}><span className="field-help">{tagColors[category].label}:</span><CollectionColorPicker showHex value={appearance.colors[category] ?? tagColors[category].color} onChange={color => change({ ...appearance, colors: { ...appearance.colors, [category]: color } })} /><span className="display-tag-example"><span>Ex.</span><MetadataTags values={[tagColors[category].example]} category={category} /></span></div>)}</div>
      <div className="display-all-colors"><div role="group" aria-label="Change All Tags"><span className="field-help">Change All Tags:</span><CollectionColorPicker showHex value={allColor} onChange={setAllColor} /></div><button type="button" className="button secondary" disabled={!/^#[a-fA-F0-9]{6}$/.test(allColor)} onClick={() => { setUndoColors({ ...appearance.colors }); change({ ...appearance, colors: Object.fromEntries(Object.keys(tagColors).map(category => [category, allColor])) }) }}>Apply</button><button type="button" className="button secondary" disabled={!undoColors} onClick={() => { if (undoColors) { change({ ...appearance, colors: undoColors }); setUndoColors(null) } }}>Undo</button></div>
    </fieldset>
  </section></DisplayEditorContext>
}

function TileLayoutEditor({ kind, layout, appearance }: { kind: 'work' | 'series'; layout: DisplayLayout; appearance: TagAppearance }) {
 const groups = kind === 'work' ? workTileGroups : seriesTileGroups
 const state = useDisplayDraft(groups, false, layout)
 const sizes = usePreviewViewports()
 const title = `${kind === 'work' ? 'Work' : 'Series'} Tile`
 return <section className="display-device-editor" aria-label={`${layout === 'mobile' ? 'Mobile' : 'Desktop'} ${title} Layout`}>
  <h4>{layout === 'mobile' ? 'Mobile' : 'Desktop'} Layout</h4>
  <DisplayEditor key={state.version} title={title} showTitle={false} groups={groups} viewport={sizes[layout]} state={{ ...state, draft: { ...state.draft, tagAppearance: appearance } }}>{kind === 'work' ? <StoryCard story={exampleWork} /> : <SeriesCard series={exampleSeries} />}</DisplayEditor>
  <SaveControls state={state} />
 </section>
}
export function DisplaySettings() {
  const layout = useLayout()
  const tagState = useDisplayDraft([], true)
  const [expanded, setExpanded] = useState({ work: false, series: false, tags: false })
  return <section id={displaySettingsSection.id} tabIndex={-1} className="settings-card display-settings"><h2>{displaySettingsSection.title}</h2><p className="muted">Arrange your tiles directly in the previews. Mobile and desktop arrangements are saved separately. Save applies only to the layout you are editing. Tag appearance applies to both layouts.</p>
    <ViewportSettings />
    <fieldset className="display-tag-format-section settings-subsection" aria-labelledby="display-tag-format-title"><legend className="display-tile-heading"><h3 id="display-tag-format-title">Tag Format</h3><button type="button" className="button secondary" aria-expanded={expanded.tags} aria-controls="display-tag-format" onClick={() => setExpanded(current => ({ ...current, tags: !current.tags }))}>Edit Tag Format</button></legend>
    <div id="display-tag-format" hidden={!expanded.tags}><TagAppearanceSettings key={tagState.version} state={tagState} /><SaveControls state={tagState} /></div></fieldset>
    <div className="display-tile-previews">{(['work', 'series'] as const).map(kind => <fieldset key={kind} className="display-tile-section settings-subsection" aria-labelledby={`display-${kind}-title`}><legend className="display-tile-heading"><h3 id={`display-${kind}-title`}>{kind === 'work' ? 'Work' : 'Series'} Tile</h3><button type="button" className="button secondary" aria-expanded={expanded[kind]} aria-controls={`display-${kind}-editor`} onClick={() => setExpanded(current => ({ ...current, [kind]: !current[kind] }))}>Edit {kind === 'work' ? 'Work' : 'Series'} Tiles</button></legend><div id={`display-${kind}-editor`} hidden={!expanded[kind]}><div className="display-device-previews">{(layout === 'mobile' ? ['mobile'] as const : ['desktop', 'mobile'] as const).map(device => <TileLayoutEditor key={device} kind={kind} layout={device} appearance={tagState.draft.tagAppearance} />)}</div></div></fieldset>)}</div>
    <fieldset className="display-page-links settings-subsection" aria-labelledby="display-info-pages-title"><legend><h3 id="display-info-pages-title">Information Pages</h3></legend><div className="form-actions"><Link className="button secondary" to="/settings/example-work">Edit Work Info Page</Link><Link className="button secondary" to="/settings/example-series">Edit Series Info Page</Link></div><p className="muted">Open an example page and switch between mobile and desktop layouts.</p></fieldset>
  </section>
}
function ExampleLayoutEditor({ kind, layout, active }: { kind: 'work' | 'series'; layout: DisplayLayout; active: boolean }) {
 const state = useDisplayDraft(pageGroups(kind), false, layout), navigate = useNavigate(), sizes = usePreviewViewports()
 const title = `Example ${kind === 'work' ? 'Work' : 'Series'} Info Page`
 return <div hidden={!active}>
  <SaveControls state={state} onCancel={() => navigate('/settings#settings-display')} onSave={() => navigate('/settings#settings-display')} />
  <DisplayEditor key={`${kind}:${state.version}`} title={title} showTitle={false} groups={pageGroups(kind)} state={state} viewport={sizes[layout]}>{kind === 'work' ? <StoryDetailsPage example={exampleWork} /> : <SeriesPage example={exampleSeries} />}</DisplayEditor>
 </div>
}
export function DisplayExamplePage({ kind }: { kind: 'work' | 'series' }) {
 const device = useLayout(), [view, setView] = useState<DisplayLayout>(device)
 const layout = device === 'mobile' ? 'mobile' : view
 return <div className="display-example-page"><div className="page-heading"><h1>Example {kind === 'work' ? 'Work' : 'Series'} Info Page</h1></div>
  <div className="form-actions" role="group" aria-label="Information Page Preview Layout">{(device === 'mobile' ? ['mobile'] as const : ['desktop', 'mobile'] as const).map(option => <button key={option} className={`button ${layout === option ? 'primary' : 'secondary'}`} aria-pressed={layout === option} onClick={() => setView(option)}>{option === 'mobile' ? 'Mobile View' : 'Desktop View'}</button>)}</div>
  {(device === 'mobile' ? ['mobile'] as const : ['desktop', 'mobile'] as const).map(option => <ExampleLayoutEditor key={option} kind={kind} layout={option} active={layout === option} />)}
 </div>
}
