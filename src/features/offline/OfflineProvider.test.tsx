import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OfflineProvider, useOffline } from './OfflineProvider'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../../lib/supabase',()=>({supabase:{rpc:mocks.rpc}}))
vi.mock('../auth/auth-context',()=>({useAuth:()=>({authenticated:true,session:{user:{id:'owner'}}})}))
const snapshot={connected:true,userId:'owner',savedAt:'2026-11-01T12:00:00Z',readers:[],stories:[],cloudBooks:[]}
function Controls(){
 const hub=useOffline()
 return <><p>{hub.snapshot?'Retained':'Empty'}</p><p role="status">{hub.error}</p><button onClick={()=>void hub.disconnect().catch(()=>{})}>Disconnect</button></>
}
beforeEach(()=>{
 const values=new Map<string,string>([['bta:offline-hub:v1',JSON.stringify(snapshot)],['unrelated','kept']])
 vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)})
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true})
 let enabled=true
 mocks.rpc.mockReset().mockImplementation((name:string,args?:{p_action:string})=>{
  if(args?.p_action==='disable'){enabled=false;return Promise.resolve({error:null})}
  return {abortSignal:()=>Promise.resolve({data:name==='reader_offline_snapshot'?snapshot:{enabled},error:null})}
 })
})
afterEach(()=>vi.unstubAllGlobals())
it('disables the account connection and clears only the retained hub after success',async()=>{
 render(<OfflineProvider><Controls /></OfflineProvider>)
 fireEvent.click(screen.getByRole('button',{name:'Disconnect'}))
 await screen.findByText('Empty')
 expect(mocks.rpc).toHaveBeenCalledWith('reader_organizer_connection',{p_action:'disable'})
 expect(localStorage.getItem('bta:offline-hub:v1')).toBeNull()
 expect(localStorage.getItem('unrelated')).toBe('kept')
})
it('preserves the retained hub and reports an error when disconnect fails',async()=>{
 mocks.rpc.mockImplementation((_name:string,args?:{p_action:string})=>args?.p_action==='disable'?Promise.resolve({error:new Error('Failed')}):{abortSignal:()=>Promise.resolve({data:snapshot,error:null})})
 render(<OfflineProvider><Controls /></OfflineProvider>)
 fireEvent.click(screen.getByRole('button',{name:'Disconnect'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Could not disconnect'))
 expect(screen.getByText('Retained')).toBeVisible()
 expect(localStorage.getItem('bta:offline-hub:v1')).not.toBeNull()
})
it('does not restore a disconnected hub when an earlier refresh finishes late',async()=>{
 let resolve!: (value:unknown)=>void
 const pending=new Promise(done=>{resolve=done})
 mocks.rpc.mockImplementation((name:string,args?:{p_action:string})=>args?.p_action==='disable'?Promise.resolve({error:null}):{abortSignal:()=>name==='reader_offline_snapshot'?pending:Promise.resolve({data:{enabled:true},error:null})})
 render(<OfflineProvider><Controls /></OfflineProvider>)
 await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('reader_offline_snapshot'))
 fireEvent.click(screen.getByRole('button',{name:'Disconnect'}))
 await screen.findByText('Empty')
 await act(async()=>{resolve({data:snapshot,error:null});await pending})
 expect(screen.getByText('Empty')).toBeVisible()
 expect(localStorage.getItem('bta:offline-hub:v1')).toBeNull()
})
