import { beforeAll, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { epubBuffer } from '../../src/test/epub-fixture'
import { importEpub } from '../src/epub'
import { bookDetails, catalogBook } from '../src/model'
import { importedVersion, prepareImport } from '../src/import-books'
import { getBookDetails, listCatalog, loadSetting } from '../src/storage'
vi.mock('../src/storage',()=>({getBookDetails:vi.fn(),listCatalog:vi.fn(),loadSetting:vi.fn()}))
beforeAll(()=>{Object.defineProperty(globalThis,'crypto',{value:webcrypto})})
async function fixture(){const buffer=await epubBuffer();return {size:buffer.byteLength,arrayBuffer:async()=>buffer} as File}
it('restores an exact removed download with its notes, history, active state, and position',async()=>{
 const next=await importEpub(await fixture()), previous=bookDetails(next)
 previous.hasFile=false;previous.active=false;previous.notes='Keep me';previous.position={chapter:previous.chapters[1].id,fraction:.7};previous.history=[{id:'event',chapter:previous.chapters[1].id,at:'2026-01-01',words:4,reread:false}]
 const restored=importedVersion(next,previous)
 expect(restored.file).toBe(next.file);expect(restored.active).toBe(false);expect(restored.notes).toBe('Keep me');expect(restored.history).toEqual(previous.history);expect(restored.position).toEqual(previous.position)
})
it('resolves exact hashes before other active versions and rejects cross-work replacement',async()=>{
 const next=await importEpub(await fixture()), exact=bookDetails(next)
 vi.mocked(listCatalog).mockResolvedValue([catalogBook({...exact,id:'other-version',active:true}),catalogBook(exact)])
 vi.mocked(getBookDetails).mockResolvedValue(exact)
 const prepared=await prepareImport(await fixture())
 expect(prepared.previous?.id).toBe(next.id)
 vi.mocked(listCatalog).mockResolvedValue([catalogBook({...exact,id:'explicit',workId:'1234'})])
 await expect(prepareImport(await fixture(),'explicit')).rejects.toThrow('different AO3 work')
})
it('maps changed versions through the existing history-preserving replacement logic',async()=>{
 const next=await importEpub(await fixture()), previous=bookDetails(next)
 previous.notes='Personal note';previous.position={chapter:previous.chapters[1].id,fraction:.4};previous.history=[{id:'read',chapter:previous.chapters[1].id,at:'2026-01-01',words:4,reread:false}]
 const changed=importedVersion({...next,id:'new-hash',chapters:[{...next.chapters[1],id:'changed-prose'}]},previous)
 expect(changed.history).toEqual(previous.history);expect(changed.notes).toBe(previous.notes);expect(changed.resumeRequired).toBe(true)
})
it('repairs legacy chapter identities when restoring an exact-file download',async()=>{
 const next=await importEpub(await fixture()),previous=bookDetails(next)
 previous.chapterVersion=0;previous.hasFile=false
 previous.chapters=previous.chapters.map((chapter,index)=>({...chapter,id:`legacy:${index}`}))
 previous.position={chapter:'legacy:1',fraction:.6};previous.completed=['legacy:1']
 previous.history=[{id:'read',chapter:'legacy:1',at:'2026-01-01',words:4,reread:false}]
 const restored=importedVersion(next,previous)
 expect(restored.position).toEqual({chapter:next.chapters[1].id,fraction:.6})
 expect(restored.completed).toEqual([next.chapters[1].id])
 expect(restored.history[0]).toMatchObject({id:'read',chapter:next.chapters[1].id})
 expect(restored.resumeRequired).toBe(false)
})

it('requires pending cloud deletion to finish before explicit reimport',async()=>{
 vi.mocked(loadSetting).mockResolvedValueOnce({value:true})
 await expect(prepareImport(await fixture())).rejects.toThrow('Cloud deletion of this EPUB is pending')
})

it('matches standalone Calibre updates by stable UUID even when the title changes',async()=>{
 const next=await importEpub(await fixture()),previous=bookDetails({...next,id:'prior-hash',workId:null,calibreId:'20000000-0000-0000-0000-000000000001'})
 vi.mocked(listCatalog).mockResolvedValue([catalogBook(previous)])
 vi.mocked(getBookDetails).mockResolvedValue(previous)
 const prepared=await prepareImport(await fixture(),undefined,previous.calibreId)
 expect(prepared.previous?.id).toBe('prior-hash')
 expect(prepared.next.calibreId).toBe(previous.calibreId)
})

it('recovers the source ID when restoring an exact hash or replacing a previously unidentified version',async()=>{
 const next=await importEpub(await fixture()),previous=bookDetails({...next,workId:null,notes:'Keep my notes'})
 expect(importedVersion(next,previous)).toMatchObject({workId:'8001',notes:'Keep my notes'})
 expect(importedVersion({...next,id:'updated-hash'},previous)).toMatchObject({workId:'8001',notes:'Keep my notes'})
})
