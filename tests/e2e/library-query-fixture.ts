import { applyAutomaticCollections } from '../../src/features/library/automatic-collections'
import { effectiveMetadata, type Collection, type Story, type Work } from '../../src/features/library/model'
import { defaultReadingFilters, filterReading, inReadingSection, tracked } from '../../src/features/library/reading-search'
import { librarySeries, seriesReadingStatus, type SeriesRecord } from '../../src/features/library/series'
import { filterLibraryItems, seriesSearchStory } from '../../src/features/library/series-search'
type Row = Record<string, unknown>

// Transport fixtures reuse the client reference semantics. Actual SQL parity and
// RLS are independently checked in supabase/tests/library-query.test.ts.
export function libraryQueryFixture(name: string, body: Row, tables: Record<string, Row[]>) {
 const rows = (name: string) => tables[name] ?? []
 const stories = applyAutomaticCollections(rows('library_entries').map(entry => {
  const shared = rows('works').find(work => work.id === entry.work_id)
  if (!shared) return null
  const browser = entry.extension_metadata as Row ?? {}
  const work = { ...shared, ...Object.fromEntries(Object.entries(browser).filter(([key]) => ['title','summary','rating','word_count','published_chapters','total_chapters','is_complete','ao3_published_at','ao3_updated_at','last_metadata_check','last_metadata_success'].includes(key))), automatic_metadata: { ...shared.automatic_metadata as Row, ...browser }, verified_chapters: entry.extension_chapters && Object.keys(entry.extension_chapters).length ? entry.extension_chapters : shared.verified_chapters ?? {} } as Work
  const tags = rows('work_tags').filter(link => link.work_id === work.id).sort((a,b) => Number(a.source_position ?? Infinity)-Number(b.source_position ?? Infinity)).flatMap(link => rows('tags').filter(tag=>tag.id===link.tag_id))
  const related = (table:string, links:string, key:string) => rows(table).filter(item=>rows(links).some(link=>link.work_id===work.id&&link[key]===item.id)).sort((a,b)=>String(a.id).localeCompare(String(b.id)))
  return { ...entry, work, detailsLoaded:true, metadata:effectiveMetadata(work,entry.metadata_overrides as never,tags as never,related('authors','work_authors','author_id') as never,related('fandoms','work_fandoms','fandom_id') as never), collectionIds:rows('collection_works').filter(link=>link.library_entry_id===entry.id).map(link=>link.collection_id),personalTags:rows('library_entry_tags').filter(link=>link.library_entry_id===entry.id).map(link=>rows('personal_tags').find(tag=>tag.id===link.personal_tag_id)?.name??'') } as Story
 }).filter((story):story is Story=>story!==null), rows('collections') as unknown as Collection[])
 const records = rows('library_series').map(record=>({...record,collectionIds:rows('collection_series').filter(link=>link.library_series_id===record.id).map(link=>link.collection_id)})) as SeriesRecord[]
 if (name==='library_catalog') return {stories:stories.map(story=>({id:story.id,work_id:story.work_id,created_at:story.created_at,updated_at:story.updated_at,last_read_chapter:story.last_read_chapter,work:{id:story.work.id,ao3_work_id:story.work.ao3_work_id},reading_status:story.reading_status,is_favorite:story.is_favorite,collectionIds:story.collectionIds,automaticCollectionIds:story.automaticCollectionIds,metadata:{title:story.metadata.title,authors:story.metadata.authors,fandoms:story.metadata.fandoms,publication_status:story.metadata.publication_status,series:story.metadata.series,series_memberships:story.metadata.series_memberships}})),collections:rows('collections'),series:records}
 if (name==='library_story_details') return stories.filter(story=>(body.p_ids as string[]).includes(story.id))
 if (name==='query_library') {
  const query=body.p_query as Row,mode=query.mode,shelf=String(query.shelf),filters={...defaultReadingFilters,...query.filters as Row}
  const series=librarySeries(stories,records)
  const seriesItems=series.filter(series=>shelf==='series'||shelf==='favorites'&&series.record?.is_favorite||shelf==='currently_reading'&&seriesReadingStatus(series)==='reading'||['paused_reading','to_read','finished','did_not_finish'].includes(shelf)&&seriesReadingStatus(series)===shelf||series.record?.collectionIds?.includes(shelf))
  const works=stories.filter(story=>shelf==='all'||shelf==='currently_reading'&&['reading','waiting_for_updates','re_reading'].includes(story.reading_status)||shelf==='finished'&&['finished','re_reading'].includes(story.reading_status)||shelf==='favorites'&&story.is_favorite||story.reading_status===shelf||story.collectionIds.includes(shelf)||story.automaticCollectionIds?.includes(shelf))
  const pool=mode==='reading'?tracked(stories):[...works,...seriesItems.map(seriesSearchStory)]
  const filtered=mode==='reading'?filterReading(pool,filters):filterLibraryItems(pool,filters,seriesItems)
  const shown=filtered.filter(story=>mode!=='reading'||inReadingSection(story,shelf))
  const size=Number(body.p_size),pages=Math.max(1,Math.ceil(shown.length/size)),page=Math.min(Number(body.p_page),pages),slice=shown.slice((page-1)*size,page*size)
  const fandoms = new Map<string,number>();for(const s of pool) for(const name of new Set(s.metadata.fandoms)) fandoms.set(name,(fandoms.get(name)??0)+1)
  return {suggestions:{relationships:[...new Set(pool.flatMap(s=>s.metadata.relationship_tags??[]))],characters:[...new Set(pool.flatMap(s=>s.metadata.character_tags??[]))],tags:[...new Set(pool.flatMap(s=>s.metadata.additional_tags??[]))]},stories:slice,series:seriesItems.filter(series=>slice.some(story=>story.id===`series:${series.seriesId}`)),total:shown.length,pages,page,sections:Object.fromEntries(['complete','in_progress','new','re_reading','view_all','waiting','to_read','paused_reading'].map(key=>[key,filtered.filter(s=>inReadingSection(s,key)).length])),fandoms:[...fandoms].map(([name,count])=>({name,count}))}
 }
 if(name==='paged_import_history') {
  const batches=[...rows('import_batches')].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
  const batch=body.p_batch??batches[0]?.id,items=rows('import_items').filter(item=>item.batch_id===batch),jobs=rows('metadata_jobs').filter(job=>job.batch_id===batch)
  const status=body.p_status,filtered=items.filter(item=>status==='all'||item.status===status||status==='review'&&['failed','skipped','cancelled'].includes(String(item.status)))
  const page=Math.min(Number(body.p_result_page),Math.max(1,Math.ceil(filtered.length/50)))
  return {batches,items:filtered.slice((page-1)*50,page*50),jobs,changes:jobs,summary:{total:items.length,filtered:filtered.length,page,pages:Math.max(1,Math.ceil(filtered.length/50)),historyTotal:batches.length,historyPages:Math.max(1,Math.ceil(batches.length/25)),active:jobs.some(j=>['pending','processing'].includes(String(j.status)))||items.some(i=>['pending','processing'].includes(String(i.status))||['pending','processing'].includes(String(i.metadata_status))),counts:Object.fromEntries(['pending','processing','completed','failed','skipped','cancelled'].map(k=>[k,items.filter(i=>i.status===k).length])),imported:items.filter(i=>i.result==='imported'&&i.status==='completed').length,alreadySaved:items.filter(i=>i.result==='already_saved').length,completed:items.filter(i=>!['pending','processing'].includes(String(i.status))).length}}
 }
 return undefined
}
