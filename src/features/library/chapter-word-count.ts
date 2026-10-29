/** Count prose locally, preserving inline words and excluding summaries and notes. */
export function chapterWordCount(body: Element | null): number | null {
  if (!body || typeof Intl.Segmenter !== 'function') return null
  const copy = body.cloneNode(true) as Element
  copy.querySelectorAll('script, style, noscript, iframe, .summary, .notes, .landmark, [hidden], [aria-hidden="true"]').forEach(node => node.remove())
  copy.querySelectorAll('p, div, li, blockquote, br, hr, h1, h2, h3, h4, h5, h6, td, tr').forEach(node => { node.before(' '); node.after(' ') })
  let count = 0
  for (const segment of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(copy.textContent ?? '')) if (segment.isWordLike) count++
  return count
}
