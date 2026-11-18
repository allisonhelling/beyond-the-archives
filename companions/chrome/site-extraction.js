import { exactMappingUrl, fieldLimit, listStoryFields, mappingMatches, normalizedField, storyFields, tagObservationFields, validSelector } from '../../src/features/imports/site-mapping.ts'

const selectors = {
 title: '[itemprop="headline"], main h1, article h1, h1',
 authors: '[itemprop="author"] [itemprop="name"], a[rel="author"], [itemprop="author"]',
 fandoms: '[itemprop="isPartOf"] [itemprop="name"], [data-fandom], dd.fandom.tags a.tag',
 relationship_tags: '[data-relationship], dd.relationship.tags a.tag',
 character_tags: '[data-character], dd.character.tags a.tag',
 additional_tags: '[data-additional-tag], dd.freeform.tags a.tag',
 summary: '[itemprop="description"], [data-story-summary]',
 ao3_tags: '[itemprop="keywords"], a[rel="tag"]',
 categories: '[itemprop="genre"]',
 published_chapters: '[data-published-chapters], [itemprop="numberOfChapters"]',
 total_chapters: '[data-planned-chapters]',
 publication_status: '[data-publication-status], [itemprop="creativeWorkStatus"]',
}
const excluded = 'form, input, textarea, select, button, script, style, iframe, meta, link, template, object, embed, [contenteditable], [hidden], [aria-hidden=true], nav, footer'
export function selectable(element) {
 return Boolean(element?.matches && !element.matches('html, body') && !element.closest(excluded))
}
function elementText(element, field) {
 if (!selectable(element) || element.ownerDocument.defaultView && !element.getClientRects().length) return ''
 if (element.querySelector('form, input, textarea, select, [contenteditable], iframe')) return ''
 const text = element.innerText ?? element.textContent ?? ''
 return text.length <= fieldLimit(field) * 2 ? tagObservationFields.has(field) ? text : text.replace(/[^\S\n]+/g, ' ').trim() : ''
}
function strings(value) {
 if (Array.isArray(value)) return value.slice(0, 20).map(strings).filter(Boolean).join('\n')
 if (typeof value === 'string' || typeof value === 'number') return String(value)
 return typeof value?.name === 'string' ? value.name : ''
}
export function readSelected(doc, field, selector, strip) {
 if (!validSelector(selector)) return ''
 try {
  const matches = doc.querySelectorAll(selector)
  if (!matches.length || matches.length > 20) return ''
  if (matches.length > 1 && !listStoryFields.has(field)) return ''
  return normalizedField(field, [...matches].map(node => {
   const text = elementText(node, field)
   return strip && text.startsWith(strip) ? text.slice(strip.length) : text
  }).filter(Boolean).join('\n'))
 } catch { return '' }
}
export function extractStory(doc, url, rules) {
 const observations = {}, validations = []
 let storyEvidence = false
 const offer = (field, raw, via) => {
  const rawText = strings(raw)
  if (/<\/?[a-z][^>]*>/i.test(rawText)) return
  const text = normalizedField(field, rawText)
  if (text && !(field === 'publication_status' && text === 'deleted') && !observations[field]) observations[field] = {
   text, via, ...(tagObservationFields.has(field) && rawText !== text && rawText.length <= fieldLimit(field) && { rawText }),
  }
 }
 for (const node of [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0, 12)) {
  if (!node.textContent || node.textContent.length > 65536) continue
  try {
   const root = JSON.parse(node.textContent)
   for (const item of (Array.isArray(root) ? root : root?.['@graph'] ?? [root]).slice(0, 20)) {
    const types = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']]
    if (!types.some(type => ['Book', 'CreativeWork', 'Article', 'Chapter', 'ShortStory', 'Novel'].includes(type?.split?.('/').at(-1)))) continue
    if (item.headline || item.name) storyEvidence ||= types.some(type => ['Book', 'ShortStory', 'Novel'].includes(type?.split?.('/').at(-1)))
    for (const [field, data] of Object.entries({
     title: item.headline ?? item.name, authors: item.author, summary: item.description, fandoms: item.isPartOf?.name,
     ao3_tags: item.keywords, categories: item.genre, published_chapters: item.numberOfChapters, publication_status: item.creativeWorkStatus,
    })) offer(field, data, 'Structured Data')
   }
  } catch { /* Ignore invalid structured data. */ }
 }
 for (const [field, names] of Object.entries({ title: ['og:title', 'twitter:title'], authors: ['author'], summary: ['og:description', 'description'], ao3_tags: ['keywords'], categories: ['article:section'] })) {
  for (const name of names) offer(field, doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content, 'Page Metadata')
 }
 for (const field of Object.keys(storyFields)) {
  const values = [...doc.querySelectorAll(selectors[field])].slice(0, 20).map(node => elementText(node, field)).filter(text => text.trim())
  if (listStoryFields.has(field)) offer(field, [...new Set(values)], 'Page Element')
  else for (const value of values) offer(field, value, 'Page Element')
  if (field === 'published_chapters') for (const value of values.filter(value => value.includes('/'))) offer('total_chapters', value, 'Page Element')
 }
 offer('title', doc.title, 'Page Metadata')
 const applied = new Set()
 for (const rule of rules.filter(rule => mappingMatches(rule, url)).sort((left, right) => ['exact', 'matching', 'site'].indexOf(left.scope) - ['exact', 'matching', 'site'].indexOf(right.scope)
  || (right.prefix?.length ?? 0) - (left.prefix?.length ?? 0) || right.version - left.version)) {
  if (applied.has(rule.field)) continue
  applied.add(rule.field)
  const candidates = rule.selectors.map(selector => readSelected(doc, rule.field, selector, rule.strip))
  const current = candidates.find(Boolean) ?? ''
  const samePage = exactMappingUrl(rule.example) === exactMappingUrl(url)
  const health = !current ? 'Broken' : !candidates[0] || samePage && rule.previous && rule.previous !== current || rule.scope !== 'exact' && samePage && rule.validation.health !== 'Working' ? 'Needs Review' : 'Working'
  validations.push({ id: rule.id, field: rule.field, scope: rule.scope, prefix: rule.prefix, previous: rule.previous, version: rule.version, health, current, example: url, when: new Date().toISOString() })
  if (current && health === 'Working') observations[rule.field] = { text: current, via: 'Saved Mapping' }
 }
 return { observations, validations, storyEvidence }
}
export function selectorFor(doc, element) {
 if (!selectable(element)) return []
 const tag = element.localName
 const unique = selector => {
  if (!validSelector(selector)) return false
  try { const matches = doc.querySelectorAll(selector); return matches.length === 1 && matches[0] === element } catch { return false }
 }
 const semantic = ['itemprop', 'data-testid', 'data-role'].flatMap(attribute => {
  const value = element.getAttribute(attribute)
  return value && /^[\w-]{1,64}$/.test(value) ? [`${tag}[${attribute}="${value}"]`] : []
 })
 const safe = /^[a-zA-Z_][\w-]{0,63}$/
 const candidates = [...semantic, ...[...element.classList].filter(name => safe.test(name)).slice(0, 5).map(name => `${tag}.${name}`),
  ...(safe.test(element.id) ? [`#${element.id}`] : []), tag].filter(unique)
 if (candidates.length) return candidates.slice(0, 3)
 const path = []
 for (let node = element; selectable(node) && path.length < 7; node = node.parentElement) {
  const siblings = [...node.parentElement.children].filter(sibling => sibling.localName === node.localName)
  path.unshift(siblings.length === 1 ? node.localName : `${node.localName}:nth-of-type(${siblings.indexOf(node) + 1})`)
  const selector = path.join(' > ')
  if (unique(selector)) return [selector]
 }
 return []
}
