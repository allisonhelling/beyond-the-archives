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
