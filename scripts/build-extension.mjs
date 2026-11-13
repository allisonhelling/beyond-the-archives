import { brandName } from '../src/lib/brand.ts'
import { build, loadEnv } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs, parseEnv } from 'node:util'
import { localExtensionKey, localExtensionId } from '../src/features/imports/extension-config.ts'
import { requireEnvironmentConfig, environmentOrigin } from '../src/lib/environment.ts'
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
// An artifact contains exactly one environment. Local builds never import a
// production host permission, key, origin or session from the hosted profile.
const selectedEnv = values.local ? localEnv : hostedEnv
const target = requireEnvironmentConfig(selectedEnv)
if (values.local !== (target.environment === 'local')) throw new Error('Extension build selection does not match its configured environment.')
const appOriginValue = values.local ? selectedEnv.EXTENSION_LOCAL_APP_ORIGIN : selectedEnv.EXTENSION_APP_ORIGIN
const selectedOrigin = environmentOrigin(appOriginValue, target.environment)
if (selectedOrigin !== target.organizerUrl) throw new Error('Extension origin does not match the configured organizer.')
const defaultId = values.local ? 'local' : 'hosted'
const profiles = { [defaultId]: { label: target.environment, appOrigin: selectedOrigin, backend: new URL(target.url).origin, publicKey: target.key } }
const { appOrigin, backend, publicKey } = profiles[defaultId]
const version = '0.7.8'
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
 build: { outDir, emptyOutDir: false, minify: false, lib: { entry: 'companions/chrome/content.js', name: 'BeyondTheArchivesBar', formats: ['iife'], fileName: () => 'content.js' } },
})
await build({
 configFile: false, define,
 build: { outDir, emptyOutDir: false, minify: false, lib: { entry: 'companions/chrome/options.js', formats: ['es'], fileName: () => 'options.js' } },
})
for (const file of ['options.html', 'options.css']) await writeFile(join(outDir, file), await readFile(`companions/chrome/${file}`, 'utf8'))
await writeFile(join(outDir, 'manifest.json'), JSON.stringify({
 ...(values.local ? { key: localExtensionKey } : {}),
 manifest_version: 3, name: `${brandName} Companion${values.local ? ' (Local)' : ''}`, version, minimum_chrome_version: '120',
 description: 'Save and edit works directly on AO3, import requested metadata, and scan lists from your connected library.',
 permissions: ['storage', 'unlimitedStorage', 'alarms', 'scripting', 'webNavigation'],
 host_permissions: ['https://archiveofourown.org/*', 'https://web.archive.org/*', ...new Set(Object.values(profiles).map(profile => `${profile.backend}/*`))],
 externally_connectable: { matches: Object.values(profiles).map(profile => `${profile.appOrigin}/*`) },
 options_ui: { page: 'options.html', open_in_tab: true },
 background: { service_worker: 'background.js', type: 'module' },
 content_scripts: [{ matches: ['https://archiveofourown.org/*'], js: ['content.js'], run_at: 'document_end', all_frames: false }],
 action: { default_title: 'Choose Hosted or Local Library' },
}, null, 2) + '\n')
console.log(`Extension built in ${outDir} for ${appOrigin}.${values.local ? ` Local extension ID: ${localExtensionId}` : ''}`)
