import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

// Actual embedded PostgreSQL, with a minimal Supabase Auth contract for local SQL tests.
// This does not emulate GoTrue, PostgREST, Edge Functions, or the Docker stack.
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
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `)
  for (const name of migrations) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  }
  return db
}
