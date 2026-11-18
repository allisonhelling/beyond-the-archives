import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { localClients, checked, syntheticEpub } from './local-fixtures.mjs'
import { localSql, sqlUuid, createSyntheticRoleAccounts, removeSyntheticRoleAccounts } from './local-role-fixtures.mjs'
import { privacyCatalog } from './privacy-catalog.mjs'
import { validateLocalEdgeSettings } from './local-target.mjs'

const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const rows=query=>JSON.parse(localSql(`select coalesce(json_agg(r),'[]') from (${query}) r`))
const identifier=value=>{assert.match(value,/^[a-z_][a-z0-9_]*$/);return `"${value}"`}
const evidence=[]
const createdShared={authors:[],fandoms:[],tags:[]},createdWorks=new Set()
let existingWorks=new Set()
let stage='verifying the local target',clients,fixture
async function check(surface,identity,operation,run) {
 stage=`${surface}: ${identity}: ${operation}`
 await run()
 evidence.push({surface,identity,operation,result:'passed'})
}
function rejected(result) {
 if(result.error)assert.equal(result.error.code,'42501')
 else assert.deepEqual(result.data,[])
}
async function rpc(account,name,args={}) {
 const result=await account.client.rpc(name,args)
 if(result.error)stage+=`; RPC ${name} (${/^[A-Z0-9_]+$/.test(result.error.code)?result.error.code:'unknown'})`
 return checked(result)
}

