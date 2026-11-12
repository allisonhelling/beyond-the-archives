// @vitest-environment node
import { beforeAll,afterAll,beforeEach,afterEach,expect,it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared migrated PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { classifyFandomBatch, type FandomEvidenceBatch } from '../../src/features/library/fandoms/fandom-classification'
import { defaultReadingFilters, filterReading } from '../../src/features/library/reading-search'
import { ao3TagUrl } from '../../server/ao3/tag-resolution'
import type { Story } from '../../src/features/library/model'
let db:PGlite
const alice='10000000-0000-0000-0000-000000000001',bob='10000000-0000-0000-0000-000000000002'
beforeAll(async()=>{
 db=await createTestDatabase()
 await db.exec(`insert into auth.users(id) values('${alice}'),('${bob}');set request.jwt.claim.sub='${alice}'`)
 const fandoms=[['A','Alias A'],['A','B'],['A','Missing'],['Child A','A'],null,[]]
 for(const [index,names]of fandoms.entries()){
  await db.query('insert into public.works(ao3_work_id,title) values($1,$2)',[index+1,'Fixture '+(index+1)])
  await db.query(`insert into public.library_entries(user_id,work_id,original_url,reading_status,metadata_overrides)
   select $1,id,'https://archiveofourown.org/works/'||ao3_work_id,'reading',$2 from public.works where ao3_work_id=$3`,[alice,JSON.stringify({authors:['Fixture Author'],...(names&&{fandoms:names})}),index+1])
 }
 await profile('A',[],['Alias A']);await profile('B');await profile('Child A',['A'])
},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{await db.exec('begin')});afterEach(async()=>{await db.exec('rollback')})
async function profile(name:string,parents:string[]=[],aliases:string[]=[]){
 await db.query('select public.store_fandom_profile($1)',[JSON.stringify({name,canonical_name:name,status:'canonical',aliases,metatag_names:parents,hierarchy_state:parents.length?'observed':'verified_empty',hierarchy_complete:true,profile_complete:true,parser_version:'ao3_fandom_profile_v2',profile_url:ao3TagUrl(name)})])
}
async function classify(user=alice){
 const batch=(await db.query<{r:FandomEvidenceBatch}>('select public.claim_fandom_classifications($1) r',[user])).rows[0].r
 if(!batch.sets.length)return 0
 const results=classifyFandomBatch(batch,Date.now())
 return (await db.query<{n:number}>('select public.commit_fandom_classifications($1,$2,$3,$4) n',[user,batch.token,batch.revision,JSON.stringify(results)])).rows[0].n
}
async function query(crossovers='allowed',page=1,size=25,scope:object={}){
 await db.exec('savepoint query_attempt')
 await db.exec(`set local role authenticated;set local request.jwt.claim.sub='${alice}'`)
 try{return(await db.query<{r:{total:number;stories:Story[];revision:number;series:{works:object[]}[]}}>('select public.query_library($1,$2,$3) r',[JSON.stringify({mode:'library',shelf:'all',includeFacets:false,filters:{...defaultReadingFilters,crossovers},...scope}),page,size])).rows[0].r}
 catch(error){await db.exec('rollback to query_attempt');throw error}
 finally{await db.exec('reset role;release savepoint query_attempt')}
}
it('uses verified identities/closures before counts and pagination, retaining unknown under Exclude',async()=>{
 expect((await query('only')).total).toBe(0)
 expect(await classify()).toBe(6)
 const all=await query();expect(all.total).toBe(6)
 expect((await query('only')).stories.map(s=>s.work.ao3_work_id)).toEqual([2])
 const exclude=await query('exclude');expect(exclude.total).toBe(5);expect(exclude.stories).toHaveLength(5)
 const statuses=new Map(all.stories.map(s=>[s.work.ao3_work_id,s.crossoverStatus]))
 expect([...statuses.values()].sort()).toEqual(['crossover','not_crossover','not_crossover','not_crossover','unknown','unknown'])
 for(const crossovers of ['allowed','only','exclude']as const)expect((await query(crossovers)).stories.map(s=>s.id)).toEqual(filterReading(all.stories,{...defaultReadingFilters,crossovers}).map(s=>s.id))
 expect((await query('only',1,25,{author:'Fixture Author'})).total).toBe(1)
 expect((await query('only',1,25,{author:'Other Author'})).total).toBe(0)
 expect((await query('allowed',1,25,{filters:{}})).total).toBe(6)
 for(let index=1000;index<1026;index++){
  await db.query('insert into public.works(ao3_work_id,title) values($1,$2)',[index,'Paged '+index])
  await db.query(`insert into public.library_entries(user_id,work_id,original_url,metadata_overrides) select $1,id,'https://archiveofourown.org/works/'||ao3_work_id,'{"fandoms":["A","B"]}' from public.works where ao3_work_id=$2`,[alice,index])
 }
 expect((await query('only',1,25)).stories).toHaveLength(25)
 const second=await query('only',2,25);expect(second.total).toBe(27);expect(second.stories).toHaveLength(2)
})
it('publishes evidence updates, maintained memberships and navigation at the same owner revision',async()=>{
 const rules={filters:{...defaultReadingFilters,crossovers:'only'},terms:[]}
 const id=(await db.query<{id:string}>('insert into public.collections(user_id,name,automatic_rules) values($1,$2,$3) returning id',[alice,'Verified Crossovers',JSON.stringify(rules)])).rows[0].id
 await classify()
 const before=await query('allowed',1,25,{shelf:id});expect(before.total).toBe(1)
 await profile('B',['A']);expect((await query('only')).total).toBe(0)
 expect(await classify()).toBeGreaterThan(0)
 const after=await query('allowed',1,25,{shelf:id});expect(after.total).toBe(0);expect(after.revision).toBeGreaterThan(before.revision)
 expect((await query('only')).total).toBe(0)
 expect((await db.query<{n:number}>('select count(*)::int n from public.automatic_collection_works where collection_id=$1',[id])).rows[0].n).toBe(0)
 expect((await db.query('select preferred_display_name from public.canonical_fandoms order by preferred_display_name')).rows).toEqual([{preferred_display_name:'A'},{preferred_display_name:'B'},{preferred_display_name:'Child A'}])
})
it('immediately reuses cached classifications after effective fandom edits without changing raw source strings',async()=>{
 await classify()
 await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"fandoms\":[\"A\",\"B\"]}'::jsonb where work_id=(select id from public.works where ao3_work_id=3)")
 expect((await query('only')).total).toBe(2)
 expect((await query('only')).stories.every(s=>JSON.stringify(s.metadata.fandoms)==='["A","B"]')).toBe(true)
})
it('preserves oversized manual fandom observations as unknown without blocking a story save',async()=>{
 const fandoms=['A','Long manual candidate '.repeat(300)]
 await db.query('update public.library_entries set metadata_overrides=metadata_overrides||jsonb_build_object(\'fandoms\',$1::jsonb) where work_id=(select id from public.works where ao3_work_id=3)',[JSON.stringify(fandoms)])
 const result=(await query()).stories.find(story=>story.work.ao3_work_id===3)!
 expect(result.metadata.fandoms).toEqual(fandoms)
 expect(result.crossoverStatus).toBe('unknown')
 expect((await db.query('select name from public.fandom_resolution_requests where name=$1',[fandoms[1]])).rows).toEqual([])
})
it('expires negative evidence without retrieval and invalidates cached counts and automatic membership',async()=>{
 await classify();expect((await query('only')).total).toBe(1)
 await db.exec("update public.fandom_classifications set valid_until=now()-interval '1 second' where status='crossover'")
 await db.query('select public.library_navigation_snapshot()')
 expect((await query('only')).total).toBe(0)
 expect((await query('exclude')).total).toBe(6)
 expect((await db.query("select status,dirty from public.fandom_classifications where fandoms @> array['B']")).rows[0]).toEqual({status:'unknown',dirty:true})
})
it('withdraws old positive edges only after a complete replacement and refreshes stale alias identities independently',async()=>{
 await classify();await profile('B',['A']);await classify();expect((await query('only')).total).toBe(0)
 await profile('B');await classify();expect((await query('only')).total).toBe(1)
 await db.exec("update public.external_fandom_mappings set verified_at=now()-interval '31 days' where source_key='Alias A';update public.fandom_resolution_requests set next_attempt_at=now() where name='Alias A'")
 // A fresh root with an omitted alias list does not renew that alias mapping.
 await profile('A')
 const queued=(await db.query<{n:string}>('select public.claim_fandom_resolution($1) n',[alice])).rows[0].n
 expect(['Alias A','Missing']).toContain(queued)
 expect((await db.query<{fresh:boolean}>("select verified_at>now()-interval '30 days' fresh from public.external_fandom_mappings where source_key='Alias A'")).rows[0].fresh).toBe(false)
})
it('fences stale batches and keeps leases and observation sets account-isolated',async()=>{
 const batch=(await db.query<{r:FandomEvidenceBatch}>('select public.claim_fandom_classifications($1) r',[alice])).rows[0].r
 const results=classifyFandomBatch(batch,Date.now());await profile('B',['A'])
 expect((await db.query<{n:number}>('select public.commit_fandom_classifications($1,$2,$3,$4) n',[alice,batch.token,batch.revision,JSON.stringify(results)])).rows[0].n).toBe(0)
 await classify()
 await db.exec(`set local role authenticated;set local request.jwt.claim.sub='${bob}'`)
 expect((await db.query('select * from public.fandom_classifications')).rows).toEqual([])
 await db.exec('savepoint denied')
 await expect(db.query('select public.claim_fandom_classifications($1)',[alice])).rejects.toThrow('permission denied')
 await db.exec('rollback to denied;savepoint denied')
 await expect(db.exec("update public.fandom_classifications set status='crossover'")).rejects.toThrow('permission denied')
 await db.exec('rollback to denied;reset role')
})
it('keeps failed private candidates out of shared AO3 evidence and records owner-private retry state',async()=>{
 await db.query('select public.store_fandom_profile($1)',[JSON.stringify({name:'Private Candidate',canonical_name:null,status:'unverified',aliases:[],metatag_names:[],hierarchy_state:'missing',profile_complete:false,hierarchy_complete:false,parser_version:'ao3_fandom_profile_v2',profile_url:ao3TagUrl('Private Candidate')})])
 expect((await db.query("select name from public.ao3_fandom_profiles where name='Private Candidate'")).rows).toEqual([])
 await db.query('select public.finish_fandom_resolution($1,$2,600)',[alice,'Private Candidate'])
 expect((await db.query<{ready:boolean}>("select next_attempt_at>now() ready from public.fandom_resolution_requests where user_id=$1 and name='Private Candidate'",[alice])).rows[0].ready).toBe(true)
 expect((await db.query('select name from public.fandom_resolution_requests where user_id=$1',[bob])).rows).toEqual([])
})
it('uses cached member classifications for unsaved series without unioning fandoms across installments',async()=>{
 const preview={seriesId:99,normalizedUrl:'https://archiveofourown.org/series/99',title:'Fixture Series',basic:false,description:'',complete:true,works:[
  {workId:101,url:'https://archiveofourown.org/works/101',position:1,title:'One',authors:[],fandoms:['A'],tags:[],summary:'',wordCount:10,chapters:'1/1',complete:true},
  {workId:102,url:'https://archiveofourown.org/works/102',position:2,title:'Two',authors:[],fandoms:['B'],tags:[],summary:'',wordCount:10,chapters:'1/1',complete:true},
 ]}
 await db.query('insert into public.library_series(user_id,ao3_series_id,metadata) values($1,99,$2)',[alice,JSON.stringify(preview)])
 await classify()
 expect((await query('only',1,25,{shelf:'series'})).total).toBe(0)
 expect((await query('exclude',1,25,{shelf:'series'})).total).toBe(1)
 preview.works[1].fandoms=['A','B']
 await db.query('update public.library_series set metadata=$1 where ao3_series_id=99',[JSON.stringify(preview)])
 await classify()
 const result=await query('only',1,25,{shelf:'series'})
 expect(result.total).toBe(1)
 expect(result.series[0].works[1]).toMatchObject({crossoverStatus:'crossover',crossoverPolicy:'ao3_hierarchy_v1'})
})
