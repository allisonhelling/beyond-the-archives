import { TabList } from '../components/TabList'
import { usePreviewViewports } from '../features/library/display/useDisplayPreference'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { ViewportSizeFields } from '../features/library/display/ViewportSettings'
import { savePreviewViewports, viewportLength, type ViewportUnit } from '../features/library/display/display-settings'
import './local-viewport-preview.css'

export function LocalViewportPreview({ children, unitsAfterDimensions = false }: { children: ReactNode; unitsAfterDimensions?: boolean }) {
  const [view, setView] = useState<'browser' | 'desktop' | 'mobile'>('browser')
  const [unit, setUnit] = useState<ViewportUnit>('in')
  const sizes = usePreviewViewports()
  const [mobileSize, setMobileSize] = useState(sizes.mobile), [error, setError] = useState('')
  // Keep the same frame mounted after entering preview so navigation, forms,
  // and scroll position survive subsequent viewport changes.
  const [source, setSource] = useState(() => window.location.href)
  function previewMobile() {
    if (view === 'browser') setSource(window.location.href)
    setView('mobile')
  }
  return <>
    <aside className="local-viewport-toolbar" aria-label="Local Viewport Preview">
      <strong>Local Preview</strong>
      <TabList tabs={[{ id: 'desktop', label: 'Desktop' }, { id: 'mobile', label: `Mobile · ${viewportLength(sizes.mobile.width, unit)} ${unit}` }]} active={view === 'mobile' ? 'mobile' : 'desktop'} onChange={next => { if (next === 'mobile') previewMobile(); else if (view !== 'browser') setView('desktop') }} label="Viewport" prefix="local-viewport" className="tab-bar compact-tab-bar" />
      <details><summary>Preview Size</summary><form className="story-form local-viewport-options" onSubmit={event => { event.preventDefault(); try { savePreviewViewports({ ...sizes, mobile: mobileSize }); setError('') } catch (failure) { setError((failure as Error).message) } }}><ViewportSizeFields unitsAfterDimensions={unitsAfterDimensions} unit={unit} onUnitChange={setUnit} value={mobileSize} onChange={setMobileSize} label="Mobile Preview Size" /><button className="button secondary">Apply Preview Size</button>{error && <p role="alert">{error}</p>}</form></details>
      <span className="muted">Entering mobile preview reloads the page. Save edits first.</span>
    </aside>
    {view === 'browser' ? <div className="local-viewport-browser" role="tabpanel" id="local-viewport-panel-desktop" aria-labelledby="local-viewport-tab-desktop">{children}</div> : <div className="local-viewport-stage" data-view={view} role="tabpanel" id={`local-viewport-panel-${view}`} aria-labelledby={`local-viewport-tab-${view}`} style={{ '--local-preview-width': `${sizes.mobile.width}px`, '--local-preview-height': `${sizes.mobile.height}px` } as CSSProperties}>
      <iframe className="local-viewport-frame" title="Local App Viewport" src={source} />
    </div>}
  </>
}
