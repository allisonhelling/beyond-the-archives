import { build, loadEnv } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { join } from 'node:path'
import { readPublicConfig } from '../src/lib/config.ts'

const { values } = parseArgs({ options: { outDir: { type: 'string', default: 'userscript/dist' } } })
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
const config = readPublicConfig(env)
if (!config) throw new Error('Configure the public Supabase URL and publishable/anon key.')
const backend = new URL(config.url)
const app = new URL(env.EXTENSION_APP_ORIGIN ?? 'http://127.0.0.1:5173')
for (const url of [backend, app]) {
 if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use HTTPS or local development origins.')
 if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure origins without paths or credentials.')
}
const version = JSON.parse(await readFile('package.json', 'utf8')).version
const metadata = `// ==UserScript==
// @name AO3 Library
// @description Save reading progress and private library details on AO3.
// @version ${version}
// @match https://archiveofourown.org/works/*
// @noframes
// @inject-into content
// @run-at document-end
// @grant GM.getValue
// @grant GM.setValue
// @grant GM.deleteValue
// @grant GM.xmlHttpRequest
// ==/UserScript==
`
await build({ configFile: false, define: {
 __SUPABASE_URL__: JSON.stringify(backend.origin), __SUPABASE_KEY__: JSON.stringify(config.key),
 __APP_ORIGIN__: JSON.stringify(app.origin), __SCRIPT_VERSION__: JSON.stringify(version),
}, build: { outDir: values.outDir, emptyOutDir: true, minify: false,
 lib: { entry: 'userscript/main.js', name: 'AO3Library', formats: ['iife'], fileName: () => 'ao3-library.user.js' },
} })
// Vite's final transform can strip Rollup comments; Userscripts requires this
// header at the start of the actual installable file.
const scriptPath = join(values.outDir, 'ao3-library.user.js')
await writeFile(scriptPath, metadata + await readFile(scriptPath, 'utf8'))
await writeFile(join(values.outDir, 'ao3-library.meta.js'), metadata)
console.log(`Userscript v${version} built in ${values.outDir}. Install ao3-library.user.js in Userscripts.`)
