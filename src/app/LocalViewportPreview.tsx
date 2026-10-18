import { useState, type ReactNode } from 'react'
import './local-viewport-preview.css'

export function LocalViewportPreview({ children }: { children: ReactNode }) {
  const [view, setView] = useState<'browser' | 'desktop' | 'mobile'>('browser')
  // Keep the same frame mounted after entering preview so navigation, forms,
  // and scroll position survive subsequent viewport changes.
  const [source, setSource] = useState(() => window.location.href)
  function previewMobile() {
    if (view === 'browser') setSource(window.location.href)
    setView('mobile')
  }
  return <>
    <aside className="local-viewport-toolbar" aria-label="Local viewport preview">
      <strong>Local preview</strong>
      <div role="group" aria-label="Viewport">
        <button className={`button ${view === 'mobile' ? 'secondary' : 'primary'} compact`} aria-pressed={view !== 'mobile'} onClick={() => setView(view === 'browser' ? 'browser' : 'desktop')}>Desktop</button>
        <button className={`button ${view === 'mobile' ? 'primary' : 'secondary'} compact`} aria-pressed={view === 'mobile'} onClick={previewMobile}>Mobile · 390px</button>
      </div>
      <span className="muted">Entering mobile preview reloads the page. Save edits first.</span>
    </aside>
    {view === 'browser' ? children : <div className="local-viewport-stage" data-view={view}>
      <iframe className="local-viewport-frame" title="Local app viewport" src={source} />
    </div>}
  </>
}
