// @vitest-environment node
import { beforeAll,afterAll,beforeEach,afterEach,expect,it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared PostgreSQL harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { ao3TagUrl } from '../../server/ao3/tag-resolution'
let db:PGlite
beforeAll(async()=>{db=await createTestDatabase()},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{await db.exec('begin')})
afterEach(async()=>{await db.exec('rollback')})
const profile=(name='Fixture A',extra:object={})=>({name,canonical_name:name,status:'canonical',aliases:[],metatag_names:[],hierarchy_state:'missing',hierarchy_complete:false,parser_version:'ao3_fandom_profile_v1',profile_url:ao3TagUrl(name),...extra})
const store=(value:object)=>db.query('select public.store_fandom_profile($1)',[JSON.stringify(value)])
const mappings=async()=> (await db.query<{source_key:string;canonical_fandom_id:string;mapping_state:string;mapping_revision:number}>('select * from public.external_fandom_mappings order by source_key')).rows
it('creates opaque application IDs only for independently verified canonical profiles and maps verified aliases to the same ID',async()=>{
 await store(profile('Alias',{status:'synonym',canonical_name:'Fixture A'}))
 expect(await mappings()).toEqual([])
 await store(profile('Fixture A',{aliases:['Other Alias']}))
 const rows=await mappings()
 expect(rows.map(row=>row.source_key)).toEqual(['Alias','Fixture A','Other Alias'])
 expect(new Set(rows.map(row=>row.canonical_fandom_id)).size).toBe(1)
 expect(rows[0].canonical_fandom_id).toMatch(/^[0-9a-f-]{36}$/)
 const before=rows[0].canonical_fandom_id
 await store(profile('Fixture A',{aliases:['Other Alias']}))
 expect((await mappings())[0].canonical_fandom_id).toBe(before)
 expect((await db.query('select * from public.canonical_fandoms')).rows).toHaveLength(1)
})
it('keeps related identities distinct and leaves parent candidates unresolved until verified',async()=>{
 await store(profile('Fixture A',{metatag_names:['Fixture Parent'],hierarchy_state:'observed'}))
 expect((await mappings()).map(row=>row.source_key)).toEqual(['Fixture A'])
 await store(profile('Fixture Parent'))
 expect(new Set((await mappings()).map(row=>row.canonical_fandom_id)).size).toBe(2)
 expect((await db.query('select hierarchy_complete from public.ao3_fandom_profiles')).rows).toEqual([{hierarchy_complete:false},{hierarchy_complete:false}])
})
it('preserves positive observations and revisions across failed or incomplete refreshes without inventing completeness',async()=>{
 await store(profile('Fixture A',{metatag_names:['Parent'],hierarchy_state:'observed'}))
 const first=(await db.query<{evidence_revision:number}>('select evidence_revision from public.ao3_fandom_profiles')).rows[0]
 await store(profile('Fixture A',{status:'unverified',canonical_name:null}))
 expect((await db.query('select status,metatag_names,evidence_revision,last_failure_at is not null failed from public.ao3_fandom_profiles')).rows[0]).toEqual({status:'canonical',metatag_names:['Parent'],evidence_revision:first.evidence_revision,failed:true})
 await store(profile('Fixture A',{hierarchy_state:'malformed'}))
 expect((await db.query('select metatag_names,hierarchy_complete from public.ao3_fandom_profiles')).rows[0]).toEqual({metatag_names:['Parent'],hierarchy_complete:false})
 const partial=(await db.query<{evidence_revision:number}>('select evidence_revision from public.ao3_fandom_profiles')).rows[0]
 await store(profile('Fixture A',{hierarchy_state:'malformed'}))
 expect((await db.query('select evidence_revision from public.ao3_fandom_profiles')).rows[0]).toEqual(partial)
 await expect(store(profile('Fixture A',{hierarchy_complete:true}))).rejects.toThrow('Invalid fandom profile')
})
it('quarantines conflicting source mappings without merging IDs or automatically clearing disputes',async()=>{
 await store(profile('Fixture A',{aliases:['Shared Alias']}))
 await store(profile('Fixture B',{aliases:['Shared Alias']}))
 expect((await mappings()).find(row=>row.source_key==='Shared Alias')).toMatchObject({mapping_state:'disputed',mapping_revision:2})
 expect((await db.query('select * from public.canonical_fandoms')).rows).toHaveLength(2)
 await store(profile('Fixture A',{aliases:['Shared Alias']}))
 expect((await mappings()).find(row=>row.source_key==='Shared Alias')?.mapping_state).toBe('disputed')
})
it('quarantines contradictory alias observations even when the other canonical has not resolved yet',async()=>{
 await store(profile('Alias',{status:'synonym',canonical_name:'Other Unresolved Canonical'}))
 await store(profile('Fixture A',{aliases:['Alias']}))
 expect((await mappings()).find(row=>row.source_key==='Alias')?.mapping_state).toBe('disputed')
})
it('retains source namespaces and exact identities without case/accent/name-based merging',async()=>{
 await store(profile('Fixture A'))
 await store(profile('fixture a'))
 expect(new Set((await mappings()).map(row=>row.canonical_fandom_id)).size).toBe(2)
 await db.exec(`insert into public.external_fandom_mappings(source_site,source_category,identity_scheme,source_key,canonical_fandom_id,mapping_state,verification_method,evidence_ref)
 select 'fixture_foreign','fandom','fixture','Fixture A',id,'disputed','synthetic','fixture' from public.canonical_fandoms limit 1`)
 expect(await mappings()).toHaveLength(3)
})
it.each(['anon','authenticated'])('denies %s direct evidence reads/writes and trusted-store execution',async role=>{
 await store(profile())
 const checks=[
  'select * from public.canonical_fandoms',
  'select * from public.external_fandom_mappings',
  'select * from public.ao3_fandom_profiles',
  "insert into public.canonical_fandoms(preferred_display_name) values('Forged')",
  "delete from public.external_fandom_mappings",
  "update public.ao3_fandom_profiles set hierarchy_complete=true",
  `select public.store_fandom_profile('${JSON.stringify(profile()).replaceAll("'","''")}'::jsonb)`,
 ]
 for(const sql of checks){
  await db.exec(`savepoint permission_check;set local role ${role}`)
  await expect(db.exec(sql)).rejects.toThrow('permission denied')
  await db.exec('rollback to permission_check')
 }
 const security=(await db.query<{relrowsecurity:boolean;relforcerowsecurity:boolean}>("select relrowsecurity,relforcerowsecurity from pg_class where oid in ('public.canonical_fandoms'::regclass,'public.external_fandom_mappings'::regclass,'public.ao3_fandom_profiles'::regclass)")).rows
 expect(security).toHaveLength(3)
 expect(security.every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true)
})
