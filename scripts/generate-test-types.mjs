import { writeFile } from 'node:fs/promises'
import { createTestDatabase } from './test-database.mjs'

const db = await createTestDatabase()
try {
  const { rows: columns } = await db.query(`select table_name, column_name, udt_name, is_nullable, column_default
    from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`)
  const { rows: enums } = await db.query(`select t.typname as name, e.enumlabel as value from pg_enum e
    join pg_type t on t.oid = e.enumtypid order by e.enumsortorder`)
  const types = { uuid: 'string', text: 'string', _text: 'string[]', timestamptz: 'string', int8: 'number', int4: 'number', int2: 'number', bool: 'boolean', jsonb: 'Json' }
  const enumNames = new Set(enums.map(e => e.name))
  let output = '// Generated from versioned migrations by npm run db:types:embedded.\n// After linking Supabase, use npm run db:types for the authoritative remote types.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]\n\nexport type Database = {\n  public: {\n    Tables: {\n'
  for (const table of [...new Set(columns.map(c => c.table_name))]) {
    const fields = columns.filter(c => c.table_name === table)
    const fieldType = c => (types[c.udt_name] ?? (enumNames.has(c.udt_name) ? `Database['public']['Enums']['${c.udt_name}']` : 'never')) + (c.is_nullable === 'YES' ? ' | null' : '')
    output += `      ${table}: {\n        Row: {\n${fields.map(c => `          ${c.column_name}: ${fieldType(c)}`).join('\n')}\n        }\n`
    for (const mode of ['Insert', 'Update']) {
      output += `        ${mode}: {\n${fields.map(c => `          ${c.column_name}${mode === 'Update' || c.column_default || c.is_nullable === 'YES' ? '?' : ''}: ${fieldType(c)}`).join('\n')}\n        }\n`
    }
    const { rows: relations } = await db.query(`select c.conname as name, a.attname as col, ft.relname as target, fa.attname as target_col
      from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid=t.relnamespace
      join pg_class ft on ft.oid=c.confrelid join pg_namespace fn on fn.oid=ft.relnamespace
      cross join lateral unnest(c.conkey, c.confkey) as keys(col, target_col)
      join pg_attribute a on a.attrelid=t.oid and a.attnum=keys.col
      join pg_attribute fa on fa.attrelid=ft.oid and fa.attnum=keys.target_col
      where c.contype='f' and n.nspname='public' and fn.nspname='public' and t.relname=$1`, [table])
    output += '        Relationships: [\n'
    for (const name of [...new Set(relations.map(r => r.name))]) {
      const group = relations.filter(r => r.name === name)
      output += `          { foreignKeyName: '${name}'; columns: [${group.map(r => `'${r.col}'`).join(', ')}]; isOneToOne: false; referencedRelation: '${group[0].target}'; referencedColumns: [${group.map(r => `'${r.target_col}'`).join(', ')}] },\n`
    }
    output += '        ]\n      }\n'
  }
  output += `    }
    Views: { [_ in never]: never }
    Functions: {
      review_import_reading: { Args: { p_ids?: string[]; p_action?: string; p_page?: number }; Returns: Json }
      mark_work_deleted: { Args: { p_entry: string; p_job: string }; Returns: undefined }
      claim_backup_save: { Args: { p_user: string; p_create: boolean }; Returns: Json }
      release_backup_save: { Args: { p_user: string; p_token: string }; Returns: undefined }
      backup_storage_files: { Args: { p_user: string }; Returns: Json }
      preview_library_restore: { Args: { p_backup: Json }; Returns: Json }
      restore_own_library_backup: { Args: { p_backup: Json; p_fingerprint: string; p_safety_path: string }; Returns: Json }
      export_library_backup: { Args: Record<string, never>; Returns: Json }
      restore_library_backup: { Args: { p_backup: Json; p_user: string; p_replace?: boolean }; Returns: Json }
      paged_import_history: { Args: { p_batch?: string; p_history_page?: number; p_result_page?: number; p_status?: string }; Returns: Json }
      library_revision: { Args: Record<string, never>; Returns: number }
      library_navigation_snapshot: { Args: Record<string, never>; Returns: Json }
      library_navigation: { Args: Record<string, never>; Returns: Json }
      library_query_facets: { Args: { p_query?: Json }; Returns: Json }
      library_catalog: { Args: Record<string, never>; Returns: Json }
      library_story_details: { Args: { p_ids: string[] }; Returns: Json }
      query_library: { Args: { p_query?: Json; p_page?: number; p_size?: number }; Returns: Json }
      update_library_series: { Args: { p_series: number; p_input: Json; p_base: Json }; Returns: undefined }
      finish_library_series: { Args: { p_series: number }; Returns: number }
      ensure_library_series: { Args: { p_series: number; p_title: string }; Returns: undefined }
      remove_library_series_details: { Args: { p_series: number }; Returns: undefined }
      remember_library_series: { Args: { p_metadata: Json }; Returns: string }
      save_library_series_note: { Args: { p_series: number; p_notes: string; p_base: string }; Returns: undefined }
      manage_userscript_device: { Args: { p_action: string; p_name?: string; p_id?: string }; Returns: Json }
      dnf_cleanup: { Args: { p_action?: string; p_input?: Json; p_page?: number }; Returns: Json }
      run_scheduled_dnf_cleanup: { Args: Record<string, never>; Returns: number }
      library_sync_report_history: { Args: { p_report?: Json; p_page?: number }; Returns: Json }
      personal_rating_settings: { Args: { p_input?: Json }; Returns: Json }
      userscript_library: { Args: { p_secret: string; p_action: string; p_work?: number; p_input?: Json }; Returns: Json }
      preview_ao3_csv_import: { Args: { p_work_ids: number[]; p_bookmark_ids?: number[] }; Returns: Json }
      submit_ao3_csv_import: { Args: { p_rows: Json }; Returns: Json }
      submit_ao3_library_sync: { Args: { p_rows: Json; p_scan_id?: string; p_source_url?: string }; Returns: Json }
      submit_import_urls: { Args: { p_urls: string[]; p_update_reading_location?: boolean; p_reading_status?: Database['public']['Enums']['reading_status']; p_series_ids?: number[] }; Returns: string | null }
      cancel_import_batch: { Args: { p_batch: string }; Returns: undefined }
      retry_metadata_job: { Args: { p_job: string }; Returns: undefined }
      ao3_source_target: { Args: { p_url: string }; Returns: string }
      metadata_job_archive_source: { Args: { p_job: string }; Returns: string | null }
      claim_extension_job: { Args: Record<string, never>; Returns: Json }
      approve_import_progress: { Args: { p_item: string }; Returns: undefined }
      clear_metadata_override: { Args: { p_entry: string; p_field: string }; Returns: undefined }
      reorder_collections: { Args: { p_ids: string[] }; Returns: undefined }
      restore_library_story: { Args: { p_entry: Json; p_collections: string[]; p_tags: string[] }; Returns: string }

      save_library_story_checked: { Args: { p_id: string | null; p_url: string; p_input: Json; p_base: Json | null }; Returns: string }
      update_library_entry_checked: { Args: { p_id: string; p_input: Json; p_base: Json }; Returns: undefined }
      save_library_story: {
        Args: { p_url: string; p_metadata: Json; p_status: Database['public']['Enums']['reading_status']; p_progress: number; p_notes: string; p_rating: number | null; p_favorite: boolean; p_collections: string[]; p_tags: string[]; p_id?: string | null }
        Returns: string
      }
    }
    Enums: {\n`
  for (const name of enumNames) output += `      ${name}: ${enums.filter(e => e.name === name).map(e => `'${e.value}'`).join(' | ')}\n`
  output += '    }\n    CompositeTypes: { [_ in never]: never }\n  }\n}\n'
  await writeFile(new URL('../src/types/database.ts', import.meta.url), output)
  console.log('Generated types from all migrated tables.')
} finally { await db.close() }
