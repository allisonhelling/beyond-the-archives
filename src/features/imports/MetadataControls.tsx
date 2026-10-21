import { formatDateTime } from '../../lib/dates'
import { Check, CircleAlert, Clock, RefreshCw, X } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Story } from '../library/model'
import { useLibrary } from '../library/LibraryProvider'
import { clearOverride } from './repository'
import { sampleMode } from '../../lib/sample-mode'
import type { MetadataRefreshStatus } from './useMetadataRefresh'
export function MetadataRefreshButton({ busy, status, message, onRefresh, variant = 'inline' }: { busy: boolean; status: MetadataRefreshStatus; message: string; onRefresh: () => void; variant?: 'inline' | 'button' }) {
 const Icon = status === 'completed' ? Check : status === 'failed' || status === 'partial' || status === 'unknown' ? CircleAlert : status === 'pending' ? Clock : status === 'cancelled' ? X : RefreshCw
 const spinning = status === 'submitting' || status === 'processing'
 return <Tooltip description={message || 'Update Metadata'}>{descriptionId => <button className={variant === 'button' ? 'button secondary story-metadata-edit' : 'icon-button inline-edit-icon metadata-refresh'} type="button" aria-label="Retry / Update Metadata" aria-describedby={descriptionId} aria-busy={busy} data-refresh-status={status} disabled={busy||sampleMode} onClick={onRefresh}><Icon className={spinning ? 'metadata-refresh-spinning' : undefined} size={variant === 'button' ? 14 : '1em'} aria-hidden="true" />{variant === 'button' && <span className="story-metadata-label">Metadata</span>}</button>}</Tooltip>
}
export function MetadataControls({story,refreshButton,refreshMessage}:{story:Story;refreshButton:ReactNode;refreshMessage:string}) {
 const {refreshStory}=useLibrary(), [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[field,setField]=useState('')
 const overrides=Object.keys(story.metadata_overrides??{}).filter(key=>key!=='manual_url')
 async function action(fn:()=>Promise<unknown>, success = 'Saved.') {setBusy(true);try{await fn();await refreshStory(story.id);setMessage(success)}catch(e){setMessage(e instanceof Error?e.message:'Could not update metadata.')}finally{setBusy(false)}}
 return <section className="settings-card details-metadata-panel" aria-label="Automatic metadata"><div className="story-section-heading story-section-heading-actions"><h2>Automatic metadata</h2>{refreshButton}</div><p>Last attempted: {story.work.last_metadata_check?formatDateTime(story.work.last_metadata_check):'Never'} · Last successful: {story.work.last_metadata_success?formatDateTime(story.work.last_metadata_success):'Never'}</p><div className="form-actions"><Link className="clickable-text" to="/imports">View import history</Link></div>{overrides.length>0&&<form aria-label="Restore automatic metadata" className="story-form" onSubmit={event=>{event.preventDefault();void action(()=>clearOverride(story.id,field))}}><label>Restore automatic management for a field<select value={field} onChange={event=>setField(event.target.value)}><option value="">Choose a manual override</option>{overrides.map(key=><option key={key} value={key}>{key}</option>)}</select></label><button className="button secondary" disabled={busy||sampleMode||!field}>Remove selected override</button><p className="field-help">Removes your private correction and shows the available automatic value. Reading data is preserved.</p></form>}{refreshMessage&&<p role="status">{refreshMessage}</p>}{message&&<p role="status">{message}</p>}</section>
}
