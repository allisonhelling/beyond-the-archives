// @vitest-environment node
import { beforeAll,afterAll,beforeEach,afterEach,expect,it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { defaultReadingFilters,filterReading } from '../../src/features/library/reading-search'
import { tagAliasIndex } from '../../src/features/library/tags/tag-resolution'
import type { Story } from '../../src/features/library/model'
let db:PGlite
const alice='10000000-0000-0000-0000-000000000001',bob='10000000-0000-0000-0000-000000000002'
const names=['Alya Césaire','Alya (Miraculous Ladybug)','Alya Césaire (Miraculous Ladybug)','Protective Alya Césaire','Custom Alya']
const records=names.slice(0,3).map((name,i)=>({category:'character',name,status:i?'synonym':'canonical',canonical_name:names[0]}))
beforeAll(async()=>{
 db=await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}'); insert into public.works(ao3_work_id,title) select n,'Tag work '||n from generate_series(1,5) n;`)
 for(const [i,name] of names.entries())await db.query(`insert into public.library_entries(user_id,work_id,original_url,reading_status,metadata_overrides) select $1,id,'https://archiveofourown.org/works/'||ao3_work_id,'reading',jsonb_build_object('character_tags',jsonb_build_array($2::text),'relationship_tags',jsonb_build_array('A/B'),'additional_tags',jsonb_build_array('Custom fluff')) from public.works where ao3_work_id=$3`,[alice,name,i+1])
 await db.exec(`set request.jwt.claim.sub='${alice}';set role authenticated`)
},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{await db.exec('begin')});afterEach(async()=>{await db.exec('rollback')})
async function cache(rows:object[]=records){await db.exec('reset role');await db.query('select public.store_tag_resolutions($1,$2)',[alice,JSON.stringify(rows)]);await db.exec('set role authenticated')}
async function query(filters={},shelf='all',mode='library'){return(await db.query<{result:{stories:Story[];total:number}}>('select public.query_library($1,1,25) result',[JSON.stringify({mode,shelf,includeFacets:false,filters:{...defaultReadingFilters,...filters}})])).rows[0].result}
it('expands a canonical selection to verified aliases without including merely related names and preserves the raw metadata',async()=>{
 await cache()
 const result=await query({characters:names[0]})
 expect(result.total).toBe(3)
 expect(result.stories.flatMap(s=>s.metadata.character_tags)).toEqual(expect.arrayContaining(names.slice(0,3)))
 expect((await query({characters:'Alya'})).total).toBe(5)
 expect((await query({characters:names[1]})).total).toBe(1)
 expect((await query({relationship:names[0]})).total).toBe(0)
 expect((await query({characters:names[0]},'view_all','reading')).total).toBe(3)
 const all=(await query()).stories
 const aliases=(await db.query<{value:unknown}>('select public.library_tag_aliases(auth.uid()) value')).rows[0].value
 expect((await query({characters:names[0]})).stories.map(s=>s.id)).toEqual(filterReading(all,{...defaultReadingFilters,characters:names[0],tagAliases:aliases as ReturnType<typeof tagAliasIndex>}).map(s=>s.id))
})
it('uses the same matching for automatic collections, counts and conversion to manual membership',async()=>{
 await cache()
 const rules={filters:{...defaultReadingFilters,characters:names[0]},terms:[]}
 const id=(await db.query<{id:string}>('insert into public.collections(name,automatic_rules) values($1,$2) returning id',['Alya',JSON.stringify(rules)])).rows[0].id
 expect((await query({},id)).total).toBe(3)
 const navigation=(await db.query<{r:Record<string,{works:number}>}>('select public.library_navigation() r')).rows[0].r
 expect(navigation[id].works).toBe(3)
 await db.query('update public.collections set automatic_rules=null where id=$1',[id])
 expect((await query({},id)).total).toBe(3)
})
it('keeps unknown/custom tags searchable and prevents one account from reading or forging another account’s verification',async()=>{
 expect((await query({characters:names[0]})).total).toBe(3) // Existing substring matching before verification.
 await expect(db.query('select public.store_tag_resolutions($1,$2)',[alice,JSON.stringify(records)])).rejects.toThrow('permission denied')
 await db.exec('rollback;begin')
 await cache()
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect((await db.query('select * from public.ao3_tag_resolutions')).rows).toEqual([])
 expect((await db.query<{r:object}>('select public.library_tag_aliases($1) r',[alice])).rows[0].r).toEqual({})
})
it('invalidates old synonyms only when AO3 confirms a changed canonical, preserving verified evidence after failed refreshes',async()=>{
 await cache()
 await cache([{category:'character',name:names[0],status:'unverified',canonical_name:null}])
 expect((await query({characters:names[0]})).total).toBe(3)
 await cache([{category:'character',name:names[0],status:'synonym',canonical_name:'New Alya'},{category:'character',name:'New Alya',status:'canonical',canonical_name:'New Alya'}])
 expect((await query({characters:'New Alya'})).total).toBe(1)
 const stale=(await db.query<{status:string}>('select status from public.ao3_tag_resolutions where name=$1',[names[1]])).rows[0]
 expect(stale.status).toBe('unverified')
})
it('does not reload the alias index per work in a filtered query',async()=>{
 await cache()
 await db.exec('reset role')
 const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_tag_aliases(uuid)'::regprocedure")).rows[0]
 await db.exec('create temp sequence alias_reads')
 await db.exec(fn.definition.replace('LANGUAGE sql','LANGUAGE plpgsql').replace(fn.source,"begin perform nextval('alias_reads'); return ("+fn.source.trim().replace(/;$/,'')+'); end;'))
 await db.exec('grant usage,select on sequence alias_reads to authenticated;set role authenticated')
 expect((await query({characters:names[0]})).total).toBe(3)
 expect((await db.query<{n:number}>("select last_value::integer n from alias_reads")).rows[0].n).toBe(1)
})


