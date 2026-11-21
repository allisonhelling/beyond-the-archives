import { TextScalingControl } from '../../../components/TextScalingControl'
import { TabList } from '../../../components/TabList'
import { SummarySettings } from '../summaries/SummarySettings'
import { usePreviewViewports } from './useDisplayPreference'
import { LayoutWidthContext, useLayout, type DisplayLayout } from '../../../lib/use-layout'
import { DisplayEditor } from './DisplayEditor'
import { ViewportSettings } from './ViewportSettings'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { displaySettingsSection, displayTagFormatSection, displayTileAndPageSection, accessibilitySettingsSection } from './settings-sections'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TagOrderSettings } from './TagOrderSettings'
import { FandomTagSettings, TagShapeSettings, TagTextColorControl } from './TagAppearanceControls'
import { TagColorMode, TagColorSettings } from './TagColorSettings'
import { StoryCard, StoryDetailsPage } from '../LibraryPages'
import { SeriesCard } from '../series/SeriesCollection'
import { SeriesPage } from '../series/SeriesPage'
import { DisplayEditorContext } from './display-editor-context'
import { exampleSeries, exampleWork } from './display-examples'
import { defaultAllTagColor, defaultFandomAppearance, displayGroups, tagTextColor, displayPreferences, type TagAppearance, saveDisplay, sameTagAppearance, subscribeDisplay, type DisplayGroup, type DisplayPreferences } from './display-settings'