try {
 assert.equal(process.argv.length,2,'Privacy checks accept no overrides or external fixtures.')
 clients=await localClients()
 const origins=validateLocalEdgeSettings(await readFile(new URL('../supabase/.env.local',import.meta.url),'utf8'))
 const edge=async(account,name,{body,method=body?'POST':'GET',origin=origins.APP_ORIGIN,token,headers={}}={})=>{
  const session=account&&checked(await account.client.auth.getSession()).session
  return fetch(`${clients.target.url}/functions/v1/${name}`,{
   method,redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{apikey:clients.target.publicKey,origin,...(token||session?{Authorization:`Bearer ${token||session.access_token}`} : {}),...(body&&typeof body==='object'&&!(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{}),...headers},
   ...(body!==undefined?{body:body instanceof Uint8Array?body:JSON.stringify(body)}:{}),
  })
 }
 // Fail before role bootstrap if the real, configured Edge runtime is unavailable.
 stage='waiting for the configured local Edge runtime'
 let ready=false
 for(let attempt=0;attempt<30;attempt++) {
  try { if((await edge(null,'account-status')).status===401){ready=true;break} } catch { /* Startup only. */ }
  await new Promise(resolve=>setTimeout(resolve,1000))
 }
 assert.ok(ready,'Run npm run db:serve with the verified local origins.')
 const catalog=await privacyCatalog(async query=>rows(query))
 existingWorks=new Set(rows('select id from public.works').map(row=>row.id))
 fixture=await createSyntheticRoleAccounts(clients)
 const accounts=fixture.accounts,anonymous=clients.user()
 for(const [index,account] of accounts.entries())assert.equal((await rpc(account,'app_access')).role,['user','user','admin','owner'][index])
 assert.ok(catalog.schemas.every(schema=>!schema.can_create))
 const bytes=await syntheticEpub(),hash=digest(bytes)
 const numbers=Date.now()
 stage='building synthetic fixtures through owned RPCs and scoped service setup'
 for(const [index,account] of accounts.entries()) {
  const user_id=account.id,c=account.client
  stage=`seeding ${account.identity}: shared metadata relationships`
  const native=numbers+100+index
  account.native=native
  account.shared={}
  account.shared.works=checked(await clients.admin.from('works').insert({ao3_work_id:native,title:'Synthetic Public Source Metadata'}).select('id').single()).id
  createdWorks.add(account.shared.works)
  checked(await clients.admin.from('library_entries').insert({user_id,work_id:account.shared.works,original_url:`https://archiveofourown.org/works/${native}`}))
  for(const [table,link,column] of [['authors','work_authors','author_id'],['fandoms','work_fandoms','fandom_id'],['tags','work_tags','tag_id']]) {
   const row=checked(await clients.admin.from(table).insert({name:`Synthetic ${randomUUID()}`,...(table==='tags'?{category:'freeform'}:{})}).select('id').single())
   createdShared[table].push(row.id)
   account.shared[table]=row.id
   checked(await clients.admin.from(link).insert({work_id:account.shared.works,[column]:row.id}))
  }
  stage=`seeding ${account.identity}: collections`
  account.collection=checked(await c.from('collections').insert({user_id,name:'Synthetic Privacy Shelf'}).select('id').single()).id
  stage=`seeding ${account.identity}: personal_tags`
  account.tag=checked(await c.from('personal_tags').insert({user_id,name:'Synthetic Privacy Tag'}).select('id').single()).id
  stage=`seeding ${account.identity}: collection_works`
  checked(await c.from('collection_works').insert({user_id,collection_id:account.collection,library_entry_id:account.entries[0]}))
  stage=`seeding ${account.identity}: library_entry_tags`
  checked(await c.from('library_entry_tags').insert({user_id,library_entry_id:account.entries[0],personal_tag_id:account.tag}))
  account.seriesNumber=numbers+index
  account.series=await rpc(account,'remember_library_series',{p_metadata:{seriesId:account.seriesNumber,normalizedUrl:`https://archiveofourown.org/series/${account.seriesNumber}`,title:'Synthetic Private Series',works:[]}})
  stage=`seeding ${account.identity}: collection_series`
  checked(await c.from('collection_series').insert({user_id,collection_id:account.collection,library_series_id:account.series}))
  stage=`seeding ${account.identity}: collections`
  checked(await c.from('collections').insert({user_id,name:'Synthetic Automatic Shelf',automatic_rules:{filters:{favorites:true},terms:[]}}))
  stage=`seeding ${account.identity}: library_entries`
  checked(await c.from('library_entries').update({is_favorite:true}).eq('id',account.entries[0]))
  stage=`seeding ${account.identity}: metadata_preferences`
  checked(await clients.admin.from('metadata_preferences').upsert({user_id,retrieval_mode:'extension',retrieval_mode_mobile:'extension'}))
  stage=`seeding ${account.identity}: library_sync_reports`
  checked(await c.from('library_sync_reports').insert({id:randomUUID(),report:{synthetic:true}}))
  stage=`seeding ${account.identity}: site_mappings`
  const mappingId=randomUUID(),example='https://synthetic.example/story',title='Synthetic Story Title'
  assert.equal(await rpc(account,'write_site_mapping',{p_id:mappingId,p_version:0,p_rule:{
   id:mappingId,version:1,scope:'exact',example,field:'title',selectors:['h1'],previous:title,
   validation:{when:new Date().toISOString(),example,health:'Working',current:title},
  }}),true)
  account.batch=await rpc(account,'submit_import_urls',{p_urls:['https://archiveofourown.org/works/123']})
  account.job=await rpc(account,'claim_extension_job')
  assert.ok(account.job?.id)
  stage=`seeding ${account.identity}: processing_logs`
  checked(await clients.admin.from('processing_logs').insert({job_id:account.job.id,user_id,category:'synthetic',message:'Synthetic privacy fixture'}))
  stage=`seeding ${account.identity}: ao3_tag_resolutions`
  checked(await clients.admin.from('ao3_tag_resolutions').insert([
   {user_id,category:'freeform',name:'Synthetic Shared Alias',status:'synonym',canonical_name:`Synthetic ${account.identity} Canonical`},
   {user_id,category:'freeform',name:`Synthetic ${account.identity} Canonical`,status:'canonical',canonical_name:`Synthetic ${account.identity} Canonical`},
  ]))
  stage=`seeding ${account.identity}: fandom_classifications`
  checked(await clients.admin.from('fandom_classifications').upsert({user_id,key:'synthetic-privacy',fandoms:['Synthetic Private Fandom']}))
  stage=`seeding ${account.identity}: reading_records`
  checked(await clients.admin.from('reading_records').insert({id:randomUUID(),user_id,original_url:'https://synthetic.example/history',reading_status:'finished',last_read_chapter:1,created_at:new Date().toISOString(),reading_history:[],metadata:{title:'Synthetic Archived Story'}}))
  await rpc(account,'reader_cloud_apply',{p_id:randomUUID(),p_key:'synthetic/privacy',p_value:{private:account.identity},p_base:0})
  account.installation=randomUUID()
  account.readerSecret=(await rpc(account,'reader_organizer_connection',{p_action:'restore',p_installation:account.installation})).secret
  checked(await anonymous.rpc('userscript_library',{p_secret:account.readerSecret,p_action:'reader_report',p_work:0,p_input:{installationId:account.installation,name:'Synthetic Reader',url:origins.READER_ORIGIN,works:['999999991']}}))
  account.destination=randomUUID();account.delivery=randomBytes(32).toString('hex')
  stage=`seeding ${account.identity}: reader_transfer_destinations`
  checked(await c.from('reader_transfer_destinations').insert({id:account.destination,user_id,device:account.installation,label:'Synthetic Calibre Destination',token_hash:digest(account.delivery)}))
  account.transfer=randomUUID()
  stage=`seeding ${account.identity}: reader_import_inbox`
  checked(await clients.admin.from('reader_import_inbox').insert({destination:account.destination,id:account.transfer,user_id,hash,metadata:{title:'Synthetic Private EPUB'}}))
  account.epub=`${user_id}/${hash}.epub`
  stage=`seeding ${account.identity}: reader-epubs`
  checked(await c.storage.from('reader-epubs').upload(account.epub,bytes,{contentType:'application/epub+zip'}))
  account.backup=`${user_id}/synthetic-s3-${randomUUID()}.json`
  stage=`seeding ${account.identity}: library-backups`
  checked(await clients.admin.storage.from('library-backups').upload(account.backup,JSON.stringify({synthetic:true}),{contentType:'application/json'}))
  await rpc(account,'query_library',{p_query:{},p_page:1,p_size:25})
 }
 const rememberWorks=()=>{
  const ids=accounts.map(account=>sqlUuid(account.id)).join(',')
  for(const row of rows(`select work_id from public.library_entries where user_id in (${ids}) union select work_id from public.metadata_jobs where user_id in (${ids})`))if(!existingWorks.has(row.work_id))createdWorks.add(row.work_id)
 }
 rememberWorks()


 // Exercise every current owner-column relation, including views and internal
 // tables whose lack of grants is itself the required boundary.
 const owned=catalog.relations.filter(table=>table.user_owned)
 for(const table of owned) {
  const name=table.name
  identifier(name)
  const selectable=table.authenticated_select&&(table.kind==='v'||catalog.policies.some(policy=>policy.tablename===name&&['SELECT','ALL'].includes(policy.cmd)&&policy.roles.includes('authenticated')))
  for(const [index,account] of accounts.entries()) {
   const victim=accounts[(index+1)%accounts.length]
   await check(name,account.identity,'SELECT own and foreign',async()=>{
    const own=await account.client.from(name).select('user_id')
    if(selectable) {
     assert.equal(own.error,null)
     assert.ok(own.data.length>0,'Readable private table needs a positive fixture.')
     assert.ok(own.data.every(row=>row.user_id===account.id))
    } else if(own.error)assert.equal(own.error.code,'42501');else assert.deepEqual(own.data,[])
    const foreign=await account.client.from(name).select('user_id').eq('user_id',victim.id)
    rejected(foreign)
   })
   if(table.kind==='v')continue
   const before=()=>localSql(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) from public.${identifier(name)} t where user_id=${sqlUuid(victim.id)}`)
   await check(name,account.identity,'foreign INSERT / UPDATE / DELETE and owner reassignment',async()=>{
    const fingerprint=before()
    const sample=rows(`select to_jsonb(t) as row from public.${identifier(name)} t where user_id=${sqlUuid(account.id)} limit 1`)[0]?.row??{}
    const insert={...sample,user_id:victim.id}
    for(const column of table.generated_columns)delete insert[column]
    if('id' in insert)insert.id=randomUUID()
    const attempted=await account.client.from(name).insert(insert).select('user_id')
    assert.equal(attempted.error?.code,'42501')
    rejected(await account.client.from(name).update({user_id:account.id}).eq('user_id',victim.id).select('user_id'))
    rejected(await account.client.from(name).update({user_id:victim.id}).eq('user_id',account.id).select('user_id'))
    rejected(await account.client.from(name).delete().eq('user_id',victim.id).select('user_id'))
    assert.equal(before(),fingerprint,'Foreign rows must remain byte-for-byte unchanged.')
   })
  }
  await check(name,'Anonymous','private SELECT and write denial',async()=>{
   rejected(await anonymous.from(name).select('user_id'))
   if(table.kind==='r') {
    const target=accounts[0].id
    assert.equal((await anonymous.from(name).insert({user_id:target})).error?.code,'42501')
    rejected(await anonymous.from(name).update({user_id:target}).eq('user_id',target).select('user_id'))
    rejected(await anonymous.from(name).delete().eq('user_id',target).select('user_id'))
   }
  })
 }

 for(const [index,account] of accounts.entries()) {
  const c=account.client,victim=accounts[(index+1)%accounts.length]
  await check('shared source metadata relationships',account.identity,'only metadata reachable through owned saved works',async()=>{
   for(const table of ['works','authors','fandoms','tags']) {
    const own=checked(await c.from(table).select('id').eq('id',account.shared[table]))
    assert.equal(own.length,1)
    assert.deepEqual(checked(await c.from(table).select('id').eq('id',victim.shared[table])),[])
    for(const mutation of [c.from(table).update({id:randomUUID()}).eq('id',victim.shared[table]),c.from(table).delete().eq('id',victim.shared[table]),c.from(table).insert({id:randomUUID()})])assert.equal((await mutation).error?.code,'42501')
   }
   for(const table of ['work_authors','work_fandoms','work_tags']) {
    assert.ok(checked(await c.from(table).select('work_id').eq('work_id',account.shared.works)).length>0)
    assert.deepEqual(checked(await c.from(table).select('work_id').eq('work_id',victim.shared.works)),[])
   }
  })
  await check('nested relationships',account.identity,'valid own edges and forged foreign parents',async()=>{
   for(const [table,payload] of [
    ['collection_works',{user_id:account.id,collection_id:account.collection,library_entry_id:victim.entries[0]}],
    ['collection_works',{user_id:account.id,collection_id:victim.collection,library_entry_id:account.entries[0]}],
    ['library_entry_tags',{user_id:account.id,library_entry_id:account.entries[0],personal_tag_id:victim.tag}],
    ['library_entry_tags',{user_id:account.id,library_entry_id:victim.entries[0],personal_tag_id:account.tag}],
    ['collection_series',{user_id:account.id,collection_id:account.collection,library_series_id:victim.series}],
   ]) assert.equal((await c.from(table).insert(payload)).error?.code,'23503')
   const patch=await c.from('collections').update({description:'Own update'}).eq('id',account.collection).select('id')
   assert.equal(patch.error,null);assert.equal(patch.data.length,1)
   rejected(await c.from('collections').update({description:'Forged'}).eq('id',victim.collection).select('id'))
   const disposable=checked(await c.from('personal_tags').insert({user_id:account.id,name:`Disposable ${randomUUID()}`}).select('id').single())
   assert.equal(checked(await c.from('personal_tags').delete().eq('id',disposable.id).select('id')).length,1)
   const work=checked(await clients.admin.from('works').insert({ao3_work_id:numbers+200+index,title:'Synthetic Delete Fixture'}).select('id').single()).id
   createdWorks.add(work)
   const entry=checked(await clients.admin.from('library_entries').insert({user_id:account.id,work_id:work,original_url:`https://archiveofourown.org/works/${numbers+200+index}`}).select('id').single()).id
   assert.equal(checked(await c.from('library_entries').delete().eq('id',entry).select('id')).length,1)
  })
  await check('reader cloud and pairing',account.identity,'account-scoped snapshots and foreign secret rejection',async()=>{
   const snapshot=await rpc(account,'reader_offline_snapshot')
   assert.ok(!JSON.stringify(snapshot).includes(victim.id))
   assert.ok((await c.rpc('reader_organizer_connection',{p_action:'enable',p_installation:randomUUID(),p_secret:victim.readerSecret})).error)
   const otherWork=checked(await anonymous.rpc('userscript_library',{p_secret:account.readerSecret,p_action:'get',p_work:victim.native,p_input:{user_id:victim.id,role:'owner'}}))
   assert.equal(otherWork.entry,null)
   const forged=await anonymous.rpc('userscript_library',{p_secret:account.readerSecret,p_action:'reader_report',p_work:0,p_input:{installationId:account.installation,name:'Synthetic Reader',url:origins.READER_ORIGIN,works:['999999991'],user_id:victim.id,role:'owner'}})
   assert.equal(forged.error,null)
   assert.equal(await rpc(account,'reader_has_access'),true)
  })
  await check('administrative metadata',account.identity,'role-independent redacted audit fields',async()=>{
   const request=randomUUID();fixture.requests.push(request)
   const audit=await rpc(account,'admin_access',{p_request_id:request,p_action:'read_audit'})
   if(index<2)assert.equal(audit.code,'forbidden')
   else {
    assert.equal(audit.ok,true)
    for(const event of audit.events)assert.deepEqual(Object.keys(event).sort(),['action','id','occurred_at','outcome','request_id'])
    assert.ok(!JSON.stringify(audit).includes(victim.id))
   }
  })
  await check('Storage EPUB and backup objects',account.identity,'own access; cross-account paths and signed URL forgery',async()=>{
   for(const [bucket,key,foreignKey] of [['reader-epubs',account.epub,victim.epub],['library-backups',account.backup,victim.backup]]) {
    assert.equal((await c.storage.from(bucket).download(key)).error,null)
    assert.ok((await c.storage.from(bucket).download(foreignKey)).error)
    assert.ok((await c.storage.from(bucket).createSignedUrl(foreignKey,60)).error)
    const signed=checked(await c.storage.from(bucket).createSignedUrl(key,60)).signedUrl
    // A deliberately issued signed URL is a bearer capability, not an RLS session.
    assert.equal((await fetch(signed)).status,200)
    const changed=new URL(signed);changed.pathname=changed.pathname.replace(key,foreignKey)
    assert.notEqual((await fetch(changed)).status,200)
    const before=checked(await clients.admin.storage.from(bucket).download(foreignKey))
    const expected=digest(new Uint8Array(await before.arrayBuffer()))
    const removed=await c.storage.from(bucket).remove([foreignKey])
    if(!removed.error)assert.deepEqual(removed.data,[])
    const after=checked(await clients.admin.storage.from(bucket).download(foreignKey))
    assert.equal(digest(new Uint8Array(await after.arrayBuffer())),expected)
   }
   const key=digest(randomUUID())
   assert.ok((await c.storage.from('reader-epubs').upload(`${victim.id}/${key}.epub`,bytes,{contentType:'application/epub+zip'})).error)
   assert.ok((await c.storage.from('reader-epubs').createSignedUploadUrl(`${victim.id}/${key}.epub`)).error)
   assert.ok((await c.storage.from('reader-epubs').update(account.epub,bytes,{contentType:'application/epub+zip'})).error)
   assert.ok((await c.storage.from('reader-epubs').move(account.epub,`${victim.id}/${key}.epub`)).error)
   assert.ok((await c.storage.from('library-backups').upload(`${account.id}/direct-upload.json`,'{}',{contentType:'application/json'})).error)
   const disposable=`${account.id}/${key}.epub`
   checked(await c.storage.from('reader-epubs').upload(disposable,bytes,{contentType:'application/epub+zip'}))
   assert.equal(checked(await c.storage.from('reader-epubs').remove([disposable])).length,1)
   assert.ok((await c.storage.from('reader-epubs').download(disposable)).error)
   const disposableBackup=`${account.id}/s3-disposable.json`
   checked(await clients.admin.storage.from('library-backups').upload(disposableBackup,'{}',{contentType:'application/json'}))
   assert.equal(checked(await c.storage.from('library-backups').remove([disposableBackup])).length,1)
  })
  await check('import queues and worker authority',account.identity,'owned leases; foreign cancel/retry and service RPC denial',async()=>{
   assert.ok((await c.rpc('cancel_import_batch',{p_batch:victim.batch})).error)
   assert.ok((await c.rpc('retry_metadata_job',{p_job:victim.job.id})).error)
   for(const [name,args] of [
    ['claim_metadata_job',{}],['finish_metadata_job',{p_job:victim.job.id,p_token:victim.job.token,p_metadata:{title:'Forged'},p_chapters:{},p_category:null,p_message:null,p_retryable:false,p_pause_seconds:0}],
    ['backup_storage_files',{p_user:victim.id}],['store_tag_resolutions',{p_user:victim.id,p_records:[]}],
    ['claim_backup_save',{p_user:victim.id,p_create:false}],['claim_fandom_classifications',{p_user:victim.id,p_limit:1}],
    ['metadata_job_archive_source',{p_job:victim.job.id}],['run_scheduled_dnf_cleanup',{}],
    ['restore_library_backup',{p_backup:{},p_user:victim.id,p_replace:true}],['reader_reconcile_account',{owner_id:victim.id}],
   ])assert.equal((await c.rpc(name,args)).error?.code,'42501')
  })
 }
 for(const [index,account] of accounts.entries()) {
  const c=account.client,victim=accounts[(index+1)%accounts.length]
  await check('export/restore and role injection',account.identity,'own export; foreign backups and injected role tables',async()=>{
   const backup=await rpc(account,'export_library_backup'),foreign=await rpc(victim,'export_library_backup')
   assert.equal(backup.user_id,account.id)
   assert.ok(!('user_roles' in backup.tables)&&!('admin_audit_logs' in backup.tables))
   for(const record of backup.tables.library_entries)assert.equal(record.user_id,account.id)
   const forgedQuery=await rpc(account,'query_library',{p_query:{user_id:victim.id,owner_id:victim.id,filters:{user_id:victim.id}},p_page:1,p_size:25})
   assert.ok(!JSON.stringify(forgedQuery).includes(victim.id))
   assert.ok((await c.rpc('preview_library_restore',{p_backup:foreign})).error)
   const injected={...backup,role:'owner',user_roles:[{user_id:account.id,role_id:'owner'}],tables:{...backup.tables,user_roles:[{user_id:account.id,role_id:'owner'}],app_roles:[{id:'owner'}]}}
   const preview=await rpc(account,'preview_library_restore',{p_backup:injected})
   const safety=`${account.id}/s3-safety-${randomUUID()}.json`
   checked(await clients.admin.storage.from('library-backups').upload(safety,JSON.stringify(backup),{contentType:'application/json'}))
   const priorRole=await rpc(account,'app_access')
   await rpc(account,'restore_own_library_backup',{p_backup:injected,p_fingerprint:preview.fingerprint,p_safety_path:safety})
   rememberWorks()
   assert.deepEqual(await rpc(account,'app_access'),priorRole)
   assert.deepEqual((await rpc(victim,'export_library_backup')).tables,foreign.tables)
   // Restore replaces owned entry/collection IDs; later checks use only stable
   // owner, pairing, transfer and job boundaries, not saved pre-restore row IDs.
  })
 }

 const html=await readFile(new URL('../server/ao3/fixtures/work.html',import.meta.url),'utf8')
 for(const account of accounts) {
  stage=`preparing ${account.identity}: current extension lease`
  const jobs=checked(await account.client.from('metadata_jobs').select('id,works(ao3_work_id)').eq('user_id',account.id))
  assert.ok(jobs.length&&jobs[0].works.ao3_work_id===123)
  account.currentJob={id:jobs[0].id,token:randomUUID()}
  checked(await clients.admin.from('metadata_jobs').update({status:'processing',retrieval_mode:'extension',lease_token:account.currentJob.token,lease_until:new Date(Date.now()+60000).toISOString()}).eq('id',account.currentJob.id).eq('user_id',account.id))
 }
 // Test all foreign requests while every victim still has a valid live lease.
 for(const [index,account] of accounts.entries()) {
  const victim=accounts[(index+1)%accounts.length]
  await check('extension-metadata',account.identity,'foreign live lease with the correct victim token',async()=>{
   const denied=await edge(account,'extension-metadata',{body:{jobId:victim.currentJob.id,token:victim.currentJob.token,url:'https://archiveofourown.org/works/123',html,user_id:victim.id},origin:`chrome-extension://${'a'.repeat(32)}`})
   assert.equal(denied.status,409)
   assert.equal(checked(await victim.client.from('metadata_jobs').select('status').eq('id',victim.currentJob.id).single()).status,'processing')
  })
 }
 for(const [index,account] of accounts.entries()) {
  const victim=accounts[(index+1)%accounts.length]
  await check('Edge identity and metadata',account.identity,'forged account IDs; owned extension lease and cache',async()=>{
   const status=await edge(account,'account-status',{body:{user_id:victim.id,role:'owner'}})
   assert.equal(status.status,200);assert.equal((await status.json()).user_id,account.id)
   const tags=await edge(account,'tag-resolution',{body:{category:'freeform',names:['Synthetic Shared Alias'],user_id:victim.id}})
   assert.equal(tags.status,200)
   const records=(await tags.json()).records
   assert.ok(records.length>0&&records.every(row=>row.user_id===account.id))
   const supplied=await edge(account,'extension-metadata',{body:{jobId:account.currentJob.id,token:account.currentJob.token,url:'https://archiveofourown.org/works/123',html,user_id:victim.id},origin:`chrome-extension://${'a'.repeat(32)}`})
   assert.equal(supplied.status,200)
   const backups=await edge(account,'save-backup',{body:{synthetic:true,user_id:victim.id,role:'owner'}})
   assert.equal(backups.status,200)
   assert.ok((await backups.json()).backups.every(file=>file.path.startsWith(`${account.id}/`)))
   const delivery=await edge(null,`reader-inbox/${randomUUID()}`,{body:bytes,token:account.delivery,headers:{'Content-Type':'application/epub+zip','X-Epub-Hash':hash,'X-Reader-Metadata':Buffer.from(JSON.stringify({user_id:victim.id,role:'owner'})).toString('base64')}})
   assert.equal(delivery.status,202)
   const ownInbox=checked(await account.client.from('reader_import_inbox').select('user_id'))
   assert.ok(ownInbox.length&&ownInbox.every(row=>row.user_id===account.id))
   assert.equal((await rpc(account,'app_access')).role,['user','user','admin','owner'][index])
  })
  await check('connected sign-in',account.identity,'forged target account; origin/verifier/replay',async()=>{
   const verifier=randomBytes(32).toString('hex')
   assert.equal((await edge(account,'app-login',{origin:'https://untrusted.example',body:{action:'issue',target:origins.READER_ORIGIN,challenge:digest(verifier),userRequested:true,user_id:victim.id}})).status,403)
   const issued=await edge(account,'app-login',{body:{action:'issue',target:origins.READER_ORIGIN,challenge:digest(verifier),userRequested:true,user_id:victim.id}})
   assert.equal(issued.status,200)
   const code=(await issued.json()).code
   const wrong=await edge(null,'app-login',{origin:origins.READER_ORIGIN,body:{action:'redeem',code,verifier:randomBytes(32).toString('hex'),user_id:victim.id}})
   assert.equal(wrong.status,401)
   const redeemed=await edge(null,'app-login',{origin:origins.READER_ORIGIN,body:{action:'redeem',code,verifier,user_id:victim.id}})
   assert.equal(redeemed.status,200)
   const tokens=await redeemed.json(),reader=clients.user()
   try {
    const adopted=checked(await reader.auth.setSession(tokens))
    assert.equal(adopted.user.id,account.id)
    assert.ok(checked(await reader.from('library_entries').select('user_id')).every(row=>row.user_id===account.id))
   } finally { await reader.auth.signOut({scope:'local'}) }
   assert.equal((await edge(null,'app-login',{origin:origins.READER_ORIGIN,body:{action:'redeem',code,verifier}})).status,401)
  })
 }
 await check('service identity','Service Role','separate bypass; never inferred from application role',async()=>{
  assert.ok(checked(await clients.admin.from('library_entries').select('id').eq('user_id',accounts[0].id)).length>0)
  assert.equal(catalog.principals.find(role=>role.rolname==='service_role').rolbypassrls,true)
  assert.equal(catalog.principals.find(role=>role.rolname==='authenticated').rolbypassrls,false)
 })
 await check('Storage object paths','Anonymous','cannot download or sign private objects',async()=>{
  for(const [bucket,path] of [['reader-epubs',accounts[0].epub],['library-backups',accounts[0].backup]]) {
   assert.ok((await anonymous.storage.from(bucket).download(path)).error)
   assert.ok((await anonymous.storage.from(bucket).createSignedUrl(path,60)).error)
  }
 })
 for(const name of ['account-status','extension-metadata','save-backup','tag-resolution','series-preview','wayback-lookup'])await check(name,'Anonymous','Edge authentication required',async()=>{assert.equal((await edge(null,name,{body:{user_id:accounts[0].id}})).status,401)})
 await check('retired worker','Anonymous','HTTP 410; no hosted work retrieval',async()=>{assert.equal((await edge(null,'import-worker')).status,410)})
 await check('unpaired delivery','Anonymous','reader-inbox rejects unknown capability',async()=>{assert.equal((await edge(null,'reader-inbox/destination',{token:'a'.repeat(64)})).status,401)})

 const directory=new URL('../artifacts/privacy/',import.meta.url)
 await mkdir(directory,{recursive:true})
 const filename=`local-${new Date().toISOString().replaceAll(/[:.]/g,'-')}.json`
 await writeFile(new URL(filename,directory),JSON.stringify({environment:'local',catalog,evidence,limitations:['Signed URLs are bearer capabilities until expiry.','No hosted deployment or provider isolation proof.','No native browser/Calibre installation verification.','Site mappings and linked crossposts are not implemented.']},null,2)+'\n',{mode:0o600,flag:'wx'})
 console.log(`PASS ${evidence.length} local privacy matrix checks; metadata-only report artifacts/privacy/${filename}`)
} catch(error) {
 const safeActual=Number.isInteger(error?.actual)||typeof error?.actual==='string'&&/^[A-Z0-9_]{3,32}$/.test(error.actual)
 console.error(`S3 privacy check failed at ${stage} (${error instanceof Error?error.name:'Error'}${safeActual?`, actual ${error.actual}, expected ${error.expected}`:''}); account data, tokens and response bodies withheld.`)
 process.exitCode=1
} finally {
 if(fixture) {
  try {
   const ids=fixture.accounts.map(account=>sqlUuid(account.id)).join(',')
   for(const row of rows(`select work_id from public.library_entries where user_id in (${ids}) union select work_id from public.metadata_jobs where user_id in (${ids})`))if(!existingWorks.has(row.work_id))createdWorks.add(row.work_id)
   await removeSyntheticRoleAccounts(clients,fixture.accounts,fixture.requests)
   if(createdWorks.size)localSql(`delete from public.works w where w.id in (${[...createdWorks].map(sqlUuid).join(',')}) and not exists(select 1 from public.library_entries e where e.work_id=w.id) and not exists(select 1 from public.metadata_jobs j where j.work_id=w.id)`)
   for(const [table,link,column] of [['authors','work_authors','author_id'],['fandoms','work_fandoms','fandom_id'],['tags','work_tags','tag_id']])if(createdShared[table].length)localSql(`delete from public.${identifier(table)} t where t.id in (${createdShared[table].map(sqlUuid).join(',')}) and not exists(select 1 from public.${identifier(link)} l where l.${identifier(column)}=t.id)`)
   console.log('PASS synthetic privacy fixture cleanup; no lasting owner')
  }
  catch {console.error('S3 local fixture cleanup failed; inspect the synthetic stack before retrying.');process.exitCode=1}
 }
}