it('refreshes maintained memberships and cached counts when verified aliases change under a service context', async()=>{
 const id=(await db.query<{id:string}>('insert into public.collections(name,automatic_rules) values($1,$2) returning id',['New Canonical',JSON.stringify({filters:{...defaultReadingFilters,characters:'New Canonical'},terms:[]})])).rows[0].id
 expect((await query({},id)).total).toBe(0)
 await db.query('select public.library_navigation()')
 await db.exec('reset role;reset request.jwt.claim.sub')
 await db.query('select public.store_tag_resolutions($1,$2)',[alice,JSON.stringify([
  {category:'character',name:'New Canonical',status:'canonical',canonical_name:'New Canonical'},
  {category:'character',name:names[1],status:'synonym',canonical_name:'New Canonical'},
 ])])
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
 expect((await query({},id)).total).toBe(1)
 const navigation=(await db.query<{r:Record<string,{works:number}>}>('select public.library_navigation() r')).rows[0].r
 expect(navigation[id].works).toBe(1)
 await db.exec('reset role;reset request.jwt.claim.sub')
 await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"character_tags\":[\"Unrelated\"]}'::jsonb where id=$1",[(await db.query<{id:string}>("select id from public.library_entries where user_id=$1 and metadata_overrides->'character_tags' ? $2",[alice,names[1]])).rows[0].id])
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}'`)
 expect((await query({},id)).total).toBe(0)
})


it('re-resolves aliases if verification changes between alias loading and revision capture',async()=>{
 await db.exec('reset role')
 const fn=(await db.query<{definition:string;source:string}>("select pg_get_functiondef(oid) definition,prosrc source from pg_proc where oid='public.library_tag_aliases(uuid)'::regprocedure")).rows[0]
 const updated=[{category:'character',name:'New Canonical',status:'canonical',canonical_name:'New Canonical'},{category:'character',name:names[1],status:'synonym',canonical_name:'New Canonical'}]
 await db.exec('create sequence public.alias_race;grant usage,select on sequence public.alias_race to authenticated')
 // Resolve once with the old evidence, then store new evidence before the
 // matching stage records its revision. The page must retry with fresh aliases.
 const expression=fn.source.trim().replace(/;$/,'')
 const replacement=`declare aliases jsonb; begin aliases:=(${expression}); if not (select is_called from public.alias_race) then perform nextval('public.alias_race'); perform public.store_tag_resolutions(p_owner,'${JSON.stringify(updated).replaceAll("'","''")}'::jsonb); end if; return aliases; end;`
 await db.exec(fn.definition.replace('LANGUAGE sql','LANGUAGE plpgsql').replace(' STABLE',' VOLATILE').replace(fn.source,replacement))
 // The instrumented resolver has the same owner as the real server resolver.
 await db.exec('alter function public.library_tag_aliases(uuid) security definer;set role authenticated')
 const result=await query({characters:'New Canonical'})
 expect(result.total).toBe(1)
 expect(result.stories[0].metadata.character_tags).toEqual([names[1]])
})

it('requires a category-correct canonical root in both SQL and TypeScript and preserves raw fallback',async()=>{
 await cache([records[1]])
 const rows=(await db.query<import('../../src/features/library/tags/tag-resolution').TagResolution>('select category,name,status,canonical_name,checked_at,attempted_at from public.ao3_tag_resolutions')).rows
 const aliases=(await db.query<{a:object}>('select public.library_tag_aliases(auth.uid()) a')).rows[0].a
 expect(aliases).toEqual(tagAliasIndex(rows))
 expect(aliases).toEqual({})
 expect((await query({characters:names[0]})).total).toBe(3) // Raw substring, not alias expansion.
 await cache([{...records[0],category:'relationship'}])
 expect((await query({characters:names[0]})).total).toBe(3)
 expect((await db.query<{m:boolean}>("select public.library_tag_matches('Alya (Miraculous Ladybug)','personalTags','alya cesaire',$1) m",[JSON.stringify({freeform:{'alya cesaire':{'alya (miraculous ladybug)':true}}})])).rows[0].m).toBe(false)
})

