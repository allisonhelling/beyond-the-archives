import { build, loadEnv } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs, parseEnv } from 'node:util'
import { localExtensionKey, localExtensionId } from '../src/features/imports/extension-config.ts'
import { isLocalHostname } from '../src/lib/local-app.ts'
import { readPublicConfig } from '../src/lib/config.ts'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookOpen } from 'lucide-react'

const { values } = parseArgs({ options: { outDir: { type: 'string' }, local: { type: 'boolean', default: false } } })
const outDir = values.outDir ?? (values.local ? 'extension/local/dist' : 'extension/dist')
// Read both profiles together; loading one must not overwrite the other's settings.
async function settings(path) {
 try { return parseEnv(await readFile(path, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error; return {} }
}
const [hostedFile, localFile] = await Promise.all([settings('.env.local.hosted'), settings('.env.local')])
const development = loadEnv('development', process.cwd(), '')
const hostedEnv = { ...loadEnv('production', process.cwd(), ''), ...hostedFile, ...(!values.local && process.env) }
const localEnv = { ...development, ...localFile, ...(values.local && process.env),
 ...(process.env.EXTENSION_LOCAL_SUPABASE_URL && { VITE_SUPABASE_URL: process.env.EXTENSION_LOCAL_SUPABASE_URL }),
 ...(process.env.EXTENSION_LOCAL_SUPABASE_PUBLISHABLE_KEY && { VITE_SUPABASE_PUBLISHABLE_KEY: process.env.EXTENSION_LOCAL_SUPABASE_PUBLISHABLE_KEY }),
 ...(process.env.EXTENSION_LOCAL_APP_ORIGIN && { EXTENSION_LOCAL_APP_ORIGIN: process.env.EXTENSION_LOCAL_APP_ORIGIN }),
}
const profiles = {}
function profile(id, env, appValue) {
 const config = readPublicConfig(env)
 if (!config) return
 const app = new URL(appValue ?? 'http://127.0.0.1:5173'), backend = new URL(config.url)
 if (id === 'hosted' && !isLocalHostname(app.hostname) && isLocalHostname(backend.hostname) && !values.local) throw new Error('Hosted extension builds cannot use a local Supabase backend. Configure .env.local.hosted or use --local for local development.')
 if (isLocalHostname(app.hostname) !== (id === 'local') || isLocalHostname(backend.hostname) !== (id === 'local')) return
 for (const url of [app, backend]) {
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHostname(url.hostname))) throw new Error('Use HTTPS or local development origins.')
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure origins without paths or credentials.')
 }
 profiles[id] = { label: id === 'hosted' ? 'Hosted' : 'Local', appOrigin: app.origin, backend: backend.origin, publicKey: config.key }
}
profile('hosted', hostedEnv, hostedEnv.EXTENSION_APP_ORIGIN)
profile('local', localEnv, localEnv.EXTENSION_LOCAL_APP_ORIGIN)
const defaultId = values.local ? 'local' : 'hosted'
if (!profiles[defaultId]) throw new Error(`Configure the ${defaultId} public Supabase URL, publishable key, and matching website origin.`)
const { appOrigin, backend, publicKey } = profiles[defaultId]
const version = '0.7.3'
const define = {
 __EXTENSION_ENVIRONMENTS__: JSON.stringify(profiles), __DEFAULT_ENVIRONMENT__: JSON.stringify(defaultId),
 'process.env.NODE_ENV': JSON.stringify('production'),
 __APP_ORIGIN__: JSON.stringify(appOrigin), __SUPABASE_URL__: JSON.stringify(backend), __SUPABASE_KEY__: JSON.stringify(publicKey),
 __SCRIPT_VERSION__: JSON.stringify(version),
 __BRAND_ICON__: JSON.stringify(renderToStaticMarkup(createElement(BookOpen, { size: 23, strokeWidth: 1.6, 'aria-hidden': true }))),
}
await build({
 configFile: false, define,
 build: { outDir, emptyOutDir: true, minify: false, lib: { entry: 'companions/chrome/background.js', formats: ['es'], fileName: () => 'background.js' } },
})
await build({
 configFile: false, define,
 build: { outDir, emptyOutDir: false, minify: false, lib: { entry: 'companions/chrome/content.js', name: 'AO3LibraryBar', formats: ['iife'], fileName: () => 'content.js' } },
})
await build({
 configFile: false, define,
 build: { outDir, emptyOutDir: false, minify: false, lib: { entry: 'companions/chrome/options.js', formats: ['es'], fileName: () => 'options.js' } },
})
for (const file of ['options.html', 'options.css']) await writeFile(join(outDir, file), await readFile(`companions/chrome/${file}`, 'utf8'))
await writeFile(join(outDir, 'manifest.json'), JSON.stringify({
 ...(values.local ? { key: localExtensionKey } : {}),
 manifest_version: 3, name: values.local ? 'AO3 Library Companion (Local)' : 'AO3 Library Companion', version, minimum_chrome_version: '120',
 description: 'Save and edit works directly on AO3, import requested metadata, and scan lists from your connected library.',
 permissions: ['storage', 'unlimitedStorage', 'alarms', 'scripting', 'webNavigation'],
 host_permissions: ['https://archiveofourown.org/*', ...new Set(Object.values(profiles).map(profile => `${profile.backend}/*`))],
 externally_connectable: { matches: Object.values(profiles).map(profile => `${profile.appOrigin}/*`) },
 options_ui: { page: 'options.html', open_in_tab: true },
 background: { service_worker: 'background.js', type: 'module' },
 content_scripts: [{ matches: ['https://archiveofourown.org/*'], js: ['content.js'], run_at: 'document_end', all_frames: false }],
 action: { default_title: 'Choose Hosted or Local Library' },
}, null, 2) + '\n')
console.log(`Extension built in ${outDir} for ${appOrigin}.${values.local ? ` Local extension ID: ${localExtensionId}` : ''}`)
