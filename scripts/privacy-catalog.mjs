// Metadata only: no Auth identities, library rows, object names or secret values.
export const privacyCatalogQueries = {
 relations: `select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,c.reloptions,
  exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped) as user_owned,
  has_table_privilege('anon',c.oid,'SELECT') as anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
  has_table_privilege('service_role',c.oid,'SELECT') as service_select,
  (select coalesce(jsonb_agg(a.attname),'[]') from pg_attribute a where a.attrelid=c.oid and a.attgenerated<>'') as generated_columns,
  (select jsonb_object_agg(op,has_table_privilege('authenticated',c.oid,op)) from unnest(array['INSERT','UPDATE','DELETE']) op) as writes,
  (select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and has_column_privilege('authenticated',c.oid,a.attname,'UPDATE')) as update_columns
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v') order by c.relname`,
 policies: `select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname`,
 relationships: `select c.conrelid::regclass::text as relation,c.conname as name,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f' order by c.conrelid::regclass::text,c.conname`,
 definers: `select p.oid::regprocedure::text as signature,p.prorettype='trigger'::regtype as trigger_only,p.proconfig as config,r.rolname as owner,r.rolsuper or r.rolbypassrls as owner_bypasses_rls,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.prosecdef order by p.oid::regprocedure::text`,
 principals: `select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated','service_role','supabase_auth_admin') order by rolname`,
 schemas: `select r.rolname,n.nspname,has_schema_privilege(r.rolname,n.oid,'CREATE') as can_create from pg_roles r cross join pg_namespace n where r.rolname in ('anon','authenticated') and n.nspname in ('public','auth','storage') order by r.rolname,n.nspname`,
 buckets: `select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id`,
}

export async function privacyCatalog(query) {
 const result={}
 for(const [name,sql] of Object.entries(privacyCatalogQueries))result[name]=await query(sql)
 return result
}
