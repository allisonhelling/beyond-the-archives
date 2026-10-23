/** Serialized by chrome.scripting; selectors ported from ao3_scraper/ao3_export.py. */
export function captureListingPage(kind) {
 if (location.origin !== 'https://archiveofourown.org' || document.readyState !== 'complete') return null
 const main = document.querySelector('#main')
 const classes = { bookmarks: ['bookmarks-index'], marked_for_later: ['readings-index'], works: ['works-index', 'works-search'], series: ['series-index'], series_works: ['series-show'] }
 const recognized = kind === 'collection_profile' ? main?.querySelector('.collection.profile') : classes[kind]?.some(name => main?.classList.contains(name))
 if (!recognized) {
  const pageText = `${document.title} ${main?.textContent ?? document.body?.textContent ?? ''}`
  if (/too many requests|rate[ -]?limit|retry[ -]?after|\b429\b/i.test(pageText)) return { attention: 'rate_limit', error: 'AO3 is limiting requests. Wait for the restriction to clear, then resume manually.' }
  if (/^\/users\/login/.test(location.pathname) || document.querySelector('input[name="user[login]"], form#new_user')) return { attention: 'login', error: 'AO3 sign-in is required. Sign in in the scan tab, then resume manually.' }
  return { attention: 'page_error', error: 'AO3 returned a login, restriction, error, or unexpected page. Check the scan tab, then resume manually.' }
 }
 const text = node => node?.textContent.trim().replace(/\s+/g, ' ') ?? ''
 const join = (node, selector) => [...node.querySelectorAll(selector)].map(text).filter(Boolean).join(', ')
 const lines = node => {
  if (!node) return ''
  const clone = node.cloneNode(true)
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
  clone.querySelectorAll('p, li').forEach(block => block.append('\n'))
  return clone.textContent.trim().replace(/\n{3,}/g, '\n\n')
 }
 if (kind === 'collection_profile') {
  const summary = main.querySelector('.primary.header > blockquote.userstuff, .summary .userstuff, blockquote.summary, .summary')
  const intro = main.querySelector('#intro .userstuff, .intro .userstuff') ?? main.querySelector('#intro, .intro')
  const name = text(main.querySelector('h2.heading')) || text(main.querySelector('h2'))
  if (!name) return { error: 'AO3 collection profile was not recognized.' }
  return { url: location.href, rows: [], skipped: 0, hasNext: false, collection: { name, description: [lines(summary), lines(intro)].filter(Boolean).join('\n\n') } }
 }
 const seriesUrls = []
 const rows = []
 let skipped = 0
 for (const item of main.querySelectorAll('li.work, li.bookmark, li.series')) {
  const title = item.querySelector('h4.heading > a')
  const link = title && new URL(title.getAttribute('href'), location.origin)
  if (link?.origin === location.origin && /^\/series\/[1-9]\d*$/.test(link.pathname)) { seriesUrls.push(link.origin + link.pathname); continue }
  // AO3 renders an explicit direct-child deletion message, with no work link.
  // Missing links alone can also mean hidden/restricted works and are not evidence.
  const deleted = kind === 'bookmarks' && (item.classList.contains('deleted') || /^this (?:work |item )?has been deleted[, .!]/i.test(text(item.querySelector(':scope > p.message'))))
  if (!deleted && (!link || link.origin !== location.origin || !/^\/works\/[1-9]\d*$/.test(link.pathname))) { skipped++; continue }
  const workLink = link?.origin === location.origin && /^\/works\/[1-9]\d*$/.test(link.pathname) ? link.origin + link.pathname : ''
  const row = { title: workLink ? text(title) : '', link: workLink, source_list: kind === 'bookmarks' ? kind : 'marked_for_later', work_status: deleted ? 'deleted' : 'available',
   author: join(item, 'h4.heading > a[rel="author"]'), fandoms: join(item, '.fandoms a'),
   category: text(item.querySelector('.required-tags .category')), relationships: join(item, '.tags .relationships > a'),
   characters: join(item, '.tags .characters > a'), freeforms: join(item, '.tags .freeforms > a'),
   rating: text(item.querySelector('.required-tags .rating .text')), warnings: join(item, '.tags .warnings a'),
   date: text(item.querySelector('.header > .datetime')), chapters: text(item.querySelector('dd.chapters')),
   recipient: join(item, 'h4.heading > a[href$="gifts"]'), summary: lines(item.querySelector('.summary')), summary_html: item.querySelector('.summary')?.innerHTML ?? '' }
  for (const field of ['words', 'comments', 'kudos', 'bookmarks', 'hits']) row[field] = text(item.querySelector(`dd.${field}`)).replace(/\D/g, '')
  if (kind === 'bookmarks') {
   const status = item.querySelector(':scope > .status')
   // AO3 replaces Rec icons with a lock/admin icon for private/hidden bookmarks.
   const rec = status?.querySelector('.rec') ? 'true' : status?.querySelector('.public') && !status.querySelector('.private, .hidden') ? 'false' : 'unknown'
   const id = item.id.match(/^bookmark_([1-9]\d*)$/)?.[1]
   if (!id) return { error: 'A bookmark has no stable ID. Scan stopped; saved pages are preserved.' }
   if (!row.link) row.link = `${location.origin}/bookmarks/${id}`
   Object.assign(row, { 'bookmark id': id, 'bookmark rec': rec, 'bookmark status': status?.querySelector('a:first-child > span')?.className ?? '',
    'bookmark tags': join(item, '.user .tags a.tag'), 'bookmark notes': lines(item.querySelector('.user .notes')),
    'bookmark user': text(item.querySelector('.user .byline > a')), 'bookmark date': text(item.querySelector('.user .datetime')),
    'bookmark url': `${location.origin}/bookmarks/${id}`, 'bookmark count': (item.querySelector('.status')?.title ?? '').replace(/\D/g, '') })
  }
  rows.push(row)
 }
 // Never interpret an error page or a missing list as a successfully empty library.
 if (!main.querySelector('ol.bookmark, ol.work, ul.bookmark, ul.work, ol.series, ul.series') && !/no (?:bookmarks|works|results|series)|haven.t marked any|no marked/i.test(main.textContent)) return { error: 'AO3 listing structure was not recognized. Scan stopped safely.' }
 const current = Number(new URL(location.href).searchParams.get('page') ?? 1)
 const pages = [...main.querySelectorAll('.pagination a')].map(a => Number(new URL(a.href).searchParams.get('page'))).filter(Number.isFinite)
 return { url: location.href, rows, seriesUrls, skipped, hasNext: pages.some(page => page > current) }
}

