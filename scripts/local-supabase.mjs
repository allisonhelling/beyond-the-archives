import { spawnSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { assertLocalProject, verifiedLocalTarget, localProjectRoot, localCliEnvironment, validateLocalEdgeSettings } from './local-target.mjs'

export function localCommand(args) {
 if (args.length !== 1) throw new Error('Choose one local command; extra flags and remote targets are forbidden.')
 const commands = { start: ['start'], stop: ['stop'], reset: ['db','reset','--local','--yes'], migrate: ['migration','up','--local'], lint: ['db','lint','--local','--level','warning'], types: ['gen','types','typescript','--local'], serve: ['functions','serve','--env-file','supabase/.env.local'] }
 if (!Object.hasOwn(commands,args[0])) throw new Error('Unsupported local command. Hosted commands are not enabled in S1.')
 return commands[args[0]]
}

class LocalSupabaseFailure extends Error {}

// Return only fixed explanations and validated process/schema metadata. CLI
// stdout, stderr and error.message can contain keys, URLs and private SQL values.
export function localCommandFailure(action, result, migrationNames = []) {
 const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
 const status = Number.isInteger(result.status) ? `exit ${result.status}` : 'no exit status'
 const signal = ['SIGABRT','SIGILL','SIGKILL','SIGSEGV','SIGTERM','SIGINT'].includes(result.signal) ? `; ${result.signal}` : ''
 let reason = 'The CLI failed; inspect the local daemon/configuration.'
 if (result.error?.code === 'ETIMEDOUT') reason = 'The CLI exceeded its local timeout; check Docker health and resource availability.'
 else if (result.error?.code === 'ENOBUFS') reason = 'CLI output exceeded the capture limit; output remains withheld.'
 else if (['ENOENT','EACCES'].includes(result.error?.code)) reason = 'The local CLI could not be launched; run npm ci and check executable permissions.'
 else if (/port is already allocated|address already in use/i.test(output)) reason = 'A local service port is already occupied; preserve other stacks and check their port bindings.'
 else if (/cannot connect to the docker daemon|is the docker daemon running|docker daemon is not running|dockerdesktop.*not running|docker: command not found|podman also not found/i.test(output)) reason = 'Docker is unavailable; verify its CLI is on PATH, start Docker and check daemon access.'
 else if (/toomanyrequests|too many requests|rate limit|status(?: code)?[ :]+429/i.test(output)) reason = 'A container registry request was rate limited; check registry access before retrying.'
 else if (/failed to pull|error pulling|pull access denied|manifest unknown|failed to resolve.*image/i.test(output)) reason = 'A required container image could not be pulled; check registry access and image availability.'
 else if (/SQLSTATE\s+[A-Z0-9]{5}\b/.test(output)) {
  const code = output.match(/SQLSTATE\s+([A-Z0-9]{5})\b/)[1]
  const migration = [...output.matchAll(/Applying migration (\d{14}_[a-z0-9_]+\.sql)/g)].at(-1)?.[1]
  reason = `Database initialization/migration failed (SQLSTATE ${code}${migrationNames.includes(migration) ? `; ${migration}` : ''}).`
 } else if (/no such file or directory|failed to read file/i.test(output)) reason = 'A required local source/configuration file is missing; verify the checkout is complete.'
 else if (/unhealthy|health.?check.*fail|failed.*health.?check|service.*not ready/i.test(output)) reason = 'A local service failed its health check; inspect local container health and resources.'
 return new LocalSupabaseFailure(`Local Supabase ${action} failed (${status}${signal}). ${reason} Raw CLI output and credentials are withheld.`)
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
 if (result.status !== 0) throw localCommandFailure(args[0], result, await readdir(new URL('../supabase/migrations/',import.meta.url)))
 if (args[0]==='types') await writeFile(new URL('../src/types/database.ts',import.meta.url),result.stdout)
 console.log('Local Supabase command completed; no hosted target was used.')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try { await runLocalCommand(process.argv.slice(2)) } catch (error) { console.error(error instanceof LocalSupabaseFailure ? error.message : 'Local Supabase preflight refused the command. Check the synthetic project and target; remote flags and credentials are forbidden.'); process.exitCode=1 }
}
