/** Probe painting/clipping without changing a transient tooltip's click-through behavior. */
export function isTooltipPaintedAt(node: HTMLElement | SVGElement, y?: number) {
 const value = node.style.getPropertyValue('pointer-events'), priority = node.style.getPropertyPriority('pointer-events')
 try {
  // Hit testing normally skips tooltips because they intentionally ignore pointer input.
  node.style.setProperty('pointer-events', 'auto', 'important')
  const bounds = node.getBoundingClientRect()
  return node.contains(node.ownerDocument.elementFromPoint(bounds.x + bounds.width / 2, y ?? bounds.y + bounds.height / 2))
 } finally {
  if (value) node.style.setProperty('pointer-events', value, priority)
  else node.style.removeProperty('pointer-events')
 }
}