export function listingUrl(value, mode = 'full') {
 const url = new URL(value)
 if (url.origin !== 'https://archiveofourown.org' || url.username || url.password) throw new Error('Use an AO3 listing URL.')
 url.pathname = url.pathname.replace(/\/$/, '')
 const collection = url.pathname.match(/^\/collections\/([^/]+)(?:\/(works|bookmarks|profile))?$/)
 const user = /^\/users\/[^/]+(?:\/pseuds\/[^/]+)?\/(bookmarks|readings|works|series)$/.test(url.pathname)
 const other = /^\/(?:tags\/[^/]+|collections\/[^/]+)\/(works|bookmarks)$/.test(url.pathname) || /^\/works(?:\/search)?$/.test(url.pathname)
 if (!collection && !user && !other) throw new Error('Use an AO3 user or pseud Works, Series, Bookmarks, Marked for Later, tag listing, or collection URL.')
 const kind = (collection && !collection[2] || collection?.[2] === 'profile') ? 'collection' : url.pathname.endsWith('/bookmarks') ? 'bookmarks' : url.pathname.endsWith('/readings') ? 'marked_for_later' : url.pathname.endsWith('/series') ? 'series' : 'works'
 if (kind === 'marked_for_later' && url.searchParams.get('show') !== 'to-read') throw new Error('Marked for Later URLs must include ?show=to-read.')
 if (mode === 'quick' && (collection || !['bookmarks', 'marked_for_later'].includes(kind))) throw new Error('Use Full scan for works, series, and collections.')
 // Normalize to a complete, newest-first collection; filtered lists are not safe Quick Sync baselines.
 for (const key of [...url.searchParams.keys()]) if (mode === 'quick' && (key !== 'show' || kind !== 'marked_for_later') || key === 'page') throw new Error('Use the unfiltered list URL without page or sort parameters.')
 if (kind === 'bookmarks' && !url.search) { url.searchParams.set('bookmark_search[sort_column]', 'created_at'); url.searchParams.set('bookmark_search[sort_direction]', 'desc') }
 if (!['full', 'quick'].includes(mode)) throw new Error('Choose Full scan or Quick Sync.')
 url.hash = ''
 return { url: url.href, kind, ...(collection ? { collectionUrl: `${url.origin}/collections/${collection[1]}` } : {}) }
}
export function listingKey(row) { return row.source_list === 'bookmarks' ? row['bookmark id'] : row.link.match(/\/works\/(\d+)/)?.[1] }
