import {afterEach,expect,it,vi} from 'vitest'
vi.mock('../src/storage',()=>({}))
import {rpc} from '../src/sync'
import {productionProjectRef} from '../../src/lib/environment'
import type {Connection} from '../src/model'
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('blocks a legacy connection to another environment before sending any paired secret',async()=>{
 for(const [key,value]of Object.entries({VITE_APP_ENV:'local',VITE_SUPABASE_PROJECT_REF:'local',VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',VITE_ORGANIZER_URL:'http://127.0.0.1:5173/',VITE_READER_URL:'http://127.0.0.1:5174/'}))vi.stubEnv(key,value)
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 const connection={backend:`https://${productionProjectRef}.supabase.co`,key:'sb_publishable_synthetic',secret:'synthetic-paired-secret',account:'synthetic'} as Connection
 await expect(rpc(connection,'progress','1',{progress:1})).rejects.toThrow('another environment')
 await expect(rpc({...connection,backend:'http://127.0.0.1:54321',key:'sb_publishable_other'},'get','1')).rejects.toThrow('another environment')
 expect(fetch).not.toHaveBeenCalled()
 fetch.mockResolvedValue({ok:true,json:async()=>({entry:null})})
 expect(await rpc({...connection,backend:'http://127.0.0.1:54321'},'get','1')).toEqual({entry:null})
})
