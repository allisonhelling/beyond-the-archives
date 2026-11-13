import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {verifiedLocalTarget,localCliEnvironment,validateLocalEdgeSettings} from '../local-target.mjs'
import {localCommand,runLocalCommand} from '../local-supabase.mjs'
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
})

test('CLI child processes receive no ambient production or management credentials',()=>{
 const env={PATH:'synthetic-path',SUPABASE_ACCESS_TOKEN:'synthetic-token',SUPABASE_DB_PASSWORD:'synthetic-password',SUPABASE_PROJECT_REF:'production',SUPABASE_URL:'https://production.example',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',SUPABASE_DB_URL:'synthetic-db-url'}
 assert.deepEqual(localCliEnvironment(env),{PATH:'synthetic-path'})
 assert.equal(env.SUPABASE_PROJECT_REF,'production')
})

test('Edge env parsing rejects exported or duplicate production overrides before serving',()=>{
 const local='APP_ORIGIN=http://127.0.0.1:5173\nREADER_ORIGIN=http://127.0.0.1:5174\n'
 assert.doesNotThrow(()=>validateLocalEdgeSettings(local))
 for(const text of [local+'export SUPABASE_URL=https://production.example\n',local+'SUPABASE_SERVICE_ROLE_KEY=synthetic-secret\n',local+'APP_ORIGIN=https://beyondthearchives.vercel.app\n',local+'READER_ORIGIN=http://user:secret@127.0.0.1:5174\n'])assert.throws(()=>validateLocalEdgeSettings(text))
})