it('evaluates Any/All/Custom for every category before pagination and shares the predicate with local results',async()=>{
 await cache()
 const stories=(await query()).stories
 for(const key of ['fandoms','relationship','characters','tags'] as const){
  const terms=key==='characters'?[names[0],'Custom Alya']:key==='relationship'?['A/B','Missing']:key==='tags'?['Custom','Missing']:['Fandom A','Missing']
  if(key==='fandoms') await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"fandoms\":[\"Fandom A\"]}'::jsonb where user_id=auth.uid()")
  const current=key==='fandoms'?(await query()).stories:stories
  for(const expression of [{mode:'any',tags:terms},{mode:'all',tags:terms},{mode:'custom',groups:[terms,[terms[0]]]},{mode:'custom',groups:[[],terms]}]){
   const filters={...defaultReadingFilters,tagExpressions:{[key]:expression}}
   const alias=(await db.query<{a:ReturnType<typeof tagAliasIndex>}>('select public.library_tag_aliases(auth.uid()) a')).rows[0].a
   const expected=filterReading(current,{...filters,tagAliases:alias} as Parameters<typeof filterReading>[1]).map(s=>s.id).sort()
   const result=await query(filters)
   expect(result.total).toBe(expected.length)
   expect(result.stories.map(s=>s.id).sort()).toEqual(expected)
  }
 }
 await db.exec('reset role')
 await db.exec("insert into public.works(ao3_work_id,title) select n,'Page fixture '||n from generate_series(1000,1029) n")
 await db.query("insert into public.library_entries(user_id,work_id,original_url,reading_status,metadata_overrides) select $1,id,'https://archiveofourown.org/works/'||ao3_work_id,'reading',jsonb_build_object('character_tags',jsonb_build_array($2::text)) from public.works where ao3_work_id between 1000 and 1029",[alice,names[0]])
 await db.exec('set role authenticated')
 const filters={...defaultReadingFilters,tagExpressions:{characters:{mode:'any',tags:[names[0],'Custom Alya']}}}
 const input=JSON.stringify({mode:'library',shelf:'all',includeFacets:false,filters})
 const first=(await db.query<{r:{total:number;stories:Story[]}}>('select public.query_library($1,1,25) r',[input])).rows[0].r
 const second=(await db.query<{r:{total:number;stories:Story[]}}>('select public.query_library($1,2,25) r',[input])).rows[0].r
 expect(first.total).toBe(34);expect(second.total).toBe(34)
 expect(first.stories).toHaveLength(25);expect(second.stories).toHaveLength(9)
 expect(first.stories[0].id).not.toBe(second.stories[0].id)
 const id=(await db.query<{id:string}>('insert into public.collections(name,automatic_rules) values($1,$2) returning id',['Expressions',JSON.stringify({filters,terms:[]})])).rows[0].id
 expect((await query({},id)).total).toBe(34)
 const nav=(await db.query<{r:Record<string,{works:number}>}>('select public.library_navigation() r')).rows[0].r
 expect(nav[id].works).toBe(34)
 expect((await query({tagExpressions:{characters:{mode:'all',tags:[names[0],'Custom Alya']}}})).total).toBe(0)
 expect((await query({tagExpressions:{characters:{mode:'any',tags:[names[0],'Custom Alya']}}},'view_all','reading')).total).toBe(34)
})

it('rejects malformed collection expressions and keeps new SQL helpers invoker-only and inaccessible to anonymous callers',async()=>{
 await expect(db.query('insert into public.collections(name,automatic_rules) values($1,$2)',['Bad',JSON.stringify({filters:{tagExpressions:{fandoms:{mode:'wat'}}},terms:[]})])).rejects.toThrow('Invalid tag expression')
 await db.exec('rollback;begin;reset role')
 const rows=(await db.query<{name:string;definer:boolean;anon:boolean}>("select proname name,prosecdef definer,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname in ('library_expression_tags','library_tag_expression_groups','library_tag_groups_match')")).rows
 expect(rows).toHaveLength(3)
 expect(rows.every(row=>!row.definer&&!row.anon)).toBe(true)
})
it('tolerates malformed external expression payloads without changing legacy selections',async()=>{
 for(const tagExpressions of [null,[],false,'invalid',{characters:{mode:'custom',groups:[null,[],[7]]}}]) expect((await query({tagExpressions})).total).toBe(5)
})
it('normalizes Unicode edge whitespace and duplicate identities with the same expression contract as TypeScript',async()=>{
 const {tagExpression,convertTagExpression}=await import('../../src/features/library/tags/tag-expressions')
 const filters={...defaultReadingFilters,tagExpressions:{fandoms:{mode:'all' as const,tags:['\u00a0A\u2003','a','B','\nRejected']}}}
 const groups=(await db.query<{g:string[][]}>("select public.library_tag_expression_groups($1,'fandoms') g",[JSON.stringify(filters)])).rows[0].g
 expect(groups).toEqual((convertTagExpression(tagExpression(filters,'fandoms'),'custom') as {groups:string[][]}).groups)
})
