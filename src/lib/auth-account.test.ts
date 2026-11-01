import { expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInWithLogin } from './auth-account'

it('uses direct Auth for email and establishes the verified session for usernames',async()=>{
 const signInWithPassword=vi.fn().mockResolvedValue({error:null}),setSession=vi.fn().mockResolvedValue({error:null})
 const invoke=vi.fn().mockResolvedValue({data:{access_token:'access',refresh_token:'refresh',email:'ignored'},error:null})
 const client={auth:{signInWithPassword,setSession},functions:{invoke}} as unknown as SupabaseClient
 await signInWithLogin(client,' reader@example.com ','password')
 expect(signInWithPassword).toHaveBeenCalledWith({email:'reader@example.com',password:'password'})
 expect(invoke).not.toHaveBeenCalled()
 await signInWithLogin(client,' Reader ','password')
 expect(invoke).toHaveBeenCalledWith('app-login',{body:{action:'password',username:'Reader',password:'password'}})
 expect(setSession).toHaveBeenCalledWith({access_token:'access',refresh_token:'refresh'})
 invoke.mockResolvedValue({data:null,error:new Error('private backend detail')})
 await expect(signInWithLogin(client,'Reader','wrong')).rejects.toThrow('Check your username or email and password')
 expect(setSession).toHaveBeenCalledTimes(1)
})
