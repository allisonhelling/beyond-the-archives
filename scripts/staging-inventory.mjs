import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { stagingAuthFields, stagingManagementToken, stagingReadClient, verifiedStagingProject } from './staging-target.mjs'

const schemaQuery = `select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','supabase_migrations') and c.relkind in ('r','p') order by n.nspname,c.relname`

export async function migrationInventory(remote, directory = new URL('../supabase/migrations/', import.meta.url)) {
 const files = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()
 const digest = createHash('sha256')
 for (const file of files) digest.update(file + '\n').update(await readFile(new URL(file, directory)))
 const local = new Set(files.map(name => name.split('_')[0]))
 const applied = new Set(remote.map(row => String(row.version)))
 const unknown = [...applied].filter(version => !local.has(version))
 let gap = false
 const outOfOrder = files.some(file => { const exists = applied.has(file.split('_')[0]); if (!exists) gap = true; return exists && gap })
 return { count: files.length, sha256: digest.digest('hex'), applied: remote.map(row => ({ version: String(row.version), name: row.name })), pending: files.filter(file => !applied.has(file.split('_')[0])), unknownVersions: unknown, outOfOrder }
}

export async function stagingInventory(read) {
 const project = await verifiedStagingProject(read)
 const auth = await read('auth')
 const migrations = await migrationInventory(await read('migrations'))
 const tables = await read('query', schemaQuery)
 // Counts only: never read application rows, identities, emails, file paths, or contents.
 const counted = tables.filter(table => table.schema === 'public' || table.schema === 'auth' && table.name === 'users' || table.schema === 'storage' && ['buckets', 'objects'].includes(table.name))
 if (counted.some(table => !/^[a-z_][a-z0-9_]*$/.test(table.name))) throw new Error('Unexpected inventory identifier.')
 const counts = counted.length ? await read('query', counted.map(table => `select '${table.schema}.${table.name}' as relation, count(*)::text as count from "${table.schema}"."${table.name}"`).join(' union all ')) : []
 const buckets = tables.some(table => table.schema === 'storage' && table.name === 'buckets') ? await read('query', 'select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id') : []
 const policies = await read('query', "select schemaname, tablename, policyname, permissive, roles, cmd from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")
 const schedules = await read('query', "select exists(select 1 from pg_extension where extname='pg_cron') as cron_installed")
 const functions = await read('functions')
 const secrets = await read('secrets')
 const keys = await read('keys')
 let configuredKey
 try { configuredKey = parseEnv(await readFile(new URL('../.env.staging.local', import.meta.url), 'utf8')).VITE_SUPABASE_PUBLISHABLE_KEY } catch { /* Report an absent profile without guessing a key. */ }
 const smtpConfigured = Boolean(auth.smtp_host && auth.smtp_admin_email)
 return { capturedAt: new Date().toISOString(), mode: 'read-only', project, migrations, tables, counts, buckets, policies, schedules,
  auth: { ...Object.fromEntries(stagingAuthFields.filter(key => Object.hasOwn(auth, key)).map(key => [key, auth[key]])), smtpConfigured, emailHookConfigured: Boolean(auth.hook_send_email_enabled) },
  functions: functions.map(({ slug, name, status, version, verify_jwt }) => ({ slug, name, status, version, verify_jwt })),
  secretNames: secrets.map(secret => secret.name).sort(),
  keys: { configuredPublicKeyMatched: Boolean(configuredKey && keys.some(key => (key.api_key ?? key.key) === configuredKey)), count: keys.length },
 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try {
  if (process.argv.length !== 2) throw new Error('Staging inventory accepts no target overrides or extra flags.')
  const report = await stagingInventory(stagingReadClient({ token: stagingManagementToken() }))
  const directory = new URL('../artifacts/staging/', import.meta.url)
  await mkdir(directory, { recursive: true })
  const filename = `backend-inventory-${report.capturedAt.replaceAll(/[:.]/g, '-')}.json`
  await writeFile(new URL(filename, directory), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  console.log(JSON.stringify({ artifact: `artifacts/staging/${filename}`, project: report.project, appliedMigrations: report.migrations.applied.length, pendingMigrations: report.migrations.pending.length, unknownVersions: report.migrations.unknownVersions, outOfOrder: report.migrations.outOfOrder, tableCount: report.tables.length, counts: report.counts, functions: report.functions.length, smtpConfigured: report.auth.smtpConfigured, configuredPublicKeyMatched: report.keys.configuredPublicKeyMatched }))
 } catch (error) { console.error(error instanceof Error && /^(Staging|Unsupported|Unexpected)/.test(error.message) ? error.message : 'Staging inventory failed; credentials and remote response details withheld.'); process.exitCode = 1 }
}
