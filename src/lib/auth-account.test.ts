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

it('creates one shared account with username metadata and a confirmation redirect',async()=>{
 const {createAccount}=await import('./auth-account')
 const signUp=vi.fn().mockResolvedValue({data:{session:null},error:null})
 const client={auth:{signUp}} as unknown as SupabaseClient
 expect(await createAccount(client,' new@example.com ','StrongPassword123!',' NewReader ','https://reader.example/auth/callback')).toBeNull()
 expect(signUp).toHaveBeenCalledWith({email:'new@example.com',password:'StrongPassword123!',options:{data:{username:'NewReader'},emailRedirectTo:'https://reader.example/auth/callback'}})
 await expect(createAccount(client,'new@example.com','weak','NewReader','https://reader.example')).rejects.toThrow('6 characters')
 await expect(createAccount(client,'new@example.com','StrongPassword123!','invalid name','https://reader.example')).rejects.toThrow('3–30')
 expect(signUp).toHaveBeenCalledTimes(1)
 signUp.mockResolvedValue({data:{session:null},error:{code:'unexpected_failure',message:'private table details'}})
 await expect(createAccount(client,'new@example.com','StrongPassword123!','NewReader','https://reader.example')).rejects.toThrow('Try a different username')
})

it('shows the beta rejection returned by Auth without exposing other backend errors', async () => {
 const { createAccount } = await import('./auth-account')
 const message = 'Private beta: this email address has not been approved for account creation.'
 const client = { auth: { signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: { message } }) } } as unknown as SupabaseClient
 await expect(createAccount(client, 'unlisted@example.com', 'StrongPassword123!', 'NewReader', 'https://reader.example')).rejects.toThrow(message)
})

it('requires matching password confirmation',async()=>{
 const {confirmPassword}=await import('./auth-account')
 const fields=new FormData();fields.set('password','shorter');fields.set('confirmPassword','different')
 expect(()=>confirmPassword(fields)).toThrow('Passwords do not match.')
 fields.set('confirmPassword','shorter');expect(()=>confirmPassword(fields)).not.toThrow()
})
