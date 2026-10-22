import type { CheerioAPI } from 'cheerio'

export type AutomaticMetadata = {
 chapter_dates?: Record<string, string>; title?: string; summary?: string; authors?: string[]; author_links?: Record<string,string>; fandoms?: string[];
 ao3_tags?: string[]; relationship_tags?: string[]; character_tags?: string[]; additional_tags?: string[]; archive_warnings?: string[]; categories?: string[];
 rating?: string; kudos?: number; word_count?: number; published_chapters?: number; total_chapters?: number; is_complete?: boolean;
 ao3_published_at?: string; ao3_updated_at?: string; series?: string[]; series_memberships?: { id: number; name: string; url: string; position: number | null }[];
}

function count(text: string) { const value = text.replaceAll(',', '').trim(); const n = Number(value); return /^\d+$/.test(value) && Number.isSafeInteger(n) && n <= 2147483647 ? n : undefined }
function date(text: string) { return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? `${text}T00:00:00Z` : undefined }

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

/** Shared extraction for website imports and the inline AO3 companion. */
export function extractWorkMetadata($: CheerioAPI, sourceUrl: string) {
 const metadata: AutomaticMetadata = { title: $('h2.title').first().text().trim() }
 const summary = $('.summary.module blockquote').first()
 if (summary.length) metadata.summary = plainText(summary)
 const authors = $('h3.byline a[rel="author"]')
 if (authors.length) { metadata.authors=[]; metadata.author_links={}; authors.each((_, node) => { const name=$(node).text().trim(); if (!name) return; metadata.authors!.push(name); try { const u=new URL($(node).attr('href')!,sourceUrl); if (u.origin==='https://archiveofourown.org' && /^\/users\//.test(u.pathname)) metadata.author_links![name]=u.href } catch { /* Name is still useful. */ } }) }
 const groups = { fandoms:'fandom', relationship_tags:'relationship', character_tags:'character', additional_tags:'freeform', archive_warnings:'warning', categories:'category' } as const
 for (const [field, css] of Object.entries(groups)) { const section=$(`dd.${css}.tags`); if (section.length) Object.assign(metadata,{[field]:section.find('a.tag').toArray().map(node=>$(node).text().trim()).filter(Boolean)}) }
 const tags = Object.keys(groups).filter(k=>k!=='fandoms').flatMap(k=>metadata[k as keyof AutomaticMetadata] as string[] ?? [])
 if (tags.length) metadata.ao3_tags=[...new Set(tags)]
 const rating=$('dd.rating.tags a.tag').first().text().trim(); if (rating) metadata.rating=rating
 const words=count($('dd.words').first().text()); if(words!==undefined) metadata.word_count=words
 const kudos=count($('dd.kudos').first().text()); if(kudos!==undefined) metadata.kudos=kudos
 const chapterText=$('dd.chapters').first().text().trim().match(/^(\d+)\s*\/\s*(\d+|\?)$/)
 if (chapterText) { metadata.published_chapters=count(chapterText[1]); if(chapterText[2]!=='?') metadata.total_chapters=count(chapterText[2]); if(metadata.total_chapters) metadata.is_complete=metadata.published_chapters===metadata.total_chapters; else metadata.is_complete=false }
 const published=date($('dd.published').first().text().trim()), updated=date($('dd.status').first().text().trim())
 if(published) metadata.ao3_published_at=published
 if(updated) metadata.ao3_updated_at=updated
 const memberships: NonNullable<AutomaticMetadata['series_memberships']>=[]
 $('dd.series .position').each((_,node)=>{ const link=$(node).find('a[href*="/series/"]').first(); const m=link.attr('href')?.match(/^\/series\/([1-9]\d*)$/); const position=$(node).text().match(/Part\s+(\d+)\s+of/i); if(m && Number.isSafeInteger(Number(m[1]))) memberships.push({id:Number(m[1]),name:link.text().trim(),url:`https://archiveofourown.org/series/${m[1]}`,position:position?count(position[1])??null:null}) })
 if(memberships.length) { metadata.series_memberships=memberships; metadata.series=memberships.map(s=>s.name) }
 const chapters: Record<string,string>={}
 // Only explicit numbered options verify position. Never use chapter IDs or DOM index as chapter numbers.
 $('#selected_id option').each((_,node)=>{ const id=$(node).attr('value'), label=$(node).text().match(/^\s*(\d+)\./); if(id && /^[1-9]\d*$/.test(id) && label && Number(label[1])>0 && metadata.published_chapters && Number(label[1])<=metadata.published_chapters) chapters[label[1]]=id })
 return { metadata, chapters }
}
