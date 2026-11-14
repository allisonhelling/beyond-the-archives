import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// A dependency-free static page used only to obtain actual Git branch aliases.
const root = fileURLToPath(new URL('../', import.meta.url))
if (process.argv.length !== 2 || ![resolve(root), resolve(root, 'reader')].includes(process.cwd())) throw new Error('Bootstrap requires a known application root and accepts no arguments.')
if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'staging' || (process.env.VERCEL_TARGET_ENV && process.env.VERCEL_TARGET_ENV !== 'preview')) throw new Error('Bootstrap requires verified provider metadata for the staging branch in Preview.')
for (const [name, value] of Object.entries(process.env)) {
  if (value && (/^(SUPABASE_(SERVICE_ROLE_KEY|SECRET_KEY|ACCESS_TOKEN|DB_.*)|DATABASE_URL)$/.test(name) || value.startsWith('sb_secret_'))) throw new Error('Bootstrap refuses privileged backend or management credentials.')
}
const output = resolve(process.cwd(), '.staging-bootstrap')
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staging Setup</title><h1>Staging Setup</h1><p>The staging applications are being configured. Account access is unavailable.</p></html>\n', { flag: 'wx' })
console.log('Prepared static staging bootstrap output without initializing applications or backend clients.')
