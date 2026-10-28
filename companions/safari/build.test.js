// @vitest-environment node
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('builds a standalone installable file with a leading Userscripts header and public configuration only', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'ao3-userscript-'))
 try {
  const env = { ...process.env, VITE_SUPABASE_URL: 'https://userscript-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', EXTENSION_APP_ORIGIN: 'https://library-test.example', SUPABASE_SERVICE_ROLE_KEY: 'do_not_embed_this_canary' }
  execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-userscript.mjs', '--outDir', join(directory, 'dist')], { env, stdio: 'pipe' })
  const script = await readFile(join(directory, 'dist/beyond-the-archives.user.js'), 'utf8')
  expect(script.startsWith('// ==UserScript==\n')).toBe(true)
  expect(script).toContain('// @name Beyond the Archives')
  expect(script).toContain('// @inject-into content')
  expect(script).toContain('// @match https://archiveofourown.org/*')
  expect(script).toContain('// @grant GM.xmlHttpRequest')
  expect(script).not.toMatch(/__SUPABASE_|__APP_ORIGIN__|do_not_embed_this_canary|@require|@match \*/)
  expect(script).not.toContain('process.env.NODE_ENV')
  expect(script).toContain('https://userscript-test.supabase.co')
  expect(script).toContain('/rest/v1/rpc/userscript_library')
  expect(script).toContain('lucide-book-open')
  expect(() => execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-userscript.mjs', '--outDir', join(directory, 'rejected')], { env: { ...env, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_embed' }, stdio: 'pipe' })).toThrow()
 } finally { await rm(directory, { recursive: true, force: true }) }
}, 15000)

it('rejects loopback backends and app links in every userscript build before creating an artifact', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'ao3-userscript-hosted-'))
 try {
  const base = { ...process.env, VITE_SUPABASE_URL: 'https://userscript-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', EXTENSION_APP_ORIGIN: 'https://library-test.example' }
  for (const args of [[], ['--hosted']]) for (const patch of [{ VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }, { EXTENSION_APP_ORIGIN: 'http://localhost:5173' }, { VITE_SUPABASE_URL: 'https://localhost' }, { VITE_SUPABASE_URL: 'https://[::1]' }]) {
   expect(() => execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-userscript.mjs', ...args, '--outDir', join(directory, 'rejected')], { env: { ...base, ...patch }, stdio: 'pipe' })).toThrow('Safari userscripts require hosted HTTPS backend and app origins')
  }
  await expect(readFile(join(directory, 'rejected/beyond-the-archives.user.js'))).rejects.toMatchObject({ code: 'ENOENT' })
 } finally { await rm(directory, { recursive: true, force: true }) }
},30000)
