import { usePreviewViewports } from '../features/library/display/useDisplayPreference'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { ViewportSizeFields } from '../features/library/display/ViewportSettings'
import { savePreviewViewports, viewportLength } from '../features/library/display/display-settings'
import './local-viewport-preview.css'

export function LocalViewportPreview({ children }: { children: ReactNode }) {
  const [view, setView] = useState<'browser' | 'desktop' | 'mobile'>('browser')
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
      <div role="group" aria-label="Viewport">
        <button className={`button ${view === 'mobile' ? 'secondary' : 'primary'} compact`} aria-pressed={view !== 'mobile'} onClick={() => setView(view === 'browser' ? 'browser' : 'desktop')}>Desktop</button>
        <button className={`button ${view === 'mobile' ? 'primary' : 'secondary'} compact`} aria-pressed={view === 'mobile'} onClick={previewMobile}>Mobile · {viewportLength(sizes.mobile.width, 'in')} in / {viewportLength(sizes.mobile.width, 'mm')} mm</button>
      </div>
      <details><summary>Preview Size</summary><form className="story-form local-viewport-options" onSubmit={event => { event.preventDefault(); try { savePreviewViewports({ ...sizes, mobile: mobileSize }); setError('') } catch (failure) { setError((failure as Error).message) } }}><ViewportSizeFields value={mobileSize} onChange={setMobileSize} label="Mobile Preview Size" /><button className="button secondary">Apply Preview Size</button>{error && <p role="alert">{error}</p>}</form></details>
      <span className="muted">Entering mobile preview reloads the page. Save edits first.</span>
    </aside>
    {view === 'browser' ? children : <div className="local-viewport-stage" data-view={view} style={{ '--local-preview-width': `${sizes.mobile.width}px`, '--local-preview-height': `${sizes.mobile.height}px` } as CSSProperties}>
      <iframe className="local-viewport-frame" title="Local App Viewport" src={source} />
    </div>}
  </>
}
