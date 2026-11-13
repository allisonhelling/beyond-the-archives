import {expect,it} from 'vitest'
import {requireEnvironmentConfig,requireRuntimeEnvironmentConfig,productionProjectRef} from './environment'
import {validateBrowserEnv} from '../../scripts/build-env'
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
