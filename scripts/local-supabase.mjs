import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { assertLocalProject, verifiedLocalTarget, localProjectRoot, localCliEnvironment, validateLocalEdgeSettings } from './local-target.mjs'

export function localCommand(args) {
 if (args.length !== 1) throw new Error('Choose one local command; extra flags and remote targets are forbidden.')
 const commands = { start: ['start'], stop: ['stop'], reset: ['db','reset','--local','--yes'], migrate: ['migration','up','--local'], lint: ['db','lint','--local','--level','warning'], types: ['gen','types','typescript','--local'], serve: ['functions','serve','--env-file','supabase/.env.local'] }
 if (!Object.hasOwn(commands,args[0])) throw new Error('Unsupported local command. Hosted commands are not enabled in S1.')
 return commands[args[0]]
}
export async function runLocalCommand(args, run = spawnSync) {
 const command = localCommand(args)
 await assertLocalProject()
 // No CLI link or user-supplied URL is used. Reject ambient hosted targets even
 // for startup; never pass server or management credentials to the child process.
 if (process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) await verifiedLocalTarget({ url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY })
 if (!['start','stop'].includes(args[0])) await verifiedLocalTarget()
 if (args[0]==='serve') {
  const settings=await readFile(new URL('../supabase/.env.local',import.meta.url),'utf8')
  validateLocalEdgeSettings(settings)
 }
 const env = localCliEnvironment()
 const result = run('npx',['supabase',...command],{ encoding:'utf8',cwd:localProjectRoot,env,timeout:args[0]==='serve'?undefined:args[0]==='start'?300000:180000,maxBuffer:16*1024*1024 })
 if (result.status !== 0) throw new Error('Local Supabase command failed. Inspect the local daemon/configuration; credential-bearing CLI output is withheld.')
 if (args[0]==='types') await writeFile(new URL('../src/types/database.ts',import.meta.url),result.stdout)
 console.log('Local Supabase command completed; no hosted target was used.')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try { await runLocalCommand(process.argv.slice(2)) } catch { console.error('Local Supabase command refused or failed. Check the synthetic local stack; remote flags and credentials are forbidden.'); process.exitCode=1 }
}
