import { isCalendarDate } from '../../src/lib/dates.ts'
import type { AutomaticMetadata, RetrievalResult } from './adapter.ts'
const lists=['authors','fandoms','ao3_tags','relationship_tags','character_tags','additional_tags','archive_warnings','categories','series']
/** Keep only known, correctly typed values. Null/missing/invalid data never erases valid stored metadata. */
export function validateMetadata(result: RetrievalResult): RetrievalResult {
 if(!result.metadata) return result
 const input=result.metadata, output: AutomaticMetadata={}
 if (input.series_checked === true) { output.series_checked = true; output.series = []; output.series_memberships = [] }
 for(const field of ['title','summary','summary_html','language','rating','ao3_published_at','ao3_updated_at'] as const) { const value=input[field]; if(typeof value==='string' && value.length<=100000 && value.trim()) output[field]=value }
 if(output.rating && !['General Audiences','Teen And Up Audiences','Mature','Explicit','Not Rated'].includes(output.rating)) delete output.rating
 for(const field of ['ao3_published_at','ao3_updated_at'] as const) if(output[field] && Number.isNaN(Date.parse(output[field]!))) delete output[field]
 for(const field of lists) { const value=input[field as keyof AutomaticMetadata]; if(Array.isArray(value) && value.length && value.every(v=>typeof v==='string' && v.length<=10000)) Object.assign(output,{[field]:[...new Set(value as string[])]}) }
 for(const field of ['word_count','published_chapters','total_chapters','kudos','bookmark_count','comment_count','hits'] as const) { const value=input[field]; if(typeof value==='number' && Number.isInteger(value) && value>=(field==='total_chapters'?1:0) && value<=2147483647) output[field]=value }
 if(output.published_chapters!==undefined && output.total_chapters!==undefined && output.published_chapters>output.total_chapters) { delete output.published_chapters; delete output.total_chapters }
 if(typeof input.is_complete==='boolean' && output.published_chapters!==undefined) output.is_complete=input.is_complete
 if(input.author_links && typeof input.author_links==='object') output.author_links=Object.fromEntries(Object.entries(input.author_links).filter(([name,url])=>output.authors?.includes(name) && /^https:\/\/archiveofourown\.org\/users\/[^\s?#]+$/.test(url)))
 if(Array.isArray(input.series_memberships)) output.series_memberships=input.series_memberships.filter(s=>Number.isSafeInteger(s.id)&&s.id>0&&s.url===`https://archiveofourown.org/series/${s.id}`&&typeof s.name==='string'&&(s.position===null||Number.isInteger(s.position)&&s.position>0))
 if (input.chapter_dates && typeof input.chapter_dates === 'object' && !Array.isArray(input.chapter_dates)) output.chapter_dates = Object.fromEntries(Object.entries(input.chapter_dates).filter(([position, date]) => /^[1-9]\d*$/.test(position) && Number(position) <= (output.published_chapters ?? 0) && typeof date === 'string' && isCalendarDate(date)))
 if(!output.title) return {...result,metadata:null,chapters:{},category:'parser_failure',message:'The adapter did not provide a valid title.',retryable:false}
 const chapters=Object.fromEntries(Object.entries(result.chapters).filter(([position,id])=>/^[1-9]\d*$/.test(position)&&/^[1-9]\d*$/.test(id)&&Number(position)<=(output.published_chapters??0)))
 if(new Set(Object.values(chapters)).size!==Object.keys(chapters).length) return {...result,metadata:output,chapters:{},category:'partial',message:'Ambiguous chapter mapping was discarded.'}
 return {...result,metadata:output,chapters}
}
