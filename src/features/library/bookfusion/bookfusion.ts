import type { Metadata } from '../model'

export type BookFusionLink = NonNullable<Metadata['bookfusion_link']>

/** Keep bookmark destinations intact. Never infer a reader URL from an upload ID. */
export function validateBookFusionLink(value: BookFusionLink): BookFusionLink {
  const url = new URL(value.url.trim())
  if (url.protocol !== 'https:' || !['bookfusion.com', 'www.bookfusion.com'].includes(url.hostname) || url.username || url.password || url.port || url.pathname === '/') throw new Error('Enter an HTTPS BookFusion reader or content link.')
  if (!['book', 'bookmark'].includes(value.kind)) throw new Error('Choose a book or bookmark link.')
  if (value.kind === 'book' && (url.search || url.hash)) throw new Error('This link includes a query or location. Choose Bookmark to keep it, or paste a book-level link without a query or fragment.')
  return { url: url.href, kind: value.kind }
}

export function safeBookFusionLink(value: Metadata['bookfusion_link']): BookFusionLink | null {
  try { return value ? validateBookFusionLink(value) : null } catch { return null }
}
