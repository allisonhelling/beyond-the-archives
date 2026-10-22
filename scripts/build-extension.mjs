import { build, loadEnv } from 'vite'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { readPublicConfig } from '../src/lib/config.ts'

const { values } = parseArgs({ options: { outDir: { type: 'string', default: 'extension/dist' } } })
const outDir = values.outDir
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
const config = readPublicConfig(env)
if (!config) throw new Error('Set the public Supabase URL and publishable/anon key; never use a server key.')
const app = new URL(env.EXTENSION_APP_ORIGIN ?? 'http://127.0.0.1:5173')
const backend = new URL(config.url)
for (const url of [app, backend]) {
 if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use HTTPS or local development origins.')
 if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure origins without paths or credentials.')
}
await build({
 configFile: false,
 define: { __APP_ORIGIN__: JSON.stringify(app.origin), __SUPABASE_URL__: JSON.stringify(backend.origin), __SUPABASE_KEY__: JSON.stringify(config.key) },
 build: { outDir, emptyOutDir: true, minify: false, lib: { entry: 'extension/background.js', formats: ['es'], fileName: () => 'background.js' } },
})
await writeFile(join(outDir, 'manifest.json'), JSON.stringify({
 manifest_version: 3, name: 'AO3 Library Companion', version: '0.2.0', minimum_chrome_version: '120',
 description: 'Imports requested works and scans AO3 Bookmarks or Marked for Later from your connected library.',
 permissions: ['storage', 'unlimitedStorage', 'alarms', 'scripting', 'webNavigation'],
 host_permissions: ['https://archiveofourown.org/*', `${backend.origin}/*`],
 externally_connectable: { matches: [`${app.origin}/*`] },
 background: { service_worker: 'background.js', type: 'module' },
 action: { default_title: 'Open library extension settings' },
}, null, 2) + '\n')
console.log(`Extension built in ${outDir} for ${app.origin}.`)
