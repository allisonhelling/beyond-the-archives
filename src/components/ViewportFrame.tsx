import { LayoutWidthContext } from '../lib/use-layout'
import { createPortal } from 'react-dom'
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PreviewViewport } from '../features/library/display/display-settings'

/** A real viewport uses the existing media queries and React editor context. */
export function ViewportFrame({ viewport, title, tile = false, children }: { viewport?: PreviewViewport; title: string; tile?: boolean; children: ReactNode }) {
 return viewport ? <Frame viewport={viewport} title={title} tile={tile}>{children}</Frame> : <>{children}</>
}
function Frame({ viewport, title, tile, children }: { viewport: PreviewViewport; title: string; tile: boolean; children: ReactNode }) {
 const container = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null)
 const [root, setRoot] = useState<HTMLElement | null>(null)
 const [bounds, setBounds] = useState({ width: viewport.width, height: viewport.height, x: 0, y: 0, available: viewport.width, availableHeight: viewport.height })
 useLayoutEffect(() => {
  if (!root || !container.current) return
  const doc = root.ownerDocument
  const copyStyles = () => {
   doc.head.querySelectorAll('[data-preview-style]').forEach(node => node.remove())
   document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => { const copy = node.cloneNode(true) as HTMLElement; copy.dataset.previewStyle = ''; doc.head.append(copy) })
  }
  copyStyles()
  const styles = new MutationObserver(copyStyles); styles.observe(document.head, { childList: true, subtree: true, characterData: true })
  const measure = () => {
   const surface = root.querySelector<HTMLElement>('.display-edit-surface')
   const rect = tile ? surface?.getBoundingClientRect() : undefined
   setBounds({ width: rect?.width || viewport.width, height: rect?.height || viewport.height, x: rect?.left ?? 0, y: rect?.top ?? 0, available: container.current?.clientWidth || viewport.width, availableHeight: Math.max(160, window.innerHeight - (container.current?.getBoundingClientRect().top ?? 0) - 24) })
  }
  const observer = new ResizeObserver(measure); observer.observe(container.current); observer.observe(root)
  if (tile && root.querySelector('.display-edit-surface')) observer.observe(root.querySelector('.display-edit-surface')!)
  window.addEventListener('resize', measure)
  measure()
  return () => { window.removeEventListener('resize', measure); styles.disconnect(); observer.disconnect() }
 }, [root, tile, viewport.width, viewport.height])
 const scale = Math.min(1, bounds.available / bounds.width, bounds.availableHeight / bounds.height)
 const variables = { '--preview-width': `${viewport.width}px`, '--preview-height': `${tile ? Math.max(viewport.height, bounds.height + bounds.y + 40) : viewport.height}px`, '--preview-scale': scale, '--preview-offset-x': `${-bounds.x}px`, '--preview-offset-y': `${-bounds.y}px`, '--preview-crop-width': `${bounds.width}px`, '--preview-crop-height': `${bounds.height * scale}px` } as CSSProperties
 return <div ref={container} className="viewport-preview" style={variables}>
  <div className="viewport-preview-crop"><iframe ref={frame} title={title} className="viewport-preview-frame" srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head><body><main class='app-main'></main></body></html>" onLoad={() => { const doc = frame.current?.contentDocument; if (doc) { doc.body.className = 'viewport-preview-document'; setRoot(doc.querySelector('main')) } }} /></div>
  {root && createPortal(<LayoutWidthContext value={viewport.width}>{tile ? <div className="story-grid">{children}</div> : children}</LayoutWidthContext>, root)}
 </div>
}
