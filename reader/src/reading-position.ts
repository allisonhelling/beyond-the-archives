import type { Preferences, ReadingPosition } from './model'

function view(viewport: HTMLElement, preferences: Preferences): NonNullable<ReadingPosition['viewport']> {
  return { font: preferences.font ?? 'default', lineHeight: preferences.lineHeight ?? 1.75, layout: preferences.layout, content: preferences.content, size: preferences.size, width: preferences.width, widthPx: viewport.clientWidth, heightPx: viewport.clientHeight, scrollHeight: viewport.scrollHeight, scrollWidth: viewport.scrollWidth, scrollTop: viewport.scrollTop, scrollLeft: viewport.scrollLeft }
}
function textRange(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode(), remaining = Math.max(0, offset)
  while (node && remaining >= (node.textContent?.length ?? 0)) { remaining -= node.textContent?.length ?? 0; node = walker.nextNode() }
  if (!node) return undefined
  const range = document.createRange()
  range.setStart(node, remaining); range.setEnd(node, Math.min(remaining + 1, node.textContent?.length ?? 0))
  return range
}
export function capturePosition(viewport: HTMLElement, preferences: Preferences, previous: ReadingPosition): ReadingPosition {
  const bounds = viewport.getBoundingClientRect(), pages = preferences.layout === 'pages'
  const toolbar = document.querySelector<HTMLElement>('.reader-toolbar')
  const headerInset = toolbar && getComputedStyle(toolbar).visibility !== 'hidden' ? Math.max(0, toolbar.getBoundingClientRect().bottom - bounds.top) : 0
  const topInset = Math.max(headerInset, parseFloat(getComputedStyle(viewport).paddingTop) || 0)
  const x = bounds.left + (pages ? 32 : Math.max(32, (viewport.clientWidth - preferences.width) / 2 + 32)), y = bounds.top + topInset + 35
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  // Display/Contents overlays must not become the caret anchor for the prose
  // underneath them. Visibility changes preserve the reading layout.
  const screen = viewport.closest('.reading-screen')
  const readCaret = () => {
    screen?.setAttribute('data-capturing-position', '')
    try {
      const caret = doc.caretRangeFromPoint?.(x, y)
      return { caret, alternative: !caret && doc.caretPositionFromPoint?.(x, y) }
    } finally { screen?.removeAttribute('data-capturing-position') }
  }
  const { caret, alternative } = readCaret()
  const node = caret?.startContainer ?? (alternative ? alternative.offsetNode : undefined), offset = caret?.startOffset ?? (alternative ? alternative.offset : 0)
  const element = node && (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)
  const content = element?.closest<HTMLElement>('[data-chapter-content]')
  const section = element?.closest<HTMLElement>('[data-chapter]') ?? [...viewport.querySelectorAll<HTMLElement>('[data-chapter]')].find(section => [...section.getClientRects()].some(rect => rect.right > bounds.left && rect.left < bounds.right && rect.bottom > y && rect.top < bounds.bottom))
  const snapshot = view(viewport, preferences)
  if (!content && section && viewport.contains(section)) {
    const title = section.querySelector('.chapter-navigation-title')
    // The chapter heading can occupy the hit-test point on its first page.
    // Do not carry a text anchor forward from a previously viewed later page.
    if (title && [...title.getClientRects()].some(rect => rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom)) return { chapter: section.dataset.chapter!, fraction: 0, viewport: snapshot }
  }
  if (!content || !section || !node || !viewport.contains(content)) return section?.dataset.chapter === previous.chapter ? { ...previous, viewport: snapshot } : section && viewport.contains(section) ? { chapter: section.dataset.chapter!, fraction: 0, viewport: snapshot } : { ...previous, viewport: snapshot }
  const prefix = document.createRange(); prefix.selectNodeContents(content); prefix.setEnd(node, offset)
  const textOffset = prefix.toString().length, length = content.textContent?.length ?? 0, range = textRange(content, textOffset)
  return { chapter: section.dataset.chapter!, fraction: Math.min(1, textOffset / Math.max(1, length)), textOffset, textTop: (range?.getBoundingClientRect().top ?? y) - bounds.top, viewport: snapshot }
}
export function restorePosition(viewport: HTMLElement, preferences: Preferences, position: ReadingPosition) {
  const section = [...viewport.querySelectorAll<HTMLElement>('[data-chapter]')].find(section => section.dataset.chapter === position.chapter)
  if (!section) return
  const content = section.querySelector<HTMLElement>('[data-chapter-content]')
  if (!content?.textContent) return
  const saved = position.viewport, next = view(viewport, preferences), bounds = viewport.getBoundingClientRect()
  if (saved && (saved.font ?? 'default') === next.font && (saved.lineHeight ?? 1.75) === next.lineHeight && saved.layout === next.layout && saved.content === next.content && saved.size === next.size && saved.width === next.width && saved.widthPx === next.widthPx && saved.heightPx === next.heightPx && saved.scrollHeight === next.scrollHeight && saved.scrollWidth === next.scrollWidth) {
    viewport.scrollTop = saved.scrollTop; viewport.scrollLeft = saved.scrollLeft; return
  }
  // Old records contain only a section-wide fraction. Keep that fallback until a new anchor is saved.
  const root = position.textOffset === undefined ? section : content
  const offset = position.textOffset ?? Math.round(position.fraction * Math.max(0, (root.textContent?.length ?? 0) - 1))
  const range = textRange(root, offset)
  if (!range) { viewport.scrollLeft = preferences.layout === 'pages' ? viewport.scrollWidth - viewport.clientWidth : 0; viewport.scrollTop = preferences.layout === 'pages' ? 0 : viewport.scrollHeight; return }
  const rect = range.getBoundingClientRect()
  if (preferences.layout === 'pages') viewport.scrollLeft = Math.floor((viewport.scrollLeft + rect.left - bounds.left) / viewport.clientWidth) * viewport.clientWidth
  else if (position.fraction === 0 && position.textOffset === undefined) viewport.scrollTop += section.getBoundingClientRect().top - bounds.top - (parseFloat(getComputedStyle(section.parentElement!).paddingTop) || 0)
  else viewport.scrollTop += rect.top - bounds.top - (position.textTop ?? 35)
}
