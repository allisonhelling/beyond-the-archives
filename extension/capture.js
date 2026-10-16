/** Serialized by chrome.scripting; keep this function self-contained. */
export function captureMetadataPage() {
 if (location.origin !== 'https://archiveofourown.org' || !document.querySelector('h2.title')) return null
 const container = document.createElement('div')
 const selectors = ['h2.title', 'h3.byline', '.summary.module', 'dl.work.meta', '#selected_id', '.work.navigation', '.navigation.actions', 'link[rel="canonical"]']
 for (const selector of selectors) {
  for (const element of document.querySelectorAll(selector)) {
   const clone = element.cloneNode(true)
   clone.querySelectorAll('script, style, iframe, input, button, textarea, img, .notes, #chapters').forEach(node => node.remove())
   container.append(clone)
  }
 }
 const html = container.innerHTML
 return new TextEncoder().encode(html).byteLength <= 400_000 ? { url: location.href, html } : null
}
