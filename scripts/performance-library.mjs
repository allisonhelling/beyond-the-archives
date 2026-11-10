import { createTestDatabase } from './test-database.mjs'
import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'

// Synthetic data only. This never contacts AO3 or a hosted database.
export async function seedLargeLibraries(db, count = 10000, users = 3, finishedWorks = 0) {
  // Bulk fixture setup measures reads separately from import write throughput.
  const sources = ['library_entries','collection_works','library_entry_tags','works','work_authors','work_fandoms','work_tags','authors','fandoms','tags','personal_tags']
  for (const table of sources) await db.exec(`alter table public.${table} disable trigger sync_library_search`)
  await db.exec(`
    insert into auth.users select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,${users}) n;
    insert into public.works(ao3_work_id,title,summary,rating,published_chapters,total_chapters,is_complete,ao3_updated_at)
    select n,'Story '||lpad(n::text,6,'0'),repeat('A long summary about friendship, adventure and finding home. ',5+n%25),
    (array['Explicit','Mature','Teen And Up Audiences'])[n%3+1],10,20,false,'2026-10-01'::timestamptz+n%20*interval '1 day' from generate_series(1,${count}) n;
    insert into public.authors(ao3_username,name) select 'author-'||n,'Author '||n from generate_series(1,${Math.ceil(count / 2)}) n;
    insert into public.work_authors select w.id,a.id from public.works w join public.authors a on a.ao3_username='author-'||(1+w.ao3_work_id%${Math.ceil(count / 2)});
    insert into public.fandoms(name) select 'Fandom '||n from generate_series(1,100) n;
    insert into public.work_fandoms select w.id,f.id from public.works w join public.fandoms f on f.name='Fandom '||(1+w.ao3_work_id%100);
    insert into public.tags(name,category) select 'Tag '||n,'freeform' from generate_series(1,500) n;
    insert into public.work_tags(work_id,tag_id,source_position) select w.id,t.id,k from public.works w cross join generate_series(1,12) k join public.tags t on t.name='Tag '||(1+(w.ao3_work_id+k)%500);
    update public.works set automatic_metadata=jsonb_build_object('series',jsonb_build_array('Series '||((ao3_work_id-1)/50+1)),
     'series_memberships',jsonb_build_array(jsonb_build_object('id',(ao3_work_id-1)/50+1,'name','Series '||((ao3_work_id-1)/50+1),'url','https://archiveofourown.org/series/'||((ao3_work_id-1)/50+1),'position',(ao3_work_id-1)%50/10+1))) where ao3_work_id%10=0;
    insert into public.library_series(user_id,ao3_series_id,metadata,is_favorite)
    select u.id,sid,jsonb_build_object('seriesId',sid,'normalizedUrl','https://archiveofourown.org/series/'||sid,'title','Series '||sid,'description','A series description','creators',jsonb_build_array('Series creator'),'complete',false,'works',works),sid%3=0 from auth.users u cross join
    (select (ao3_work_id-1)/50+1 sid,jsonb_agg(jsonb_build_object('workId',ao3_work_id,'url','https://archiveofourown.org/works/'||ao3_work_id,'position',(ao3_work_id-1)%50/10+1,'title',title,'authors',jsonb_build_array('Preview author'),'fandoms',jsonb_build_array('Fandom '||(1+ao3_work_id%100)),'summary',summary,'tags',jsonb_build_array('Preview tag'),'chapters','10/20','complete',false,'wordCount',1000) order by ao3_work_id) works from public.works where ao3_work_id%10=0 group by (ao3_work_id-1)/50+1) series;
    insert into public.library_entries(user_id,work_id,original_url,reading_status,metadata_overrides,notes)
    select u.id,w.id,'https://archiveofourown.org/works/'||w.ao3_work_id,
    case when w.ao3_work_id<=${finishedWorks} then 'finished'::public.reading_status
     when w.ao3_work_id%3=0 then 'reading'::public.reading_status else 'to_read'::public.reading_status end,
    case when w.ao3_work_id%11=0 then jsonb_build_object('title','Private title '||w.ao3_work_id,'additional_tags',jsonb_build_array('Private tag')) else '{}'::jsonb end,
    'Private notes for '||u.id||' on work '||w.ao3_work_id from auth.users u cross join public.works w;
    insert into public.collections(user_id,name) select u.id,'Collection '||n from auth.users u cross join generate_series(1,20) n;
    insert into public.collection_works(user_id,library_entry_id,collection_id)
    select e.user_id,e.id,c.id from public.library_entries e join public.works w on w.id=e.work_id join public.collections c on c.user_id=e.user_id and c.name='Collection '||(1+w.ao3_work_id%20);
    insert into public.library_search_documents(id,user_id,work_id,story) select id,user_id,work_id,story from public.library_story_documents;
    analyze;
  `)
  for (const table of sources) await db.exec(`alter table public.${table} enable trigger sync_library_search`)
}
async function main() {
  const db = await createTestDatabase()
  try {
    const workCount = Number(process.env.PERF_WORKS ?? 10000)
    const finishedWorks = Math.min(Math.floor(workCount / 2), 3038)
    await seedLargeLibraries(db, workCount, 3, finishedWorks)
    await db.exec("set role authenticated; set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'")
    const results = []
    const collection=(await db.query("select id from public.collections where name='Collection 1' and user_id=auth.uid()")).rows[0].id
    let offsetIds
    for (const [label, sql, args] of [
      ['catalog', 'select public.library_catalog() result', []],
      ['catalog-automatic', 'select public.library_catalog() result', []],
      ['navigation','select public.library_navigation() result',[]],
      ['navigation-cached','select public.library_navigation() result',[]],
      ['facets','select public.library_query_facets($1) result',[{mode:'library',shelf:collection,filters:{}}]],
      ['series-facets','select public.library_query_facets($1) result',[{mode:'library',shelf:'series',filters:{}}]],
      ['mixed-facets','select public.library_query_facets($1) result',[{mode:'library',shelf:'all',filters:{showSeries:true}}]],
      ['all-facets','select public.library_query_facets($1) result',[{mode:'library',shelf:'all',filters:{}}]],
      ['manual-collection','select public.query_library($1,1,50) result',[{mode:'library',shelf:collection,includeFacets:false,filters:{sort:'added'}}]],
      ['first-page', 'select public.query_library($1,1,50) result', [{mode:'library',shelf:'all',includeFacets:false,filters:{sort:'added'}}]],
      ['finished-page', 'select public.query_library($1,1,50) result', [{mode:'library',shelf:'finished',includeFacets:false,filters:{sort:'added',showSeries:false}}]],
      ['last-page', 'select public.query_library($1,200,50) result', [{mode:'library',shelf:'all',includeFacets:false,filters:{sort:'added'}}]],
      ['sorted-page','select public.query_library($1,1,50) result',[{mode:'library',shelf:'all',includeFacets:false,filters:{sort:'alpha'}}]],
      ['reading-page', 'select public.query_library($1,1,50) result', [{mode:'reading',shelf:'view_all',includeFacets:false,filters:{sort:'added'}}]],
      ['filtered-page', 'select public.query_library($1,1,250) result', [{mode:'library',shelf:'all',includeFacets:false,filters:{sort:'updated',within:'friendship'},terms:[[{parts:['friendship'],exclude:false}]]}]],
      ['tag-any-cold','select public.query_library($1,1,50) result',[{mode:'library',shelf:'all',includeFacets:false,filters:{tagExpressions:{fandoms:{mode:'any',tags:['Fandom 1','Fandom 2']}}}}]],
      ['tag-any-warm','select public.query_library($1,1,50) result',[{mode:'library',shelf:'all',includeFacets:false,filters:{tagExpressions:{fandoms:{mode:'any',tags:['Fandom 1','Fandom 2']}}}}]],
      ['tag-all-cold','select public.query_library($1,1,50) result',[{mode:'library',shelf:'all',includeFacets:false,filters:{tagExpressions:{tags:{mode:'all',tags:['Tag 1','Tag 2']}}}}]],
      ['tag-custom-cold','select public.query_library($1,1,50) result',[{mode:'library',shelf:'all',includeFacets:false,filters:{tagExpressions:{tags:{mode:'custom',groups:[['Tag 1','Tag 2'],['Tag 3','Tag 4']]}}}}]],
      ['tag-custom-warm','select public.query_library($1,1,50) result',[{mode:'library',shelf:'all',includeFacets:false,filters:{tagExpressions:{tags:{mode:'custom',groups:[['Tag 1','Tag 2'],['Tag 3','Tag 4']]}}}}]],
      ['in-series-page','select public.query_library($1,1,50) result',[{mode:'library',shelf:'all',includeFacets:false,filters:{sort:'alpha',inSeries:true,showSeries:true}}]],
      ['series-page', 'select public.query_library($1,1,50) result', [{mode:'library',shelf:'series',includeFacets:false,filters:{sort:'alpha'}}]],
      ['series-page-warm', 'select public.query_library($1,1,50) result', [{mode:'library',shelf:'series',includeFacets:false,filters:{sort:'added'}}]],
      ['series-facets-warm','select public.library_query_facets($1) result',[{mode:'library',shelf:'series',filters:{}}]],
      ['series-filter-warm','select public.query_library($1,1,50) result',[{mode:'library',shelf:'series',includeFacets:false,filters:{inSeries:true}}]],
      ['count', 'select count(*) from public.library_entries where user_id=auth.uid()', []],
      ['offset-identities', 'select id from public.library_entries where user_id=auth.uid() order by created_at desc,id offset 9950 limit 50', []],
      ['cursor-identities', 'with anchor as materialized (select created_at,id from public.library_entries where user_id=auth.uid() order by created_at desc,id offset 9949 limit 1) select e.id from public.library_entries e cross join anchor a where e.user_id=auth.uid() and (e.created_at<a.created_at or (e.created_at=a.created_at and e.id>a.id)) order by e.created_at desc,e.id limit 50', []],
    ]) {
      if (label === 'catalog-automatic') await db.exec(`
        insert into public.collections(name,automatic_rules)
        select 'Performance automatic '||n,jsonb_build_object('filters',jsonb_build_object('tags','Tag '||n),'terms','[]'::jsonb)
        from generate_series(1,5) n;
        reset role; analyze public.automatic_collection_works; set role authenticated;
      `)
      const values = args.map(value => typeof value === 'object' ? JSON.stringify(value) : value)
      const start = performance.now(), response = await db.query(sql, values), elapsedMs = performance.now()-start
      if (label === 'finished-page' && response.rows[0].result.total !== finishedWorks) throw new Error('Finished shelf count does not match its fixture.')
      if (label === 'reading-page' && workCount >= 2 && response.rows[0].result.total === 0) throw new Error('Currently Reading must exercise a nonempty result set.')
      if (label === 'offset-identities') offsetIds = response.rows.map(row => row.id)
      if (label === 'cursor-identities' && JSON.stringify(response.rows.map(row => row.id)) !== JSON.stringify(offsetIds)) throw new Error('Offset and cursor returned different identities.')
      let plannedSql=sql,plannedValues=values
      let filteredCount
      if(sql.startsWith('select public.query_library')) {
        // Match the public RPC boundary: compile expressions/aliases once before selection.
        const query=args[0]
        const prepared=(await db.query("select public.library_alias_filters($1,auth.uid()) filters",[JSON.stringify(query.filters)])).rows[0].filters
        const plannedQuery=JSON.stringify({...query,filters:prepared})
        const withSeries=query.mode==='series'||query.shelf==='series'||query.filters.showSeries
        if(withSeries) {
          plannedSql=(await db.query("select prosrc from pg_proc where oid='public.library_query_series_matches(jsonb,jsonb,integer,integer)'::regprocedure")).rows[0].prosrc
            .replaceAll('p_query','$1::jsonb').replaceAll('p_ids','null::jsonb').replaceAll('p_page','null::integer').replaceAll('p_size','null::integer')
          plannedValues=[plannedQuery]
        } else {
          plannedSql=(await db.query('select public.library_query_work_sql($1,false) statement',[plannedQuery])).rows[0].statement.replaceAll('$1','$1::jsonb').replaceAll('$2','$2::uuid')
          const owner=(await db.query('select auth.uid() id')).rows[0].id
          plannedValues=[plannedQuery,owner]
        }
        // This is the production selection statement. Work identities are selected
        // without their match cache; series selection reuses its revision pool.
        const start=performance.now()
        const matches=await db.query(plannedSql,plannedValues)
        const result=Object.values(matches.rows[0])[0]
        filteredCount={elapsedMs:Math.round(performance.now()-start),count:result.ids.length}
        if(filteredCount.count!==response.rows[0].result.total)throw new Error('Candidate count differs from page total.')
      }
      const plan = await db.query(`explain (analyze,buffers,format json) ${plannedSql}`, plannedValues)
      results.push({label,elapsedMs:Math.round(elapsedMs),bytes:Buffer.byteLength(JSON.stringify(response.rows)),plan:plan.rows,filteredCount})
      console.log(label,Math.round(elapsedMs)+'ms',results.at(-1).bytes+' bytes',filteredCount?'filtered count '+filteredCount.elapsedMs+'ms':'')
      if (label === 'catalog-automatic') await db.exec("delete from public.collections where name like 'Performance automatic %'")
    }
    await mkdir('artifacts/performance',{recursive:true})
    await writeFile('artifacts/performance/library.json',JSON.stringify({environment:'PGlite, single process; not hosted concurrency',worksPerUser:workCount,finishedWorksPerUser:finishedWorks,users:3,results},null,2))
  } finally { await db.close() }
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) main().catch(error => { console.error(error.message); process.exitCode=1 })
