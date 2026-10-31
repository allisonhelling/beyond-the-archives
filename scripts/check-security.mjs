import { readdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

async function files(directory) {
  const items = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(items.map(item => item.isDirectory() ? files(`${directory}/${item.name}`) : `${directory}/${item.name}`))).flat()
}
const errors = []
for (const file of await files('src')) {
  if (file.includes('/test/') || file.includes('.test.') || !/\.(tsx?|css)$/.test(file)) continue
  const text = await readFile(file, 'utf8')
  if (/SUPABASE_(SERVICE_ROLE_KEY|SECRET_KEY)|sb_secret_|auth\.admin|from\s+['"][^'"]*server\//.test(text)) errors.push(`${file}: privileged frontend reference`)
  if (/dangerouslySetInnerHTML|eval\(/.test(text)) errors.push(`${file}: unsafe script or HTML execution`)
  for (const match of text.matchAll(/import\.meta\.env\.(VITE_\w+)/g)) {
    if (!['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SAMPLE_DATA', 'VITE_AO3_EXTENSION_ID', 'VITE_READER_URL', 'VITE_ORGANIZER_URL'].includes(match[1])) errors.push(`${file}: unexpected browser environment variable`)
  }
}
// A synthetic privileged credential must not survive a real production build.
const canary = 'ao3_security_canary_never_ship_93260871'
const rejected = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', env: {
  ...process.env, VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: `sb_secret_${canary}`,
} })
if (rejected.status === 0) errors.push('A privileged key mislabeled as public was accepted by the build')
const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', env: { ...process.env, SUPABASE_SECRET_KEY: canary, SUPABASE_SERVICE_ROLE_KEY: canary } })
if (build.status !== 0) errors.push(`Security canary build failed: ${build.stderr || build.stdout}`)
else {
  for (const file of await files('dist')) {
    const contents = await readFile(file, 'utf8')
    if (contents.includes(canary) || /sb_secret_[a-zA-Z0-9]{12,}/.test(contents)) errors.push(`${file}: secret in production bundle`)
  }
}
const ignored = await readFile('.gitignore', 'utf8')
if (!ignored.includes('.env.*') || !ignored.includes('!.env.example')) errors.push('Environment ignore rules are missing')
const config = await readFile('supabase/config.toml', 'utf8')
const auth = config.match(/^\[auth\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1] || ''
const email = config.match(/^\[auth\.email\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1] || ''
if (!/^enable_signup\s*=\s*false\s*$/m.test(auth) || !/^enable_anonymous_sign_ins\s*=\s*false\s*$/m.test(auth)) errors.push('Private account configuration missing')
if (!/^enable_signup\s*=\s*true\s*$/m.test(email)) errors.push('Email provider must remain enabled for invited users to sign in')
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
else console.log('Security checks passed: frontend boundary, privileged-key build rejection, production secret canary, environment exclusions, invite-only configuration.')
