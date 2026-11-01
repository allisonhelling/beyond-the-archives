import { sha256 as hash, randomSecret } from '../src/lib/crypto.ts'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
export function appLoginHandler(admin: SupabaseClient, origins: string[], verify: (tokenHash: string) => Promise<Session>, signIn?: (email: string, password: string) => Promise<Session>) {
 return async (request: Request) => {
  const origin = request.headers.get('Origin') ?? ''
  const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin', ...(origins.includes(origin) ? { 'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'POST, OPTIONS' } : {}) }
  const json = (value: unknown, status=200) => new Response(JSON.stringify(value),{status,headers})
  if (!origins.includes(origin)) return json({error:'Origin is not allowed'},403)
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers})
  if (request.method!=='POST') return json({error:'Method not allowed'},405)
  try {
   if (Number(request.headers.get('Content-Length'))>4096) return json({error:'Request too large'},413)
   const body=await request.text()
   if(body.length>4096)return json({error:'Request too large'},413)
   let input: Record<string,unknown>
   try { input=JSON.parse(body) } catch { return json({error:'Invalid request'},400) }
   if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'Invalid request'},400)
   if(input.action==='password') {
    const invalid=()=>json({error:'Could not sign in. Check your username or email and password, then try again.'},401)
    if(!signIn||typeof input.username!=='string'||typeof input.password!=='string'||!input.username.trim()||input.username.length>100||!input.password||input.password.length>1024)return invalid()
    const account=await admin.rpc('account_login_email',{p_username:input.username.trim()})
    if(account.error||!account.data)return invalid()
    try {
     const session=await signIn(account.data,input.password)
     return json({access_token:session.access_token,refresh_token:session.refresh_token})
    } catch {return invalid()}
   }
   if(input.action==='issue') {
    if(typeof input.challenge!=='string'||!/^[a-f0-9]{64}$/.test(input.challenge)||typeof input.target!=='string'||!origins.includes(input.target)||input.target===origin) return json({error:'Invalid handoff target'},400)
    const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if(!token)return json({error:'Sign in required'},401)
    const {data,error}=await admin.auth.getUser(token)
    if(error||!data.user?.email_confirmed_at||data.user.is_anonymous)return json({error:'Sign in required'},401)
    const linked=await admin.from('reader_organizer_links').select('user_id').eq('user_id',data.user.id).maybeSingle()
    const access=await admin.from('reader_app_access').select('user_id').eq('user_id',data.user.id).maybeSingle()
    if(linked.error||access.error)throw new Error('Access lookup failed')
    if(!access.data)return json({error:'Reader account access required'},403)
    if(!linked.data&&input.userRequested!==true)return json({error:'Connect the reader and organizer first'},403)
    await admin.from('app_login_handoffs').delete().lte('expires_at',new Date().toISOString())
    const recent=await admin.from('app_login_handoffs').select('code_hash',{count:'exact',head:true}).eq('user_id',data.user.id)
    if(recent.error)throw recent.error
    if((recent.count??0)>=10)return json({error:'Too many sign-in attempts. Try again in one minute.'},429)
    const code=randomSecret()
    const result=await admin.from('app_login_handoffs').insert({code_hash:await hash(code),challenge:input.challenge,target_origin:input.target,user_id:data.user.id,...(input.userRequested===true?{user_requested:true}:{})})
    if(result.error)throw result.error
    return json({code})
   }
   if(input.action==='redeem') {
    if(typeof input.code!=='string'||!/^[a-f0-9]{64}$/.test(input.code)||typeof input.verifier!=='string'||!/^[a-f0-9]{64}$/.test(input.verifier))return json({error:'Invalid handoff'},400)
    const consumed=await admin.rpc('consume_app_login_handoff',{p_hash:await hash(input.code),p_challenge:await hash(input.verifier),p_origin:origin})
    if(consumed.error)throw consumed.error
    if(!consumed.data)return json({error:'Sign-in handoff expired or already used'},401)
    const {data,error}=await admin.auth.admin.getUserById(consumed.data)
    if(error||!data.user?.email||!data.user.email_confirmed_at||data.user.is_anonymous)return json({error:'Account unavailable'},403)
    const access=await admin.from('reader_app_access').select('user_id').eq('user_id',data.user.id).maybeSingle()
    if(access.error||!access.data)return json({error:'Account access unavailable'},403)
    // Mint a separate session. Never copy or rotate the source application's refresh token.
    const link=await admin.auth.admin.generateLink({type:'magiclink',email:data.user.email})
    if(link.error||!link.data.properties?.hashed_token)throw new Error('Could not create sign-in')
    const session=await verify(link.data.properties.hashed_token)
    if(session.user.id!==data.user.id)throw new Error('Account mismatch')
    return json({access_token:session.access_token,refresh_token:session.refresh_token})
   }
   return json({error:'Unknown action'},400)
  } catch { return json({error:'Could not complete connected sign-in. Sign in with your email and password.'},503) }
 }
}
