import {afterEach,expect,it,vi} from 'vitest'
import {requireEnvironmentConfig,requireRuntimeEnvironmentConfig,productionProjectRef,stagingProjectRef} from './environment'
import {stagingBootstrapConfig,stagingVercelConfig,validateBrowserEnv} from '../../scripts/build-env'
import organizerVercel from '../../vercel.json'
import readerVercel from '../../reader/vercel.json'
afterEach(()=>vi.unstubAllGlobals())
const local={VITE_APP_ENV:'local',VITE_SUPABASE_PROJECT_REF:'local',VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',VITE_ORGANIZER_URL:'http://127.0.0.1:5173/',VITE_READER_URL:'http://127.0.0.1:5174/'}
const staging={...local,VITE_APP_ENV:'staging',VITE_SUPABASE_PROJECT_REF:'synthetic-staging',VITE_SUPABASE_URL:'https://synthetic-staging.supabase.co',VITE_ORGANIZER_URL:'https://organizer-staging.example/',VITE_READER_URL:'https://reader-staging.example/'}
it('requires complete explicit configuration rather than selecting production',()=>{
 for(const key of Object.keys(local))expect(()=>requireEnvironmentConfig({...local,[key]:''})).toThrow()
 expect(()=>requireEnvironmentConfig({})).toThrow()
 expect(requireEnvironmentConfig(local).environment).toBe('local')
})
it('denies staging/local production routing and mismatched backend identity before any transport',()=>{
 const production=`https://${productionProjectRef}.supabase.co`
 for(const env of [
  {...local,VITE_SUPABASE_URL:production}, {...staging,VITE_SUPABASE_URL:production},
  {...staging,VITE_SUPABASE_PROJECT_REF:productionProjectRef,VITE_SUPABASE_URL:production},
  {...staging,VITE_READER_URL:'https://archivesunfolded.vercel.app/'},
  {...staging,VITE_ORGANIZER_URL:'https://beyondthearchives.vercel.app/'},
  {...staging,VITE_SUPABASE_URL:'https://user:password@synthetic-staging.supabase.co/'},
  {...staging,VITE_SUPABASE_URL:'https://synthetic-staging.supabase.co/functions/v1'},
 ])expect(()=>requireEnvironmentConfig(env)).toThrow()
})
it('binds Vercel Preview to staging and Production to its explicit production configuration',()=>{
 expect(()=>requireEnvironmentConfig(local,'preview')).toThrow()
 expect(()=>requireEnvironmentConfig(staging,'production')).toThrow()
 expect(requireEnvironmentConfig(staging,'preview').environment).toBe('staging')
 const production={...staging,VITE_APP_ENV:'production',VITE_SUPABASE_PROJECT_REF:productionProjectRef,VITE_SUPABASE_URL:`https://${productionProjectRef}.supabase.co`,VITE_ORGANIZER_URL:'https://beyondthearchives.vercel.app/',VITE_READER_URL:'https://archivesunfolded.vercel.app/'}
 expect(()=>requireEnvironmentConfig(production,'preview')).toThrow()
 expect(requireEnvironmentConfig(production,'production').environment).toBe('production')
 expect(()=>validateBrowserEnv(production,true,undefined,false)).toThrow('development servers')
 expect(()=>requireRuntimeEnvironmentConfig(production)).toThrow('application origin')
})
it('rejects privileged credentials and environment omissions in both app build boundaries',()=>{
 for(const value of ['sb_secret_synthetic',`x.${btoa(JSON.stringify({role:'service_role'}))}.x`])expect(()=>validateBrowserEnv({...staging,VITE_SUPABASE_PUBLISHABLE_KEY:value},true)).toThrow()
 expect(()=>validateBrowserEnv({},true)).toThrow()
})
it('rejects staging branch promotion even with internally consistent inherited Production variables',()=>{
 const production={...staging,VITE_APP_ENV:'production',VITE_SUPABASE_PROJECT_REF:productionProjectRef,VITE_SUPABASE_URL:`https://${productionProjectRef}.supabase.co`,VITE_ORGANIZER_URL:'https://beyondthearchives.vercel.app',VITE_READER_URL:'https://archivesunfolded.vercel.app'}
 const provider={VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'staging'}
 expect(()=>validateBrowserEnv(production,true,provider)).toThrow('staging branch')
 expect(()=>validateBrowserEnv(production,true,{...provider,VERCEL_GIT_COMMIT_REF:'main'})).not.toThrow()
 const verified={...staging,VITE_SUPABASE_PROJECT_REF:stagingProjectRef,VITE_SUPABASE_URL:`https://${stagingProjectRef}.supabase.co`}
 expect(()=>validateBrowserEnv(verified,true,{...provider,VERCEL_ENV:'preview'})).not.toThrow()
 expect(()=>validateBrowserEnv(staging,true,{...provider,VERCEL_ENV:'preview'})).toThrow('verified staging backend')
})
it('fails closed for missing or conflicting Vercel metadata',()=>{
 for(const provider of [
  {VERCEL:'1'},
  {VERCEL:'1',VERCEL_ENV:'preview'},
  {VERCEL:'1',VERCEL_GIT_COMMIT_REF:'staging'},
  {VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'staging',VERCEL_TARGET_ENV:'production'},
 ])expect(()=>validateBrowserEnv(staging,true,provider)).toThrow(/metadata|conflicts/)
 expect(()=>validateBrowserEnv(local,true)).not.toThrow()
})
it('allows staging clients only on configured app origins, preserving local behavior',()=>{
 for(const origin of [staging.VITE_ORGANIZER_URL,staging.VITE_READER_URL]){
  vi.stubGlobal('window',{location:{origin:new URL(origin).origin}})
  expect(requireRuntimeEnvironmentConfig(staging).environment).toBe('staging')
 }
 for(const origin of ['https://beyondthearchives.vercel.app','https://archivesunfolded.vercel.app','https://unapproved-preview.vercel.app']){
  vi.stubGlobal('window',{location:{origin}})
  expect(()=>requireRuntimeEnvironmentConfig(staging)).toThrow('application origin')
 }
 expect(requireRuntimeEnvironmentConfig(local).environment).toBe('local')
})
it('derives staging CSP from both existing configs without changing production policies or routing',()=>{
 const organizer='https://synthetic-organizer-git-staging-test.vercel.app'
 const reader='https://synthetic-reader-git-staging-test.vercel.app'
 for(const [app,source,sibling]of [['organizer',organizerVercel,reader],['reader',readerVercel,organizer]] as const){
  const original=JSON.stringify(source)
  const prepared=stagingVercelConfig(source,organizer,reader,app)
  expect(JSON.stringify(source)).toBe(original)
  expect(prepared.rewrites).toEqual(source.rewrites)
  expect(prepared.buildCommand).toBe(source.buildCommand)
  const bridge=prepared.headers.find(rule=>rule.source==='/auth/bridge')!
  expect(bridge.headers).toEqual(expect.arrayContaining([{key:'Cache-Control',value:'no-store'},{key:'Referrer-Policy',value:'no-referrer'}]))
  expect(bridge.headers.some(header=>header.key==='X-Frame-Options')).toBe(false)
  const csp=bridge.headers.find(header=>header.key==='Content-Security-Policy')!.value
  expect(csp).toContain(`frame-ancestors ${sibling};`)
  expect(csp).toContain(`https://${stagingProjectRef}.supabase.co`)
  expect(csp).not.toContain('*.supabase.co')
  expect(JSON.stringify(prepared.headers)).not.toMatch(/https:\/\/(beyondthearchives|archivesunfolded)\.vercel\.app/)
  expect(prepared.headers.find(rule=>rule.source==='/((?!auth/bridge$).*)')!.headers).toContainEqual({key:'X-Frame-Options',value:'DENY'})
 }
 expect(()=>stagingVercelConfig(organizerVercel,organizer,organizer,'organizer')).toThrow('distinct')
 expect(()=>stagingVercelConfig(organizerVercel,'https://beyondthearchives.vercel.app',reader,'organizer')).toThrow('Production')
 expect(()=>stagingVercelConfig(organizerVercel,'https://organizer-staging.example',reader,'organizer')).toThrow('verified Vercel')
})
it('prepares dependency-free bootstrap candidates with no application entrypoints or outbound connections',()=>{
 for(const [app,source]of [['organizer',organizerVercel],['reader',readerVercel]] as const){
  const original=JSON.stringify(source)
  const prepared=stagingBootstrapConfig(source,app)
  expect(prepared.framework).toBeNull()
  expect(prepared.installCommand).toBe('')
  expect(prepared.buildCommand).toBe(`node ${app==='reader'?'../':''}scripts/staging-bootstrap.mjs`)
  expect(prepared.outputDirectory).toBe('.staging-bootstrap')
  expect(prepared.rewrites).toEqual([])
  expect(prepared.headers[0].headers).toContainEqual({key:'Content-Security-Policy',value:"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"})
  expect(JSON.stringify(source)).toBe(original)
 }
})
