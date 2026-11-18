import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {verifiedLocalTarget,localCliEnvironment,validateLocalEdgeSettings} from '../local-target.mjs'
import {localCommand,localCommandFailure,runLocalCommand} from '../local-supabase.mjs'
const target={url:'http://127.0.0.1:54321',secretKey:'synthetic-local-service',publicKey:'synthetic-local-public'}
test('hosted targets are rejected before reading CLI credentials or constructing a client',async()=>{
 let read=false
 for(const url of ['https://production.example','https://synthetic-staging.supabase.co','http://localhost.attacker.test','http://user:password@127.0.0.1:54321','http://127.0.0.1:54321/rest/v1']){
  await assert.rejects(verifiedLocalTarget({url},async()=>{read=true;return target}))
 }
 assert.equal(read,false)
})
test('a local URL cannot launder a foreign service credential, nor can a fake CLI response redirect writes',async()=>{
 await assert.rejects(verifiedLocalTarget({url:target.url,secret:'synthetic-production-service'},async()=>target),/do not match/)
 await assert.rejects(verifiedLocalTarget({},async()=>({...target,url:'https://production.example'})))
 assert.equal((await verifiedLocalTarget({url:target.url,secret:target.secretKey},async()=>target)).secretKey,target.secretKey)
})
test('migration/reset/seed entrypoints cannot accept linked, remote, passthrough or injected flags',async()=>{
 for(const args of [['reset','--linked'],['reset','--db-url','sensitive'],['migrate','--project-ref','production'],['push'],['start','--workdir','other'],['reset; deploy']]){
  assert.throws(()=>localCommand(args))
  let spawned=false;await assert.rejects(runLocalCommand(args,()=>{spawned=true;return{status:0}}));assert.equal(spawned,false)
 }
 assert.ok(localCommand(['reset']).includes('--local'))
 assert.ok(localCommand(['migrate']).includes('--local'))
})
test('ordinary CI contains no production mutation job or production credential references',async()=>{
 const text=await readFile(new URL('../../.github/workflows/ci.yml',import.meta.url),'utf8')
 assert.doesNotMatch(text,/deploy-database:|db push|functions deploy|secrets\.SUPABASE_|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD/)
 assert.match(text,/npm run db:start/);assert.match(text,/VITE_APP_ENV: local/)
 const jobs=[...text.matchAll(/^ {2}([\w-]+):\s*$/gm)].map(match=>match[1]).filter(job=>job!=='checks')
 const checks=text.match(/^ {2}checks:\n([\s\S]*?)(?=^ {2}[\w-]+:|$(?![\s\S]))/m)?.[1]??''
 const dependencies=checks.match(/needs: \[([^\]]+)\]/)?.[1].split(',').map(job=>job.trim())??[]
 assert.deepEqual([...dependencies].sort(),[...jobs].sort(),'The aggregate gate must wait for every validation job, including live privacy and all Calibre platforms.')
 for(const job of jobs)assert.ok(checks.includes('test "${{ needs.'+job+'.result }}" = success'),`The aggregate gate must require ${job} to succeed.`)
})

test('CLI child processes receive no ambient production or management credentials',()=>{
 const env={PATH:'synthetic-path',SUPABASE_ACCESS_TOKEN:'synthetic-token',SUPABASE_DB_PASSWORD:'synthetic-password',SUPABASE_PROJECT_REF:'production',SUPABASE_URL:'https://production.example',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',SUPABASE_DB_URL:'synthetic-db-url'}
 assert.deepEqual(localCliEnvironment(env),{PATH:'synthetic-path'})
 assert.equal(env.SUPABASE_PROJECT_REF,'production')
})

test('local CLI diagnostics explain failures without exposing credentials or raw provider errors',()=>{
 const secret='synthetic-private-value-never-log'
 const cases=[
  [{error:{code:'ETIMEDOUT'}},'timeout'],
  [{error:{code:'ENOBUFS'}},'capture limit'],
  [{error:{code:'ENOENT'}},'could not be launched'],
  [{stderr:'Bind for 0.0.0.0:54321 failed: port is already allocated'},'port is already occupied'],
  [{stderr:'Cannot connect to the Docker daemon'},'Docker is unavailable'],
  [{stderr:'docker: command not found (podman also not found)'},'Docker is unavailable'],
  [{stderr:'toomanyrequests: registry quota'},'rate limited'],
  [{stderr:'failed to pull image'},'could not be pulled'],
  [{stderr:'container auth is unhealthy'},'health check'],
  [{stderr:'failed to read file: no such file or directory'},'file is missing'],
  [{signal:'SIGILL'},'SIGILL'],
  [{stderr:'unexpected provider response'},'CLI failed'],
 ]
 for(const [input,expected] of cases) {
  const error=localCommandFailure('start',{status:1,...input,stdout:`SUPABASE_SECRET_KEY=${secret}`,error:{...input.error,message:secret}})
  assert.match(error.message,new RegExp(expected))
  assert.match(error.message,/exit 1/)
  assert.ok(!error.message.includes(secret))
  assert.ok(!error.message.includes('unexpected provider response'))
 }
})
test('migration failure diagnostics include only a SQLSTATE and an actual source filename',()=>{
 const migration='20261116000100_application_rbac.sql'
 const result={status:1,stderr:`Applying migration ${migration}...\nERROR: private SQL values (SQLSTATE 42501)`}
 assert.match(localCommandFailure('start',result,[migration]).message,/SQLSTATE 42501; 20261116000100_application_rbac.sql/)
 assert.ok(!localCommandFailure('start',result,[migration]).message.includes('private SQL values'))
 assert.ok(!localCommandFailure('start',result,[]).message.includes(migration))
})
test('the guarded startup propagates only safe CLI failure diagnostics',async()=>{
 let invoked=false
 await assert.rejects(runLocalCommand(['start'],(program,args,options)=>{
  invoked=true
  assert.equal(program,'npx')
  assert.deepEqual(args,['supabase','start'])
  assert.equal(options.env.SUPABASE_ACCESS_TOKEN,undefined)
  return {status:1,stderr:'Cannot connect to the Docker daemon; private-startup-value',stdout:'private-startup-value'}
 }),error=>error.message.includes('Docker is unavailable')&&!error.message.includes('private-startup-value'))
 assert.ok(invoked)
})

test('Edge env parsing rejects exported or duplicate production overrides before serving',()=>{
 const local='APP_ORIGIN=http://127.0.0.1:5173\nREADER_ORIGIN=http://127.0.0.1:5174\n'
 assert.doesNotThrow(()=>validateLocalEdgeSettings(local))
 for(const text of [local+'export SUPABASE_URL=https://production.example\n',local+'SUPABASE_SERVICE_ROLE_KEY=synthetic-secret\n',local+'APP_ORIGIN=https://beyondthearchives.vercel.app\n',local+'READER_ORIGIN=http://user:secret@127.0.0.1:5174\n'])assert.throws(()=>validateLocalEdgeSettings(text))
})

test('Auth notification templates resolve relative to the Supabase configuration', async () => {
 const config = new URL('../../supabase/config.toml', import.meta.url)
 const source = await readFile(config, 'utf8')
 for (const name of ['email_changed', 'password_changed']) {
  const section = source.split(`[auth.email.notification.${name}]\n`)[1]?.split('\n[')[0] ?? ''
  const path = section.match(/^content_path\s*=\s*"([^"]+)"$/m)?.[1]
  assert.ok(path?.startsWith('./templates/'), `Expected a config-relative notification template for ${name}`)
  assert.match(await readFile(new URL(path, config), 'utf8'), /<h2>/i)
 }
})
