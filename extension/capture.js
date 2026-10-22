/** Serialized by chrome.scripting; keep this function self-contained. */
export async function captureMetadataPage(waitForReady = false, pageType = 'work') {
 if (location.origin !== 'https://archiveofourown.org') return null
 const navigation = pageType === 'navigation'
 if (navigation) {
  if (document.readyState !== 'complete' || !/^\/works\/[1-9]\d*\/navigate$/.test(location.pathname)) return null
  const index = document.querySelector('#main .chapter.index, #main ol.chapter, #main .chapter-index')
  if (!index) return null
  const clone = index.cloneNode(true)
  clone.querySelectorAll('script, style, iframe, input, button, textarea, img').forEach(node => node.remove())
  const html = clone.outerHTML
  return new TextEncoder().encode(html).byteLength <= 400_000 ? { url: location.href, html } : null
 }
 const series = pageType === 'series'
 if (series && (document.readyState !== 'complete' || !document.querySelector('.series.work.index') || !document.querySelector('dl.series.meta'))) return null
 if (waitForReady && !series) {
  // Finish parsing the document before trusting optional fields or chapter
  // navigation. This still avoids waiting for images and other load resources.
  const ready = () => document.readyState === 'complete' || document.readyState !== 'loading'
   && document.querySelector('h2.title')?.textContent.trim()
   && document.querySelector('h3.byline')?.textContent.trim()
   && ['fandom.tags', 'rating.tags', 'words', 'chapters'].every(field => document.querySelector(`dl.work.meta dd.${field}`)?.textContent.trim())
  if (!ready()) {
   const available = await new Promise(resolve => {
    const finish = value => {
     observer.disconnect()
     clearTimeout(timer)
     document.removeEventListener('DOMContentLoaded', check)
     document.removeEventListener('readystatechange', check)
     window.removeEventListener('pagehide', leave)
     resolve(value)
    }
    const check = () => { if (ready()) finish(true) }
    const leave = () => finish(false)
    const observer = new MutationObserver(check)
    const timer = setTimeout(() => finish(false), 8000)
    observer.observe(document, { childList: true, subtree: true, characterData: true })
    document.addEventListener('DOMContentLoaded', check)
    document.addEventListener('readystatechange', check)
    window.addEventListener('pagehide', leave, { once: true })
    check()
   })
   if (!available) return null
  }
 }
 if (location.origin !== 'https://archiveofourown.org' || !document.querySelector(series ? 'h2.heading' : 'h2.title')) return null
 const container = document.createElement('div')
 const selectors = series ? ['#main h2.heading', 'dl.series.meta', '.series.work.index', '.pagination', 'link[rel="canonical"]'] : ['h2.title', 'h3.byline', '.summary.module', 'dl.work.meta', '#selected_id', '.work.navigation', '.navigation.actions', 'link[rel="canonical"]']
 for (const selector of selectors) {
  for (const element of document.querySelectorAll(selector)) {
   const clone = element.cloneNode(true)
   clone.querySelectorAll('script, style, iframe, input, button, textarea, img, .notes, #chapters').forEach(node => node.remove())
   container.append(clone)
  }
 }
 const html = container.innerHTML
 return new TextEncoder().encode(html).byteLength <= (series ? 900_000 : 400_000) ? { url: location.href, html } : null
}
