import { SummarySettings } from '../summaries/SummarySettings'
import { usePreviewViewports } from './useDisplayPreference'
import { useLayout, type DisplayLayout } from '../../../lib/use-layout'
import { DisplayEditor } from './DisplayEditor'
import { ViewportSettings } from './ViewportSettings'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { displaySettingsSection } from './settings-sections'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MetadataTags } from '../MetadataTags'
import { TagOrderSettings } from './TagOrderSettings'
import { TagColorSettings } from './TagColorSettings'
import { StoryCard, StoryDetailsPage } from '../LibraryPages'
import { SeriesCard } from '../series/SeriesCollection'
import { SeriesPage } from '../series/SeriesPage'
import { DisplayEditorContext } from './display-editor-context'
import { exampleSeries, exampleWork } from './display-examples'
import { displayGroups, tagShapes, type TagShape, displayPreferences, type TagAppearance, saveDisplay, sameTagAppearance, subscribeDisplay, type DisplayGroup, type DisplayPreferences } from './display-settings'

const workTileGroups: DisplayGroup[] = ['workTile']
const seriesTileGroups: DisplayGroup[] = ['seriesTile']
const tileGroups = [...workTileGroups, ...seriesTileGroups]
const pageGroups = (kind: 'work' | 'series') => (Object.keys(displayGroups) as DisplayGroup[]).filter(group => group.startsWith(kind) && !tileGroups.includes(group))

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


function TagAppearanceSettings({ state }: { state: Draft }) {
  const appearance = state.draft.tagAppearance
  function change(next: TagAppearance) { state.change({ ...state.draft, tagAppearance: next }) }
  return <DisplayEditorContext value={{ preferences: state.draft, groups: [], selected: null }}><section className="display-tag-appearance" aria-label="Site-Wide Tag Appearance"><p className="field-help">Tag shape, colors, and All Tags category order apply throughout the site and sync with your organizer account. Save applies your changes. Linked EPUB readers follow these settings; unlinked readers keep their own format.</p>
    <fieldset className="display-tag-shapes settings-subsection"><legend>Tag Shape</legend><p className="field-help">Filled Chips uses one Additional Tags color for all tags. Other styles use category colors.</p><div className="display-tag-shape-options">{(Object.entries(tagShapes) as [TagShape, string][]).map(([shape, name]) => <button type="button" className="tag-shape-option" key={shape} aria-pressed={appearance.shape === shape} onClick={() => change({ ...appearance, shape })}><MetadataTags values={['Humor', 'Fluff']} shape={shape} /><span>{name}</span></button>)}</div></fieldset>
    <TagOrderSettings appearance={appearance} onChange={change} />
    <TagColorSettings appearance={appearance} onChange={change} />
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
    <ViewportSettings /><SummarySettings />
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
