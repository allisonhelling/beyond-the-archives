// Offline preparation only: no provider client, credentials, env-file loading,
// deployment, migration execution, Git mutation, or implied release approval.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { productionVercelConfig } from './build-env.ts'
import { migrationInventory } from './staging-inventory.mjs'
import { productionOrganizerOrigin, productionProjectRef, productionReaderOrigin, stagingProjectRef } from '../src/lib/environment.ts'

const root=fileURLToPath(new URL('../',import.meta.url))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
function git(...args) {
 const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024})
 if(result.status!==0)throw new Error('Local Git release metadata is unavailable.')
 return result.stdout
}
try {
 if(process.argv.length!==2)throw new Error('Release preparation accepts no arguments, target overrides or credentials.')
 const sourceFiles=[...new Set(git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean))].sort()
 const source=[]
 const sourceDigest=createHash('sha256')
 for(const path of sourceFiles) {
  if(path.startsWith('/')||path.split('/').includes('..'))throw new Error('Invalid source artifact path.')
  const file=join(root,path)
  let entry
  try {
   if(!(await lstat(file)).isFile())throw new Error('Release source must use regular files.')
   entry={path,sha256:hash(await readFile(file))}
  }catch(error){if(error.code!=='ENOENT')throw error;entry={path,deleted:true}}
  source.push(entry)
  sourceDigest.update(JSON.stringify(entry)+'\n')
 }
 const inventory=await migrationInventory([])
 const versions=inventory.pending.map(name=>name.split('_')[0])
 if(new Set(versions).size!==versions.length)throw new Error('Duplicate source migration version.')
 const migrations=await Promise.all(inventory.pending.map(async path=>({path,sha256:hash(await readFile(new URL(`../supabase/migrations/${path}`,import.meta.url)))})))
 const candidates=[]
 for(const app of ['organizer','reader']) {
  const path=app==='organizer'?'vercel.json':'reader/vercel.json'
  const original=JSON.parse(await readFile(join(root,path),'utf8'))
  const config=productionVercelConfig(original,productionOrganizerOrigin,productionReaderOrigin,app)
  const bytes=JSON.stringify(config,null,2)+'\n'
  candidates.push({app,path:`${app}.production.vercel.json`,sha256:hash(bytes),bytes})
 }
 const createdAt=new Date().toISOString()
 const directory=new URL(`../artifacts/release/candidate-${createdAt.replaceAll(/[:.]/g,'-')}/`,import.meta.url)
 await mkdir(directory,{recursive:true})
 for(const candidate of candidates)await writeFile(new URL(candidate.path,directory),candidate.bytes,{flag:'wx',mode:0o600})
 const manifest={
  kind:'offline-release-preparation',version:1,createdAt,releaseAuthorized:false,
  source:{baseCommit:git('rev-parse','HEAD').trim(),branch:git('branch','--show-current').trim(),worktreeDirty:Boolean(git('status','--porcelain').trim()),sha256:sourceDigest.digest('hex'),files:source},
  repositoryMigrations:{count:inventory.count,chainSha256:inventory.sha256,files:migrations},
  changesFromLocalMain:git('diff','--name-status','main','--','supabase/migrations','supabase/functions','server','vercel.json','reader/vercel.json').trim().split('\n').filter(Boolean),
  intendedTargets:{productionProjectRef,stagingProjectRef,liveIdentityVerified:false},
  headerCandidates:candidates.map(({app,path,sha256})=>({app,path,sha256})),
  blockingEvidence:['Fresh authorized hosted identity/history and drift inventory','Hosted staging clean/upgrade/privacy/browser acceptance','Enforced production approval and credential access boundary','Approved full recovery coverage, RTO/RPO, retention and restore evidence','Exact committed release artifacts and per-action approvals'],
 }
 await writeFile(new URL('manifest.json',directory),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({artifact:fileURLToPath(directory).slice(root.length),sourceSha256:manifest.source.sha256,migrations:inventory.count,migrationChainSha256:inventory.sha256,releaseAuthorized:false}))
} catch {
 console.error('Offline release preparation refused or failed; file contents and environment values withheld.')
 process.exitCode=1
}
