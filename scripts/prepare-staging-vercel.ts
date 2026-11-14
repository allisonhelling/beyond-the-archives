import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { stagingBootstrapConfig, stagingVercelConfig } from './build-env.ts'

// Writes review artifacts only. Never links, uploads, edits active configs or loads env files.
const { values } = parseArgs({ options: { organizer: { type: 'string' }, reader: { type: 'string' }, bootstrap: { type: 'boolean', default: false } } })
if (values.bootstrap && (values.organizer || values.reader)) throw new Error('Bootstrap does not accept application origins.')
if (!values.bootstrap && (!values.organizer || !values.reader)) throw new Error('Supply both independently verified staging branch origins using --organizer and --reader. No origins are inferred.')
const candidates = await Promise.all((['organizer', 'reader'] as const).map(async app => {
  const source = new URL(app === 'organizer' ? '../vercel.json' : '../reader/vercel.json', import.meta.url)
  const original = JSON.parse(await readFile(source, 'utf8'))
  const config = values.bootstrap ? stagingBootstrapConfig(original, app) : stagingVercelConfig(original, values.organizer!, values.reader!, app)
  return { app, config }
}))
const output = new URL('../artifacts/staging/', import.meta.url)
await mkdir(output, { recursive: true })
for (const { app, config } of candidates) await writeFile(new URL(`${app}${values.bootstrap ? '.bootstrap' : ''}.vercel.json`, output), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' })
console.log('Prepared ignored staging header review artifacts. Active configuration and hosted settings are unchanged. Existing artifacts are never overwritten.')
