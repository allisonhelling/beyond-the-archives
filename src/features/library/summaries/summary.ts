import { load, type CheerioAPI } from 'cheerio'

/** Preserve displayed paragraph and line breaks while storing plain text. */
export function plainText(element: ReturnType<CheerioAPI>) {
 const copy = element.clone()
 // HTML source whitespace is not a displayed break. Preserve the breaks supplied
 // by markup before storing plain text for the shared pre-wrap display.
 copy.find('script, style').remove()
 copy.find('*').addBack().contents().each((_, node) => {
  if (node.type === 'text') node.data = node.data.replace(/[\t\n\f\r ]+/g, ' ')
 })
 copy.find('br').replaceWith('\n')
 copy.find('p, div, blockquote, h1, h2, h3, h4, h5, h6, ul, ol, pre, hr').before('\n\n').after('\n\n')
 copy.find('li').before('\n').after('\n')
 return copy.text().replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Keep semantic AO3 formatting without importing page styles or active content.
const allowed = new Set(['div', 'p', 'br', 'em', 'strong', 'i', 'b', 'u', 's', 'strike', 'del', 'ins', 'blockquote', 'ul', 'ol', 'li', 'hr', 'sub', 'sup', 'code', 'pre', 'a', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'cite', 'q', 'abbr'])
export function readSummary(html: string, format: 'html' | 'text' | 'auto' = 'html') {
 const isText = format === 'text' || (format === 'auto' && !/<\/?[a-z][^>]*>/i.test(html))
 // XML serializers can emit <br></br>; HTML parsers treat the closing tag as another break.
 const $ = load(isText ? '' : html.replace(/<\/br\s*>/gi, ''), undefined, false)
 if (isText) {
  // Use the parser to escape literal text, then give stored newlines HTML breaks.
  $.root().text(html.trim().replace(/\r\n?/g, '\n'))
  $.root().html(($.root().html() ?? '').replaceAll('\n', '<br>'))
 }
 $('script, style, iframe, object, embed, svg, math, form, input, button, textarea, select, template, noscript').remove()
 const summary = plainText($.root())
 $('*').toArray().reverse().forEach(node => {
  if (!('tagName' in node)) return
  const element = $(node), tag = node.tagName.toLowerCase()
  if (!allowed.has(tag)) { element.replaceWith(element.contents()); return }
  const href = tag === 'a' ? element.attr('href') : undefined
  for (const attribute of Object.keys(node.attribs)) element.removeAttr(attribute)
  if (href) {
   try {
    const url = new URL(href, 'https://archiveofourown.org')
    if (['http:', 'https:'].includes(url.protocol)) element.attr({ href: url.href, target: '_blank', rel: 'noopener noreferrer' })
   } catch { /* Preserve the link text without an unsafe or invalid destination. */ }
  }
 })
 return { summary, summary_html: $.root().html() ?? '' }
}
