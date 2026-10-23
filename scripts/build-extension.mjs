import { build, loadEnv } from 'vite'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { localExtensionKey, localExtensionId } from '../src/features/imports/extension-config.ts'
import { isLocalHostname } from '../src/lib/local-app.ts'
import { readPublicConfig } from '../src/lib/config.ts'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookOpen } from 'lucide-react'

const { values } = parseArgs({ options: { outDir: { type: 'string' }, local: { type: 'boolean', default: false } } })
const outDir = values.outDir ?? (values.local ? 'extension/local/dist' : 'extension/dist')
const env = { ...loadEnv(values.local ? 'development' : 'production', process.cwd(), ''), ...process.env }
const config = readPublicConfig(env)
if (!config) throw new Error('Set the public Supabase URL and publishable/anon key; never use a server key.')
const app = new URL((values.local ? env.EXTENSION_LOCAL_APP_ORIGIN : env.EXTENSION_APP_ORIGIN) ?? 'http://127.0.0.1:5173')
if (values.local && !isLocalHostname(app.hostname)) throw new Error('Local extension builds require a loopback website origin.')
const backend = new URL(config.url)
for (const url of [app, backend]) {
 if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use HTTPS or local development origins.')
 if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure origins without paths or credentials.')
}
const version = '0.6.0'
const define = {
 'process.env.NODE_ENV': JSON.stringify('production'),
 __APP_ORIGIN__: JSON.stringify(app.origin), __SUPABASE_URL__: JSON.stringify(backend.origin), __SUPABASE_KEY__: JSON.stringify(config.key),
 __SCRIPT_VERSION__: JSON.stringify(version),
 __BRAND_ICON__: JSON.stringify(renderToStaticMarkup(createElement(BookOpen, { size: 23, strokeWidth: 1.6, 'aria-hidden': true }))),
}
await build({
 configFile: false, define,
 build: { outDir, emptyOutDir: true, minify: false, lib: { entry: 'extension/background.js', formats: ['es'], fileName: () => 'background.js' } },
})
await build({
 configFile: false, define,
 build: { outDir, emptyOutDir: false, minify: false, lib: { entry: 'extension/content.js', name: 'AO3LibraryBar', formats: ['iife'], fileName: () => 'content.js' } },
})
await writeFile(join(outDir, 'manifest.json'), JSON.stringify({
 ...(values.local ? { key: localExtensionKey } : {}),
 manifest_version: 3, name: values.local ? 'AO3 Library Companion (Local)' : 'AO3 Library Companion', version, minimum_chrome_version: '120',
 description: 'Save and edit works directly on AO3, import requested metadata, and scan lists from your connected library.',
 permissions: ['storage', 'unlimitedStorage', 'alarms', 'scripting', 'webNavigation'],
 host_permissions: ['https://archiveofourown.org/*', `${backend.origin}/*`],
 externally_connectable: { matches: [`${app.origin}/*`] },
 background: { service_worker: 'background.js', type: 'module' },
 content_scripts: [{ matches: ['https://archiveofourown.org/works/*', 'https://archiveofourown.org/series/*'], js: ['content.js'], run_at: 'document_end', all_frames: false }],
 action: { default_title: 'Open library extension settings' },
}, null, 2) + '\n')
console.log(`Extension built in ${outDir} for ${app.origin}.${values.local ? ` Local extension ID: ${localExtensionId}` : ''}`)
