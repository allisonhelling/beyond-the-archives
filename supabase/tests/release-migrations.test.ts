// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Existing embedded PostgreSQL migration harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
// @ts-expect-error Shared synthetic library fixture.
import { seedLargeLibraries } from '../../scripts/performance-library.mjs'
// @ts-expect-error Shared source/live metadata inventory.
import { privacyCatalog } from '../../scripts/privacy-catalog.mjs'

const releaseMigration='20261116000100_application_rbac.sql'
const account='84000000-0000-0000-0000-000000000001'
const laterAccount='84000000-0000-0000-0000-000000000002'
let clean: PGlite,upgrade: PGlite
let before: unknown
let originalPolicies: unknown
let originalFunctions: unknown

async function user<T>(db:PGlite,action:()=>Promise<T>) {
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${account}'`)
 try{return await action()}finally{await db.exec('reset role;reset request.jwt.claim.sub')}
}
async function snapshot(db:PGlite) {
 const exported=await user(db,async()=>(await db.query<{backup:{tables:unknown}}> ('select public.export_library_backup() backup')).rows[0].backup.tables)
 const reader=(await db.query('select * from public.reader_cloud_values order by key')).rows
 const links=(await db.query('select * from public.reader_organizer_links')).rows
 const storage=(await db.query('select bucket_id,name from storage.objects order by name')).rows
 const approvals=(await db.query('select * from public.beta_signup_allowlist order by email')).rows
 return {exported,reader,links,storage,approvals}
}
async function seedExistingAccount(db:PGlite) {
 await db.query("insert into auth.users(id,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,now(),'{\"role\":\"owner\"}','{\"role\":\"admin\"}')",[account])
 await db.query("insert into public.beta_signup_allowlist(email) values('s4-existing@example.test')")
 await user(db,async()=>{
  for(const url of ['https://archiveofourown.org/works/8844001','https://synthetic.example/s4-existing'])await db.query("select public.save_library_story($1,$2::jsonb,'reading',1,'Synthetic existing notes',4::smallint,true,'{}'::uuid[],array['Synthetic Tag'])",[url,JSON.stringify({title:'Synthetic Existing Story',published_chapters:3,total_chapters:5,publication_status:'in_progress',chapter_count_manual:true})])
  await db.query("select public.submit_import_urls(array['https://archiveofourown.org/works/8844002'])")
  await db.query("select public.reader_organizer_connection('enable')")
  await db.query('select public.reader_cloud_apply($1,$2,$3,0)',[randomUUID(),`${'a'.repeat(64)}/notes`,JSON.stringify('Synthetic existing reader note')])
 })
 await db.query("insert into storage.objects(bucket_id,name) values('reader-epubs',$1),('library-backups',$2)",[`${account}/${'a'.repeat(64)}.epub`,`${account}/synthetic-existing.json`])
}
beforeAll(async()=>{
 clean=await createTestDatabase()
 upgrade=await createTestDatabase({beforeMigration:releaseMigration})
 await seedExistingAccount(upgrade)
 before=await snapshot(upgrade)
 originalPolicies=(await upgrade.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")).rows
 originalFunctions=(await upgrade.query("select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by signature")).rows
 await upgrade.exec(await readFile(new URL(`../migrations/${releaseMigration}`,import.meta.url),'utf8'))
},30000)
afterAll(async()=>{await clean?.close();await upgrade?.close()})

it('replays the entire ordered migration chain on a fresh embedded PostgreSQL database',async()=>{
 const names=(await readdir(new URL('../migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort()
 expect(names).toHaveLength(138)
 expect(new Set(names.map(name=>name.split('_')[0])).size).toBe(names.length)
 expect(names.at(-1)).toBe('20261118000300_crosspost_organization.sql')
 const catalog=await privacyCatalog(async(sql:string)=>(await clean.query(sql)).rows)
 expect(catalog.relations.filter((table:{kind:string})=>table.kind==='r')).toHaveLength(57)
 expect(catalog.relations.filter((table:{kind:string})=>table.kind==='v')).toHaveLength(4)
 expect((await clean.query('select * from public.user_roles')).rows).toEqual([])
 expect((await clean.query('select * from public.admin_audit_logs')).rows).toEqual([])
})
it('preserves populated pre-S2 account, queue, source, reader, Storage metadata and beta approvals',async()=>{
 expect(await snapshot(upgrade)).toEqual(before)
 expect((await upgrade.query<{role_id:string}>('select role_id from public.user_roles where user_id=$1',[account])).rows[0].role_id).toBe('user')
})
it('preserves every existing personal-data policy and SQL function across the additive upgrade',async()=>{
 expect((await upgrade.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")).rows).toEqual(originalPolicies)
 const functions=(await upgrade.query<{signature:string;definition:string}>("select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by signature")).rows
 for(const original of originalFunctions as {signature:string;definition:string}[])expect(functions.find(fn=>fn.signature===original.signature)).toEqual(original)
})
it('keeps the sole existing account usable before and after controlled owner bootstrap',async()=>{
 await expect(upgrade.query('select public.app_owner_maintenance($1,$2,$3,$4)',[randomUUID(),'bootstrap_owner',account,'S4_LOCAL_TEST'])).rejects.toThrow('MFA-enrolled')
 expect(await user(upgrade,async()=>(await upgrade.query<{n:number}>('select count(*)::integer n from public.library_entries')).rows[0].n)).toBe(3)
 await upgrade.query("insert into auth.mfa_factors(id,user_id,factor_type,status) values($1,$2,'totp','verified')",[randomUUID(),account])
 await upgrade.query('select public.app_owner_maintenance($1,$2,$3,$4)',[randomUUID(),'bootstrap_owner',account,'S4_LOCAL_TEST'])
 expect(await user(upgrade,async()=>(await upgrade.query<{r:{role:string}}>('select public.app_access() r')).rows[0].r.role)).toBe('owner')
 await user(upgrade,async()=>{
  expect((await upgrade.query('select id from public.library_entries')).rows).toHaveLength(3)
  await upgrade.query("update public.library_entries set notes='Synthetic after bootstrap' where original_url='https://synthetic.example/s4-existing'")
 })
 expect((await upgrade.query("select role_id from public.user_roles where role_id='owner'")).rows).toHaveLength(1)
 await upgrade.query("insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values($1,now(),'{\"role\":\"owner\"}')",[laterAccount])
 expect((await upgrade.query<{role_id:string}>('select role_id from public.user_roles where user_id=$1',[laterAccount])).rows[0].role_id).toBe('user')
})

it('upgrades the populated observed production prefix through both Universal dependencies and S2',async()=>{
 const firstPending='20261112000300_chapter_total_review.sql'
 const db:PGlite=await createTestDatabase({beforeMigration:firstPending})
 try {
  await seedLargeLibraries(db,501,2)
  await seedExistingAccount(db)
  await db.exec(`
   delete from public.library_search_documents where id=(select id from public.library_entries order by id desc limit 1);
   create temporary table chapter_review_batches(updated integer);
   create function pg_temp.record_chapter_review_batch() returns trigger language plpgsql as $$
   begin
    insert into chapter_review_batches select count(*)::integer from updated_documents;
    return null;
   end $$;
   create trigger record_chapter_review_batch after update on public.library_search_documents
    referencing new table as updated_documents for each statement execute function pg_temp.record_chapter_review_batch();
  `)
  const prior=await snapshot(db)
  const backup=async()=>user(db,async()=>(await db.query<{backup:{version:number}}>('select public.export_library_backup() backup')).rows[0].backup)
  expect((await backup()).version).toBe(1)
  const pending=(await readdir(new URL('../migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')&&name>=firstPending).sort()
  expect(pending).toEqual([
   firstPending,
   '20261112000400_universal_backup_compatibility.sql',
   releaseMigration,
   '20261117000100_tag_text_color.sql',
   '20261117000200_guard_finished_chapter_increases.sql',
   '20261117000300_site_mappings.sql',
   '20261117000400_tag_classification_rules.sql',
   '20261117000500_site_bulk_import.sql',
   '20261118000100_crosspost_stories.sql',
   '20261118000200_crosspost_chapter_groups.sql',
   '20261118000300_crosspost_organization.sql',
  ])
  await db.exec("set statement_timeout='45s'")
  await db.exec(await readFile(new URL(`../migrations/${firstPending}`,import.meta.url),'utf8'))
  expect((await db.query('show statement_timeout')).rows).toEqual([{statement_timeout:'45s'}])
  expect((await db.query('select updated from chapter_review_batches order by updated desc')).rows)
   .toEqual([{updated:500},{updated:500},{updated:4}])
  await db.exec('drop trigger record_chapter_review_batch on public.library_search_documents')
  for(const name of pending.slice(1))await db.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'))
  const {rows}=await db.query(`
   select count(*)::integer as entries,
    count(*) filter (where d.story->'metadataConfidence'=jsonb_build_object(
     'published_chapters',public.story_field_confidence(d.story,'published_chapters'),
     'publication_status',public.story_field_confidence(d.story,'publication_status')
    ))::integer as refreshed
   from public.library_entries e left join public.library_search_documents d on d.id=e.id
  `)
  expect(rows).toEqual([{entries:1005,refreshed:1005}])
  expect(await snapshot(db)).toEqual(prior)
  expect((await backup()).version).toBe(2)
  expect((await db.query<{role_id:string}>('select role_id from public.user_roles where user_id=$1',[account])).rows[0].role_id).toBe('user')
  expect((await db.query("select * from public.user_roles where role_id='owner'")).rows).toEqual([])
 }finally{await db.close()}
},60000)
