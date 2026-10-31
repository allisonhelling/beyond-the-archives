import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

// Actual embedded PostgreSQL, with a minimal Supabase Auth contract for local SQL tests.
// Includes the minimal Storage metadata contract for policy tests, not the
// Storage HTTP service/blob store, GoTrue, PostgREST, Edge Functions or Docker.
export async function createTestDatabase() {
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()
  const versions = new Set()
  for (const name of migrations) {
    const version = name.split('_')[0]
    if (versions.has(version)) throw new Error(`Duplicate migration version ${version}: ${name}`)
    versions.add(version)
  }
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, invited_at timestamptz, email_confirmed_at timestamptz, is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text not null unique, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text not null, owner_id text, metadata jsonb, created_at timestamptz not null default now(), unique(bucket_id,name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
  `)
  for (const name of migrations) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  }
  return db
}
