import { useState } from 'react'
import { Dialog } from '../../src/components/Dialog'
import { DisplayEditor } from '../../src/features/library/display/DisplayEditor'
import { useLayout, type DisplayLayout } from '../../src/lib/use-layout'
import type { TagAppearance, DisplayPreferences } from '../../src/features/library/display/display-settings'
import { ReaderTile } from './ReaderTile'
import { defaultReaderTile, readerTileFields, readerTilePreferences } from './tile-layout'
import { blankMetadata, type CatalogBook, type Preferences } from './model'
const noop=()=>{}
const sample:CatalogBook={id:'preview',workId:null,active:true,hasFile:true,metadata:{...blankMetadata,title:'A Story to Carry With You',authors:['Example Author'],fandoms:['Example Fandom'],additional_tags:['Found Family','Adventure'],summary:'A saved EPUB, ready for your next chapter.',word_count:42000,published_chapters:8,rating:'Teen And Up Audiences',publication_status:'in_progress'},importedAt:'2026-10-01',metadataAt:'2026-10-01',position:{chapter:'one',fraction:.4},status:'reading',collections:[],chapterCount:8,wordCount:42000,completedCount:3}
export function TileSettings({preferences,appearance,book=sample,onSave,onClose}:{preferences:Preferences;appearance:TagAppearance;book?:CatalogBook;onSave:(layout:DisplayLayout,value:DisplayPreferences['workTile'])=>Promise<void>;onClose:()=>void}) {
 const device=useLayout(),[layout,setLayout]=useState<DisplayLayout>(device)
 const [drafts,setDrafts]=useState(()=>({mobile:readerTilePreferences(preferences,'mobile',appearance),desktop:readerTilePreferences(preferences,'desktop',appearance)})),[version,setVersion]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const draft={...drafts[layout],tagAppearance:appearance}
 async function save(){setBusy(true);setError('');try{await onSave(layout,draft.workTile);setMessage(`${layout==='mobile'?'Mobile':'Desktop'} tile layout saved.`)}catch(e){setError(String(e))}finally{setBusy(false)}}
 return <Dialog title="Customize Tiles" className="tile-settings-dialog" busy={busy} onClose={onClose}>
  <p>Move and hide information directly in the preview. Group fields on one line or add dividers. Mobile and desktop layouts save separately. Tag Format controls tag style and colors.</p>
  <div className="dialog-actions" role="group" aria-label="Tile Layout"><button aria-pressed={layout==='desktop'} onClick={()=>{setLayout('desktop');setMessage('')}}>Desktop</button><button aria-pressed={layout==='mobile'} onClick={()=>{setLayout('mobile');setMessage('')}}>Mobile</button></div>
  <DisplayEditor key={`${layout}:${version}`} title="Reader Tile" groups={['workTile']} fields={{workTile:readerTileFields}} state={{draft,change:next=>{setDrafts(current=>({...current,[layout]:next}));setMessage('Unsaved changes')}}} viewport={layout==='mobile'?{width:390,height:844}:{width:1440,height:900}}>
   <ReaderTile book={book} preferences={preferences} appearance={appearance} onRead={noop} onManage={noop} onDetails={noop} onRemove={noop} onDelete={noop} onSearch={noop} />
  </DisplayEditor>
  <div className="dialog-actions"><button className="primary" disabled={busy} onClick={()=>void save()}>Save Layout</button><button disabled={busy} onClick={()=>{setDrafts(current=>({...current,[layout]:{...current[layout],workTile:defaultReaderTile()}}));setVersion(value=>value+1);setMessage('Default layout ready. Save Layout to apply.')}}>Restore to Default</button><button disabled={busy} onClick={onClose}>Cancel</button></div>
  <p role="status">{message}</p>{error&&<p role="alert">{error}</p>}
 </Dialog>
}
