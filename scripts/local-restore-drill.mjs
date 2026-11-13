import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {createZip} from '../src/lib/zip.ts'
import {localClients,createSyntheticAccounts,removeSyntheticAccounts,checked} from './local-fixtures.mjs'

export async function restoreDrill() {
 const clients=await localClients(),accounts=await createSyntheticAccounts(clients)
 try {
  const [alice,bob]=accounts
  const backup=checked(await alice.client.rpc('export_library_backup'))
  const foreign=checked(await bob.client.rpc('export_library_backup'))
  const bytes=new Uint8Array(await createZip([
   {name:'mimetype',content:'application/epub+zip'},
   {name:'META-INF/container.xml',content:'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'},
   {name:'book.opf',content:'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">synthetic-s1</dc:identifier><dc:title>Synthetic Recovery Fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>'},
   {name:'chapter.xhtml',content:'<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Synthetic recovery fixture. No personal content.</p></body></html>'},
  ]).arrayBuffer())
  const hash=createHash('sha256').update(bytes).digest('hex'),path=`${alice.id}/${hash}.epub`
  const cloud={key:`${hash}/notes`,value:'Synthetic reader annotation'}
  checked(await alice.client.storage.from('reader-epubs').upload(path,bytes,{contentType:'application/epub+zip'}))
  checked(await alice.client.rpc('reader_cloud_apply',{p_id:randomUUID(),p_key:cloud.key,p_value:cloud.value,p_base:0}))
  assert.ok((await bob.client.storage.from('reader-epubs').download(path)).error,'Cross-account original download must fail')
  assert.equal(checked(await bob.client.from('reader_cloud_values').select('*').eq('user_id',alice.id)).length,0)
  checked(await alice.client.from('library_entries').update({notes:'Synthetic mutation to recover'}).eq('id',alice.entries[0]))
  const current=checked(await alice.client.rpc('export_library_backup'))
  const preview=checked(await alice.client.rpc('preview_library_restore',{p_backup:backup}))
  const safety=`${alice.id}/synthetic-safety-${randomUUID()}.json`
  checked(await clients.admin.storage.from('library-backups').upload(safety,JSON.stringify(current),{contentType:'application/json'}))
  checked(await alice.client.rpc('restore_own_library_backup',{p_backup:backup,p_fingerprint:preview.fingerprint,p_safety_path:safety}))
  const restored=checked(await alice.client.rpc('export_library_backup'))
  assert.equal(restored.version,2)
  assert.deepEqual(restored.tables.library_entries.map(x=>x.notes).sort(),backup.tables.library_entries.map(x=>x.notes).sort())
  assert.deepEqual(checked(await bob.client.rpc('export_library_backup')).tables,foreign.tables)
  // Reader originals and cloud records are separate recovery assets, not implied
  // by organizer JSON restore. Reconstruct only this drill's generated fixtures.
  checked(await alice.client.storage.from('reader-epubs').remove([path]))
  checked(await clients.admin.from('reader_cloud_values').delete().eq('user_id',alice.id))
  checked(await alice.client.storage.from('reader-epubs').upload(path,bytes,{contentType:'application/epub+zip'}))
  checked(await alice.client.rpc('reader_cloud_apply',{p_id:randomUUID(),p_key:cloud.key,p_value:cloud.value,p_base:0}))
  const recovered=checked(await alice.client.storage.from('reader-epubs').download(path))
  assert.equal(createHash('sha256').update(new Uint8Array(await recovered.arrayBuffer())).digest('hex'),hash)
  assert.equal(checked(await alice.client.from('reader_cloud_values').select('value').eq('key',cloud.key).single()).value,cloud.value)
  assert.equal(checked(await alice.client.rpc('reader_organizer_connection',{p_action:'status'})).enabled,true)
  assert.ok((await bob.client.rpc('preview_library_restore',{p_backup:backup})).error)
  console.log('Synthetic local account, universal identity, reader annotation/original and association recovery checks passed; cross-account denials passed. Auth/config disaster recovery is not covered.')
 }finally{await removeSyntheticAccounts(clients,accounts)}
}
try {if(process.argv.length!==2)throw new Error('No external restore inputs permitted');await restoreDrill()}
catch{console.error('Synthetic local restore drill refused or failed; no hosted operation or production backup import was attempted.');process.exitCode=1}
