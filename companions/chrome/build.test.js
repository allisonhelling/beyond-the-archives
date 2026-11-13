// @vitest-environment node
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

it('loads hosted settings by default, preserves local builds, and rejects mixed targets', async () => {
 const project = fileURLToPath(new URL('../../', import.meta.url))
 const directory = await mkdtemp(join(tmpdir(), 'ao3-extension-config-'))
 const env = { ...process.env }
 for (const key of Object.keys(env)) if (key.startsWith('VITE_') || key.startsWith('EXTENSION_')) delete env[key]
 const build = (args = [], overrides = {}) => execFileSync(process.execPath, ['--experimental-strip-types', join(project, 'scripts/build-extension.mjs'), ...args], { cwd: directory, env: { ...env, ...overrides }, stdio: 'pipe' })
 try {
  for (const path of ['src', 'companions', 'node_modules']) await symlink(join(project, path), join(directory, path), 'dir')
  await writeFile(join(directory, '.env.local'), 'VITE_APP_ENV=local\nVITE_SUPABASE_PROJECT_REF=local\nVITE_ORGANIZER_URL=http://127.0.0.1:5173/\nVITE_READER_URL=http://127.0.0.1:5174/\nVITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_test\nEXTENSION_APP_ORIGIN=https://library-test.example\nEXTENSION_LOCAL_APP_ORIGIN=http://127.0.0.1:5173\n')
  await writeFile(join(directory, '.env.local.hosted'), 'VITE_APP_ENV=staging\nVITE_SUPABASE_PROJECT_REF=extension-test\nVITE_ORGANIZER_URL=https://library-test.example/\nVITE_READER_URL=https://reader-test.example/\nVITE_SUPABASE_URL=https://extension-test.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_hosted_test\nEXTENSION_APP_ORIGIN=https://library-test.example\n')
  build()
  const hosted = JSON.parse(await readFile(join(directory, 'extension/dist/manifest.json'), 'utf8'))
  expect(hosted.name).toBe('Beyond the Archives Companion')
  expect(hosted.host_permissions).toContain('https://extension-test.supabase.co/*')
  expect(hosted.externally_connectable.matches).toEqual(['https://library-test.example/*'])
  expect(hosted.options_ui.page).toBe('options.html')
  expect(hosted.content_scripts[0].matches).toEqual(['https://archiveofourown.org/*'])
  for (const file of ['background.js', 'content.js']) {
   const source = await readFile(join(directory, 'extension/dist', file), 'utf8')
   expect(source).toContain('https://extension-test.supabase.co')
   expect(source).not.toContain('http://127.0.0.1:54321')
  }
  build(['--local'])
  const local = JSON.parse(await readFile(join(directory, 'extension/local/dist/manifest.json'), 'utf8'))
  expect(local.name).toBe('Beyond the Archives Companion (Local)')
  expect(local.host_permissions).toContain('http://127.0.0.1:54321/*')
  expect(local.externally_connectable.matches).toEqual(['http://127.0.0.1:5173/*'])
  expect(local.host_permissions).not.toContain('https://extension-test.supabase.co/*')
  expect(await readFile(join(directory, 'extension/local/dist/background.js'),'utf8')).not.toContain('sb_publishable_hosted_test')
  expect(() => build(['--outDir', 'rejected'], { VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow()
  await expect(readFile(join(directory, 'rejected/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
 } finally { await rm(directory, { recursive: true, force: true }) }
}, 45000)
