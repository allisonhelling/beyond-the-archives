import { beforeAll, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { epubBuffer, epubFiles } from '../../src/test/epub-fixture'
import { importEpub } from '../src/epub'
import { bookDetails, catalogBook } from '../src/model'
import { importedVersion, prepareImport, prepareImportVersion } from '../src/import-books'
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

async function unidentifiedFixture(){const buffer=await epubBuffer(epubFiles({source:'urn:isbn:standalone',preface:false}));return {size:buffer.byteLength,arrayBuffer:async()=>buffer} as File}
it('uses Calibre Work Link to replace a matching work without relying on EPUB identity or Calibre UUID',async()=>{
 const file=await unidentifiedFixture(),next=await importEpub(file)
 const previous=bookDetails({...next,id:'saved-work',workId:'8001',notes:'Keep my notes',calibreId:'old-calibre-id'})
 const unrelated=bookDetails({...next,id:'unrelated-work',workId:'9009',calibreId:'incoming-calibre-id'})
 vi.mocked(listCatalog).mockResolvedValue([catalogBook(unrelated),catalogBook(previous)])
 vi.mocked(getBookDetails).mockImplementation(async id=>id===previous.id?previous:unrelated)
 const prepared=await prepareImport(file,undefined,'incoming-calibre-id','https://archiveofourown.org/works/8001/chapters/12?view_adult=true')
 expect(prepared.previous?.id).toBe('saved-work')
 expect(prepared.next).toMatchObject({workId:'8001',calibreId:'incoming-calibre-id',metadata:{calibre_work_link:'https://archiveofourown.org/works/8001'}})
 expect(importedVersion(prepared.next,prepared.previous).notes).toBe('Keep my notes')
 expect(unrelated.workId).toBe('9009')
})
it('matches standalone books by their saved Calibre Work Link',async()=>{
 const file=await unidentifiedFixture(),next=await importEpub(file),link='https://fiction.example/story?id=123'
 const previous=bookDetails({...next,id:'prior-version',metadata:{...next.metadata,calibre_work_link:link},notes:'Private reading note'})
 vi.mocked(listCatalog).mockResolvedValue([catalogBook(previous)])
 vi.mocked(getBookDetails).mockResolvedValue(previous)
 const prepared=await prepareImport(file,undefined,undefined,link)
 expect(prepared.previous?.id).toBe('prior-version')
 expect(prepared.next.metadata.calibre_work_link).toBe(link)
 expect(prepared.next.workId).toBeNull()
})
it('applies the same work-link matching to an existing exact-file download',async()=>{
 const next=bookDetails(await importEpub(await fixture()))
 const active={...next,id:'active-version',notes:'Active reading notes',active:true}
 vi.mocked(listCatalog).mockResolvedValue([catalogBook({...next,active:false}),catalogBook(active)])
 vi.mocked(getBookDetails).mockResolvedValue(active)
 const prepared=await prepareImportVersion(next,undefined,'new-calibre-id','https://archiveofourown.org/works/8001')
 expect(prepared.previous?.id).toBe(active.id)
 expect(prepared.linked).toBe(true)
 expect(importedVersion(prepared.next,prepared.previous)).toMatchObject({notes:active.notes,calibreId:'new-calibre-id'})
})
it('keeps the UUID fallback for blank links and rejects invalid or conflicting links',async()=>{
 const next=await importEpub(await fixture()),previous=bookDetails({...next,id:'uuid-match',workId:null,calibreId:'same-uuid'})
 vi.mocked(listCatalog).mockResolvedValue([catalogBook(previous)])
 vi.mocked(getBookDetails).mockResolvedValue(previous)
 expect((await prepareImport(await fixture(),undefined,'same-uuid','  ')).previous?.id).toBe('uuid-match')
 for(const link of ['not a URL','javascript:alert(1)','https://user:password@example.com/work']) await expect(prepareImport(await fixture(),undefined,undefined,link)).rejects.toThrow('Calibre Work Link must')
 await expect(prepareImport(await fixture(),undefined,undefined,'https://archiveofourown.org/works/9009')).rejects.toThrow('different AO3 work from this EPUB')
})

it('rejects a saved link whose AO3 identity conflicts with the incoming EPUB',async()=>{
 const next=await importEpub(await fixture()),link='https://fiction.example/story'
 const previous=bookDetails({...next,id:'other-work',workId:'9009',metadata:{...next.metadata,calibre_work_link:link}})
 vi.mocked(listCatalog).mockResolvedValue([catalogBook(previous)])
 await expect(prepareImport(await fixture(),undefined,undefined,link)).rejects.toThrow('saved EPUB for a different AO3 work')
})
