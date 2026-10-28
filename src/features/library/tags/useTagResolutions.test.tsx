import { act,renderHook } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
const api=vi.hoisted(()=>({cached:vi.fn(),invoke:vi.fn()}))
vi.mock('../../../lib/supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({eq:()=>({in:api.cached})})})}),functions:{invoke:api.invoke}}}))
vi.mock('../../../lib/sample-mode',()=>({sampleMode:false}))
import { AuthContext } from '../../auth/auth-context'
import { useTagResolutions } from './useTagResolutions'
import { tagResolutionEvent } from './tag-resolution'
const canonical={category:'character',name:'Alya Césaire',status:'canonical',canonical_name:'Alya Césaire',checked_at:'2026-10-26',attempted_at:'2026-10-26'}
const auth=(user:string)=>({authenticated:true,signIn:async()=>{},signOut:async()=>{},session:{user:{id:user}} as Session,loading:false,error:null,needsPassword:false,passwordSaved:()=>{}})
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks()})
it('loads cached evidence before the paced lookup and stops retrying when suggestions close',async()=>{
 vi.useFakeTimers()
 api.cached.mockResolvedValue({data:[canonical]})
 api.invoke.mockResolvedValue({data:{records:[canonical,{...canonical,name:'Alya (Miraculous Ladybug)',status:'synonym'}],retryAfterMs:35000},error:null})
 const dispatch=vi.spyOn(window,'dispatchEvent')
 const wrapper=({children}:{children:ReactNode})=><AuthContext.Provider value={auth('cache-reader')}>{children}</AuthContext.Provider>
 const view=renderHook(({enabled})=>useTagResolutions('character',[canonical.name],enabled),{initialProps:{enabled:true},wrapper})
 await act(async()=>{})
 expect(view.result.current.records).toEqual([canonical]);expect(api.invoke).not.toHaveBeenCalled()
 await act(async()=>{await vi.advanceTimersByTimeAsync(750)})
 expect(api.invoke).toHaveBeenCalledTimes(1)
 expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({type:tagResolutionEvent,detail:{userId:'cache-reader'}}))
 view.rerender({enabled:false})
 await act(async()=>{await vi.advanceTimersByTimeAsync(40000)})
 expect(api.invoke).toHaveBeenCalledTimes(1)
})
it('keeps accounts isolated and leaves raw searching available when verification fails',async()=>{
 vi.useFakeTimers();let user='isolation-reader'
 api.cached.mockResolvedValueOnce({data:[canonical]}).mockResolvedValue({data:[]})
 api.invoke.mockResolvedValue({error:new Error('Unavailable')})
 const wrapper=({children}:{children:ReactNode})=><AuthContext.Provider value={auth(user)}>{children}</AuthContext.Provider>
 const view=renderHook(()=>useTagResolutions('character',[canonical.name],true),{wrapper})
 await act(async()=>{await vi.advanceTimersByTimeAsync(750)})
 expect(view.result.current.unavailable).toBe(true)
 expect(view.result.current.records).toEqual([canonical])
 user='other-isolated-reader';view.rerender();await act(async()=>{})
 expect(view.result.current.records).toEqual([])
})