const layoutTabs = [{ id: 'desktop', label: 'Desktop' }, { id: 'mobile', label: 'Mobile' }] as const
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
    return subscribeDisplay(() => {
      if (dirtyRef.current) return
      const saved = displayPreferences(undefined, layout)
      setBaseline(saved); setDraft(saved)
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
    const defaults = displayPreferences('{}', layout)
    if (editTags) defaults.tagAppearance = { ...defaults.tagAppearance, colorMode: 'multi', allColor: defaultAllTagColor, fandom: defaultFandomAppearance }
    commit(defaults, 'Default settings restored.')
    setVersion(value => value + 1)
  }
  function save(applyBoth = false) {
    if (editTags && [...Object.values(draft.tagAppearance.colors), draft.tagAppearance.allColor ?? defaultAllTagColor, draft.tagAppearance.fandom?.color ?? defaultFandomAppearance.color].some(color => !/^#[a-fA-F0-9]{6}$/.test(color))) { setError('Enter a tag color as # followed by six hexadecimal digits before saving.'); return false }
    try {
      if (applyBoth) {
        const otherLayout = layout === 'mobile' ? 'desktop' : 'mobile'
        const other = displayPreferences(undefined, otherLayout)
        for (const group of groups) other[group] = draft[group]
        saveDisplay(other, otherLayout)
      }
      commit(draft, applyBoth ? 'Both layouts saved.' : 'Display settings saved.')
      return true
    } catch { setError('Could not save display settings. Check browser storage permissions and try again.'); return false }
  }
  return { draft, change, dirty, version, message, error, cancel, restoreDefaults, save }
}
type Draft = ReturnType<typeof useDisplayDraft>
function SaveControls({ state, onCancel, onSave, applyBoth = false }: { state: Draft; applyBoth?: boolean; onCancel?: () => void; onSave?: () => void }) {
  const [confirmRestore, setConfirmRestore] = useState(false)
  return <><div className="display-save-bar"><div className="form-actions"><button className="button primary" type="button" disabled={!state.dirty && !applyBoth} onClick={() => { if (state.save(applyBoth)) onSave?.() }}>Save</button><button className="button secondary" type="button" disabled={!onCancel && !state.dirty} onClick={() => { state.cancel(); onCancel?.() }}>Cancel</button><button className="button secondary" type="button" onClick={() => setConfirmRestore(true)}>Restore to Default</button></div><p role="status" className="field-help">{state.message || (state.dirty ? 'Unsaved changes' : 'No unsaved changes')}</p>{state.error && <p role="alert" className="error-message">{state.error}</p>}</div>{confirmRestore && <ConfirmationDialog title="Restore to Default?" confirmLabel="Restore to Default" pendingLabel="Restoring…" onClose={() => setConfirmRestore(false)} onConfirm={async () => state.restoreDefaults()}><p>Reset this editor to its original defaults? This immediately replaces all saved customizations and discards unsaved changes.</p></ConfirmationDialog>}</>
}


function TagAppearanceSettings({ state }: { state: Draft }) {
  const appearance = state.draft.tagAppearance
  function change(next: TagAppearance) { state.change({ ...state.draft, tagAppearance: next }) }
  return <DisplayEditorContext value={{ preferences: state.draft, groups: [], selected: null }}><section className="display-tag-appearance" aria-label="Site-Wide Tag Appearance"><p className="field-help">Tag shape, colors, and All Tags category order apply throughout the site and sync with your organizer account. Save applies your changes. Linked EPUB readers follow these settings; unlinked readers keep their own format.</p>
    <TagShapeSettings appearance={appearance} onChange={shape => change({ ...appearance, shape })} />
    <div className="tag-color-modes"><TagColorMode appearance={appearance} onChange={change} /><TagTextColorControl value={tagTextColor(appearance)} onChange={textColor => change({ ...appearance, textColor })} /></div>
    <TagColorSettings appearance={appearance} onChange={change} />
    <TagOrderSettings appearance={appearance} onChange={change} />
    <FandomTagSettings value={appearance.fandom} examples={exampleWork.metadata.fandoms} colorExample="Batman" onChange={fandom => change({ ...appearance, fandom })} />
  </section></DisplayEditorContext>
}

function TileLayoutEditor({ kind, layout, appearance, applyBoth, summaryVersion }: { applyBoth: boolean; summaryVersion: number; kind: 'work' | 'series'; layout: DisplayLayout; appearance: TagAppearance }) {
 const groups = kind === 'work' ? workTileGroups : seriesTileGroups
 const state = useDisplayDraft(groups, false, layout)
 const sizes = usePreviewViewports()
 const title = `${kind === 'work' ? 'Work' : 'Series'} Tile`
 return <section className="display-device-editor" aria-label={`${layout === 'mobile' ? 'Mobile' : 'Desktop'} ${title} Layout`}>
  <DisplayEditor key={state.version} title={title} showTitle={false} groups={groups} viewport={sizes[layout]} state={{ ...state, draft: { ...state.draft, tagAppearance: appearance } }}>{kind === 'work' ? <StoryCard key={summaryVersion} story={exampleWork} /> : <SeriesCard series={exampleSeries} />}</DisplayEditor>
  <SaveControls state={state} applyBoth={applyBoth} />
 </section>
}
export function DisplaySettings() {
  const layout = useLayout()
  const tagState = useDisplayDraft([], true)
  const [tileLayout, setTileLayout] = useState<DisplayLayout>(layout)
  const [expanded, setExpanded] = useState({ work: false, series: false })
  const [applyBoth, setApplyBoth] = useState({ work: false, series: false })
  const [summaryVersion, setSummaryVersion] = useState(0)
  return <div id={displaySettingsSection.id} tabIndex={-1} className="display-settings">
    <section id={accessibilitySettingsSection.id} tabIndex={-1} className="settings-card" aria-labelledby="text-scaling-title">
      <h2 id="text-scaling-title">{accessibilitySettingsSection.title}</h2>
      <TextScalingControl />
    </section>
    <section id={displayTagFormatSection.id} tabIndex={-1} className="display-tag-format-section settings-card" aria-labelledby="display-tag-format-title">
      <h2 id="display-tag-format-title">{displayTagFormatSection.title}</h2>
      <TagAppearanceSettings key={tagState.version} state={tagState} />
      <SaveControls state={tagState} />
    </section>
    <section id={displayTileAndPageSection.id} tabIndex={-1} className="settings-card" aria-labelledby="display-tile-and-page-title">
      <h2 id="display-tile-and-page-title">{displayTileAndPageSection.title}</h2>
      <p className="muted">Customize and arrange the work and series tiles directly in the previews.</p>
      <ViewportSettings />
      <div className="display-tile-previews">{(['work', 'series'] as const).map(kind => <fieldset key={kind} className="display-tile-section settings-subsection" aria-labelledby={`display-${kind}-title`}><legend className="display-tile-heading"><button type="button" className="disclosure-toggle" aria-expanded={expanded[kind]} aria-controls={`display-${kind}-editor`} onClick={() => setExpanded(current => ({ ...current, [kind]: !current[kind] }))}><span id={`display-${kind}-title`}>{kind === 'work' ? 'Work' : 'Series'} Tile</span></button></legend><div id={`display-${kind}-editor`} hidden={!expanded[kind]}><div className="display-layout-controls"><TabList tabs={layoutTabs} className="tab-bar compact-tab-bar" active={tileLayout} onChange={setTileLayout} label={`${kind === 'work' ? 'Work' : 'Series'} Tile Layout`} prefix={`tile-${kind}`} /><label className="check-label"><input type="checkbox" checked={applyBoth[kind]} onChange={event => setApplyBoth(current => ({ ...current, [kind]: event.target.checked }))} />Apply to Both Layouts</label></div>{kind === 'work' && <SummarySettings onApply={() => setSummaryVersion(value => value + 1)} />}<div className="display-device-previews">{(['desktop', 'mobile'] as const).map(device => <div key={device} role="tabpanel" id={`tile-${kind}-panel-${device}`} aria-labelledby={`tile-${kind}-tab-${device}`} hidden={tileLayout !== device}><TileLayoutEditor kind={kind} layout={device} appearance={tagState.draft.tagAppearance} applyBoth={applyBoth[kind]} summaryVersion={summaryVersion} /></div>)}</div></div></fieldset>)}</div>
    <fieldset className="display-page-links settings-subsection" aria-labelledby="display-info-pages-title"><legend><h3 id="display-info-pages-title">Information Pages</h3></legend><div className="form-actions"><Link className="button secondary" to="/settings/example-work">Edit Work Info Page</Link><Link className="button secondary" to="/settings/example-series">Edit Series Info Page</Link></div><p className="muted">Open an example page and switch between mobile and desktop layouts.</p></fieldset>
  </section></div>
}
function ExampleLayoutEditor({ kind, layout, active, hasTabs }: { kind: 'work' | 'series'; layout: DisplayLayout; active: boolean; hasTabs: boolean }) {
 const state = useDisplayDraft(pageGroups(kind), false, layout), navigate = useNavigate(), sizes = usePreviewViewports()
 const title = `Example ${kind === 'work' ? 'Work' : 'Series'} Info Page`
 const back = () => navigate('/settings#settings-display')
 return <div role="tabpanel" id={`info-layout-panel-${layout}`} aria-labelledby={hasTabs ? `info-layout-tab-${layout}` : undefined} aria-label={hasTabs ? undefined : title} hidden={!active}>
  <div className="page-heading display-example-heading"><h1>{title}</h1><SaveControls state={state} onCancel={back} onSave={back} /></div>
  <LayoutWidthContext value={layout === 'mobile' ? sizes.mobile.width : undefined}><div className="display-example-content" style={layout === 'mobile' ? { maxWidth: sizes.mobile.width } : undefined}>
   <DisplayEditor key={`${kind}:${state.version}`} title={title} showTitle={false} groups={pageGroups(kind)} state={state}>{kind === 'work' ? <StoryDetailsPage example={exampleWork} /> : <SeriesPage example={exampleSeries} />}</DisplayEditor>
  </div></LayoutWidthContext>
 </div>
}
export function DisplayExamplePage({ kind }: { kind: 'work' | 'series' }) {
 const device = useLayout(650), [view, setView] = useState<DisplayLayout>(device)
 const layout = device === 'mobile' ? 'mobile' : view
 return <div className="display-example-page">{device !== 'mobile' && <TabList tabs={layoutTabs} active={layout} onChange={setView} label="Information Page Preview Layout" prefix="info-layout" className="tab-bar compact-tab-bar" />}{(device === 'mobile' ? ['mobile'] as const : ['desktop', 'mobile'] as const).map(option => <ExampleLayoutEditor key={option} kind={kind} layout={option} active={layout === option} hasTabs={device !== 'mobile'} />)}</div>
}
