import { ExportWorkMetadata } from '../library/ExportWorkMetadata'
import { useActivity } from '../../lib/use-activity'
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
export function MetadataRefreshButton({ busy, status, message, onRefresh, unavailable = false, variant = 'inline', label = 'Retry / Update Metadata', description }: { busy: boolean; status: MetadataRefreshStatus; message: string; onRefresh: () => void; unavailable?: boolean; variant?: 'inline' | 'button' | 'icon'; label?: string; description?: string }) {
 const Icon = status === 'completed' ? Check : status === 'failed' || status === 'partial' || status === 'unknown' ? CircleAlert : status === 'pending' ? Clock : status === 'cancelled' ? X : RefreshCw
 const spinning = status === 'submitting' || status === 'processing'
 return <Tooltip description={description || (unavailable ? 'No AO3 work ID is available for this deleted bookmark.' : message || 'Update Metadata')}>{descriptionId => <button className={variant === 'icon' ? 'button secondary' : variant === 'button' ? 'button secondary story-metadata-edit' : 'icon-button inline-edit-icon metadata-refresh'} type="button" aria-label={label} aria-describedby={descriptionId} aria-busy={busy} data-refresh-status={status} disabled={busy||sampleMode||unavailable} onClick={onRefresh}><Icon className={spinning ? 'metadata-refresh-spinning' : undefined} size={variant === 'button' ? 14 : variant === 'icon' ? 16 : '1em'} aria-hidden="true" />{variant === 'button' && <span className="story-metadata-label">Metadata</span>}</button>}</Tooltip>
}
export function MetadataControls({story,refreshButton,refreshMessage}:{story:Story;refreshButton:ReactNode;refreshMessage:string}) {
 const {refreshStory}=useLibrary(), [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[field,setField]=useState('')
 useActivity(Boolean(busy), 'Updating metadata…')
 const overrides=Object.keys(story.metadata_overrides??{}).filter(key=>key!=='manual_url')
 async function action(fn:()=>Promise<unknown>, success = 'Saved.') {setBusy(true);try{await fn();await refreshStory(story.id);setMessage(success)}catch(e){setMessage(e instanceof Error?e.message:'Could not update metadata.')}finally{setBusy(false)}}
 return <section className="settings-card details-metadata-panel" aria-label="Automatic Metadata"><div className="story-section-heading story-section-heading-actions"><h2>Automatic Metadata</h2><div className="inline-edit">{refreshButton}<ExportWorkMetadata story={story} inline /></div></div><p>Last attempted: {story.work.last_metadata_check?formatDateTime(story.work.last_metadata_check):'Never'} · Last successful: {story.work.last_metadata_success?formatDateTime(story.work.last_metadata_success):'Never'}</p><div className="form-actions"><Link className="clickable-text" to="/imports">View Import History</Link></div>{overrides.length>0&&<form aria-label="Restore Automatic Metadata" className="story-form" onSubmit={event=>{event.preventDefault();void action(()=>clearOverride(story.id,field))}}><label>Restore Automatic Management for a Field<select value={field} onChange={event=>setField(event.target.value)}><option value="">Choose a Manual Override</option>{overrides.map(key=><option key={key} value={key}>{key}</option>)}</select></label><button className="button secondary" disabled={busy||sampleMode||!field}>Remove Selected Override</button><p className="field-help">Removes your private correction and shows the available automatic value. Reading data is preserved.</p></form>}{refreshMessage&&<p role="status">{refreshMessage}</p>}{message&&<p role="status">{message}</p>}</section>
}
