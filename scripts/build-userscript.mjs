import { brandName, brandSlug } from '../src/lib/brand.ts'
import { build, loadEnv } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookOpen } from 'lucide-react'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { join } from 'node:path'
import { readPublicConfig } from '../src/lib/config.ts'

// Keep --hosted compatible with older build commands; hosted validation is always enforced.
const { values } = parseArgs({ options: { outDir: { type: 'string', default: 'userscript/dist' }, hosted: { type: 'boolean', default: false } } })
// Every entrypoint uses the hosted settings; explicit CI environment values still take precedence.
try { process.loadEnvFile('.env.local.hosted') } catch (error) { if (error.code !== 'ENOENT') throw error }
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
const config = readPublicConfig(env)
if (!config) throw new Error('Configure the public Supabase URL and publishable/anon key.')
const backend = new URL(config.url)
const app = new URL(env.EXTENSION_APP_ORIGIN ?? 'http://127.0.0.1:5173')
for (const url of [backend, app]) {
 if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Safari userscripts require hosted HTTPS backend and app origins. Configure .env.local.hosted; local builds are not supported.')
 if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure origins without paths or credentials.')
}
const version = JSON.parse(await readFile('package.json', 'utf8')).version
const metadata = `// ==UserScript==
// @name ${brandName}
// @description Save reading progress and private library details on AO3.
// @version ${version}
// @match https://archiveofourown.org/*
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
 'process.env.NODE_ENV': JSON.stringify('production'),
 __SUPABASE_URL__: JSON.stringify(backend.origin), __SUPABASE_KEY__: JSON.stringify(config.key),
 __BRAND_ICON__: JSON.stringify(renderToStaticMarkup(createElement(BookOpen, { size: 23, strokeWidth: 1.6, 'aria-hidden': true }))),
 __APP_ORIGIN__: JSON.stringify(app.origin), __SCRIPT_VERSION__: JSON.stringify(version),
}, build: { outDir: values.outDir, emptyOutDir: true, minify: false,
 lib: { entry: 'companions/safari/content.js', name: 'BeyondTheArchives', formats: ['iife'], fileName: () => `${brandSlug}.user.js` },
} })
// Vite's final transform can strip Rollup comments; Userscripts requires this
// header at the start of the actual installable file.
const scriptPath = join(values.outDir, `${brandSlug}.user.js`)
await writeFile(scriptPath, metadata + await readFile(scriptPath, 'utf8'))
await writeFile(join(values.outDir, `${brandSlug}.meta.js`), metadata)
console.log(`Userscript v${version} built in ${values.outDir}. Install ${brandSlug}.user.js in Userscripts.`)
