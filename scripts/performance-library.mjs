import { createTestDatabase } from './test-database.mjs'
import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'

// Synthetic data only. This never contacts AO3 or a hosted database.
export async function seedLargeLibraries(db, count = 10000, users = 3) {
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
    case when w.ao3_work_id%3=0 then 'reading'::public.reading_status else 'to_read'::public.reading_status end,
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
    await seedLargeLibraries(db, Number(process.env.PERF_WORKS ?? 10000), 3)
    await db.exec("set role authenticated; set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'")
    const results = []
    let offsetIds
    for (const [label, sql, args] of [
      ['catalog', 'select public.library_catalog() result', []],
      ['catalog-automatic', 'select public.library_catalog() result', []],
      ['first-page', 'select public.query_library($1,1,50) result', [{mode:'library',shelf:'all',filters:{sort:'added'}}]],
      ['last-page', 'select public.query_library($1,200,50) result', [{mode:'library',shelf:'all',filters:{sort:'added'}}]],
      ['filtered-page', 'select public.query_library($1,1,250) result', [{mode:'library',shelf:'all',filters:{sort:'updated',within:'friendship'},terms:[[{parts:['friendship'],exclude:false}]]}]],
      ['series-page', 'select public.query_library($1,1,50) result', [{mode:'library',shelf:'series',filters:{sort:'alpha'}}]],
      ['count', 'select count(*) from public.library_entries where user_id=auth.uid()', []],
      ['offset-identities', 'select id from public.library_entries where user_id=auth.uid() order by created_at desc,id offset 9950 limit 50', []],
      ['cursor-identities', 'with anchor as materialized (select created_at,id from public.library_entries where user_id=auth.uid() order by created_at desc,id offset 9949 limit 1) select e.id from public.library_entries e cross join anchor a where e.user_id=auth.uid() and (e.created_at<a.created_at or (e.created_at=a.created_at and e.id>a.id)) order by e.created_at desc,e.id limit 50', []],
    ]) {
      if (label === 'catalog-automatic') await db.exec(`
        insert into public.collections(name,automatic_rules)
        select 'Performance automatic '||n,jsonb_build_object('filters',jsonb_build_object('tags','Tag '||n),'terms','[]'::jsonb)
        from generate_series(1,5) n;
      `)
      const values = args.map(value => typeof value === 'object' ? JSON.stringify(value) : value)
      const start = performance.now(), response = await db.query(sql, values), elapsedMs = performance.now()-start
      if (label === 'offset-identities') offsetIds = response.rows.map(row => row.id)
      if (label === 'cursor-identities' && JSON.stringify(response.rows.map(row => row.id)) !== JSON.stringify(offsetIds)) throw new Error('Offset and cursor returned different identities.')
      let plannedSql=sql,plannedValues=values
      if(sql.startsWith('select public.query_library')) {
        const definition=(await db.query("select pg_get_functiondef('public.query_library(jsonb,integer,integer)'::regprocedure) definition")).rows[0].definition
        plannedSql=definition.match(/ with works[\s\S]+?into result from totals/)[0].replace('into result','').replaceAll('p_query','$1::jsonb').replaceAll('p_page','$2::integer').replaceAll('p_size','$3::integer')
        const page=Number(sql.match(/,([0-9]+),[0-9]+\)/)[1]),size=Number(sql.match(/,[0-9]+,([0-9]+)\)/)[1])
        plannedValues=[values[0],page,size]
      }
      const plan = await db.query(`explain (analyze,buffers,format json) ${plannedSql}`, plannedValues)
      let filteredCount
      if(sql.startsWith('select public.query_library')) {
        const countBoundary=plannedSql.indexOf(',\n totals as')
        if(countBoundary<0)throw new Error('Review the filtered-count plan extraction after query changes.')
        const countSql=plannedSql.slice(0,countBoundary)+' select count(*) from selected'
        const countStart=performance.now()
        const count=await db.query(countSql,[values[0]])
        const elapsedMs=Math.round(performance.now()-countStart)
        const plan=await db.query(`explain (analyze,buffers,format json) ${countSql}`,[values[0]])
        filteredCount={elapsedMs,count:count.rows[0].count,plan:plan.rows}
      }
      results.push({label,elapsedMs:Math.round(elapsedMs),bytes:Buffer.byteLength(JSON.stringify(response.rows)),plan:plan.rows,filteredCount})
      console.log(label,Math.round(elapsedMs)+'ms',results.at(-1).bytes+' bytes',filteredCount?'filtered count '+filteredCount.elapsedMs+'ms':'')
      if (label === 'catalog-automatic') await db.exec("delete from public.collections where name like 'Performance automatic %'")
    }
    await mkdir('artifacts/performance',{recursive:true})
    await writeFile('artifacts/performance/library.json',JSON.stringify({environment:'PGlite, single process; not hosted concurrency',worksPerUser:Number(process.env.PERF_WORKS ?? 10000),users:3,results},null,2))
  } finally { await db.close() }
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) main().catch(error => { console.error(error.message); process.exitCode=1 })
