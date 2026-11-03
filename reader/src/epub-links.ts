const brackets: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/** Make plain web URLs clickable without changing EPUB text or existing links. */
export function linkEpubUrls(root: HTMLElement) {
  const doc = root.ownerDocument, walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('a')) nodes.push(node as Text)
  }
  for (const node of nodes) {
    const fragment = doc.createDocumentFragment()
    let end = 0
    for (const match of node.data.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)) {
      let label = match[0]
      // Keep balanced URL parentheses, but leave prose punctuation outside.
      while (label) {
        const last = label.at(-1)!, open = brackets[last]
        if (/[.,;:!?]/.test(last) || open && label.split(last).length > label.split(open).length) label = label.slice(0, -1)
        else break
      }
      let url: URL
      try { url = new URL(/^www\./i.test(label) ? `https://${label}` : label) } catch { continue }
      if (!['http:', 'https:'].includes(url.protocol)) continue
      const anchor = doc.createElement('a')
      anchor.href = url.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = label
      fragment.append(doc.createTextNode(node.data.slice(end, match.index)), anchor)
      end = match.index + label.length
    }
    if (end) { fragment.append(doc.createTextNode(node.data.slice(end))); node.replaceWith(fragment) }
  }
}
