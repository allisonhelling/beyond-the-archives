import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { verifiedLocalTarget } from './local-target.mjs'

const options = { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } }
export async function localClients() {
 const target=await verifiedLocalTarget({url:process.env.SUPABASE_URL,secret:process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY})
 return { target, admin:createClient(target.url,target.secretKey,options), user:()=>createClient(target.url,target.publicKey,options) }
}
export function checked(result) {
 if (result.error) throw new Error('Synthetic local fixture operation failed. Inspect local schema/services; response details are withheld.')
 return result.data
}
export async function syntheticEpub() {
 const { createZip }=await import('../src/lib/zip.ts')
 return new Uint8Array(await createZip([
  {name:'mimetype',content:'application/epub+zip'},
  {name:'META-INF/container.xml',content:'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'},
  {name:'book.opf',content:'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">synthetic-privacy</dc:identifier><dc:title>Synthetic Privacy Fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>'},
  {name:'chapter.xhtml',content:'<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Synthetic fixture. No personal content.</p></body></html>'},
 ]).arrayBuffer())
}
export async function createSyntheticAccounts(clients, count=2) {
 const accounts=[]
 try {
  for(let n=0;n<count;n++) {
   const email=`s1-${randomUUID()}@example.test`,password=`Local-${randomUUID()}!Aa1`
   checked(await clients.admin.from('beta_signup_allowlist').insert({email}))
   const created=checked(await clients.admin.auth.admin.createUser({email,password,email_confirm:true}))
   const account={id:created.user.id,email,client:clients.user(),entries:[]}
   accounts.push(account)
   checked(await account.client.auth.signInWithPassword({email,password}))
   checked(await clients.admin.from('reader_app_access').upsert({user_id:account.id}))
   for (const native of [true,false]) {
    const id=checked(await account.client.rpc('save_library_story',{
     p_url:native?'https://archiveofourown.org/works/999999991':`https://synthetic.example/stories/${account.id}`,
     p_metadata:{title:native?'Synthetic AO3 Fixture':'Synthetic Universal Fixture',published_chapters:2,total_chapters:4,publication_status:'in_progress',chapter_count_manual:true},
     p_status:'to_read',p_progress:0,p_notes:'Synthetic local fixture only',p_rating:null,p_favorite:false,p_collections:[],p_tags:[],
    }))
    account.entries.push(id)
   }
   checked(await account.client.rpc('reader_organizer_connection',{p_action:'enable'}))
  }
  return accounts
 } catch(error) {await removeSyntheticAccounts(clients,accounts);throw error}
}
async function listSyntheticObjects(bucket, prefix) {
 const paths=[]
 for(let offset=0;;offset+=100) {
  const entries=checked(await bucket.list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}}))
  for(const entry of entries) {
   const path=`${prefix}/${entry.name}`
   if(entry.id) paths.push(path)
   else paths.push(...await listSyntheticObjects(bucket,path))
  }
  if(entries.length<100)return paths
 }
}
export async function removeSyntheticAccounts(clients,accounts) {
 for(const account of accounts) {
  if(!/^s1-[a-f0-9-]+@example\.test$/.test(account.email))throw new Error('Refusing non-synthetic fixture cleanup.')
  for(const bucket of ['reader-epubs','library-backups']) {
   const storage=clients.admin.storage.from(bucket)
   const objects=await listSyntheticObjects(storage,account.id)
   if(objects.length)checked(await storage.remove(objects))
  }
  await account.client.auth.signOut()
  checked(await clients.admin.auth.admin.deleteUser(account.id))
  checked(await clients.admin.from('beta_signup_allowlist').delete().eq('email',account.email))
 }
}
