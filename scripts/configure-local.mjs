import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {verifiedLocalTarget} from './local-target.mjs'
import {readPublicConfig} from '../src/lib/config.ts'

try {
 if(process.argv.length!==2)throw new Error('No target flags permitted')
 const target=await verifiedLocalTarget({url:process.env.SUPABASE_URL,secret:process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY})
 if(!readPublicConfig({VITE_SUPABASE_URL:target.url,VITE_SUPABASE_PUBLISHABLE_KEY:target.publicKey}))throw new Error('Invalid local public configuration')
 const settings={VITE_APP_ENV:'local',VITE_SUPABASE_PROJECT_REF:'local',VITE_SUPABASE_URL:target.url,VITE_SUPABASE_PUBLISHABLE_KEY:target.publicKey,VITE_ORGANIZER_URL:'http://127.0.0.1:5173/',VITE_READER_URL:'http://127.0.0.1:5174/',EXTENSION_LOCAL_APP_ORIGIN:'http://127.0.0.1:5173'}
 const files=[]
 for(const path of ['../.env.local','../reader/.env.local']) {
  const file=new URL(path,import.meta.url)
  let text=''
  try{text=await readFile(file,'utf8')}catch(error){if(error.code!=='ENOENT')throw error}
  const previous=parseEnv(text).VITE_SUPABASE_URL
  if(previous && new URL(previous).origin!==new URL(target.url).origin)throw new Error('Refusing to overwrite another environment profile')
  for(const [key,value]of Object.entries(settings)){
   const pattern=new RegExp(`^\\s*(?:export\\s+)?${key}=.*$`,'gm')
   text=pattern.test(text)?text.replace(pattern,`${key}=${value}`):`${text}\n${key}=${value}\n`
  }
  files.push({file,text})
 }
 for(const {file,text}of files)await writeFile(file,text,{mode:0o600})
 try{await writeFile(new URL('../supabase/.env.local',import.meta.url),'APP_ORIGIN=http://127.0.0.1:5173\nREADER_ORIGIN=http://127.0.0.1:5174\n',{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error}
 console.log('Configured both local apps with verified local public settings. No server credentials were written or logged.')
}catch{console.error('Local configuration refused or failed. Confirm the synthetic stack is running; existing nonlocal profiles are preserved.');process.exitCode=1}
