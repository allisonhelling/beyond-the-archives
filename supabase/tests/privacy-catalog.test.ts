// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared migration harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
// @ts-expect-error Shared metadata-only catalog for embedded and real PostgreSQL.
import { privacyCatalog } from '../../scripts/privacy-catalog.mjs'

let db: PGlite
type Relation = { name: string; kind: string; rls: boolean; force_rls: boolean; reloptions: string[] | null; user_owned: boolean }
type Definer = { signature: string; trigger_only: boolean; config: string[]; anon_execute: boolean; authenticated_execute: boolean }
let catalog: { relations: Relation[]; policies: { qual: string | null; with_check: string | null }[]; definers: Definer[]; buckets: { id: string; public: boolean }[]; schemas: { can_create: boolean }[] }
beforeAll(async()=>{
 db=await createTestDatabase()
 catalog=await privacyCatalog(async(sql:string)=>(await db.query(sql)).rows)
},30000)
afterAll(async()=>{await db?.close()})

it('forces RLS on every table and preserves invoker security on all private views',()=>{
 expect(catalog.relations.filter(table=>table.kind==='r').every(table=>table.rls&&table.force_rls)).toBe(true)
 const views=catalog.relations.filter(table=>table.kind==='v')
 expect(views.map(view=>view.name).sort()).toEqual(['effective_collection_works','library_collection_documents','library_story_documents','reading_activity'])
 expect(views.every(view=>view.user_owned&&view.reloptions?.includes('security_invoker=true'))).toBe(true)
})
it('has no application-role exception in personal-data or Storage policies',()=>{
 for(const policy of catalog.policies) {
  const expression=`${policy.qual??''} ${policy.with_check??''}`
  expect(expression).not.toMatch(/\b(user_roles|app_roles|app_actor|app_access|admin_access)\b/)
 }
 expect(catalog.buckets.map(bucket=>bucket.id).sort()).toEqual(['library-backups','reader-epubs'])
 expect(catalog.buckets.every(bucket=>!bucket.public)).toBe(true)
})
it('restricts anonymous definer calls to the existing paired capability and trigger-only routines',()=>{
 expect(catalog.schemas).toHaveLength(6)
 expect(catalog.schemas.every(schema=>!schema.can_create)).toBe(true)
 expect(catalog.definers.filter(fn=>fn.anon_execute&&!fn.trigger_only).map(fn=>fn.signature)).toEqual(['userscript_library(text,text,bigint,jsonb)'])
 for(const fn of catalog.definers) {
  if(fn.config.includes('search_path=public')) {
   expect(fn.authenticated_execute).toBe(false)
   expect(fn.anon_execute).toBe(false)
   expect(['reserve_series_preview()','pause_series_preview(integer,text)']).toContain(fn.signature)
  } else expect(fn.config).toContain('search_path=""')
 }
})
it('keeps infrastructure, restoration and cross-account helper functions unavailable to application sessions',()=>{
 for(const signature of ['restore_library_backup(jsonb,uuid,boolean)','restore_library_backup_internal(jsonb,uuid,boolean,boolean)','backup_storage_files(uuid)','finish_metadata_job(uuid,uuid,jsonb,jsonb,text,text,boolean,integer)','store_tag_resolutions(uuid,jsonb)','reader_write_work_field(uuid,text,text,jsonb,text)','reader_reconcile_account(uuid)','app_owner_maintenance(uuid,text,uuid,text)','write_story_versions_internal(uuid,uuid,text,text,timestamp with time zone)']) {
  const fn=catalog.definers.find(fn=>fn.signature===signature)
  expect(fn,signature).toBeDefined()
  expect(fn?.authenticated_execute,signature).toBe(false)
  expect(fn?.anon_execute,signature).toBe(false)
 }
})
