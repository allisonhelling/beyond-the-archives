import { useState } from 'react'
import { Link } from 'react-router-dom'
import { beginSitePreview, readSitePreview } from './extension'
import { sourcePage, storyFields, type Observations, type SiteRequest, type StoryField } from './site-mapping'

export function SitePreview({ url, initial, onApply, onCaptured, onClassify }: { url: string; initial?: Observations; onApply: (field: StoryField, value: string) => void; onCaptured: (value: Observations) => void; onClassify?: (value: Observations) => Promise<void> }) {
 const [result, setResult] = useState({ url, observations: initial ?? {} })
 const [request, setRequest] = useState<SiteRequest>()
 const [field, setField] = useState<StoryField>('title')
 const [message, setMessage] = useState('')
 const [busy, setBusy] = useState(false)
 const page = sourcePage(url)
 if (!page) return null
 const waiting = request?.url === page ? request : undefined
 async function open(teach?: StoryField) {
  if (!page || busy) return
  setBusy(true); setMessage('')
  try {
   setRequest(await beginSitePreview(page, teach))
   setMessage('In the source tab, click the Beyond the Archives toolbar icon to grant access. When done, select Return to Draft.')
  } catch (error) { setMessage((error as Error).message) }
  finally { setBusy(false) }
 }
 async function resume() {
  if (!waiting || busy) return
  setBusy(true); setMessage('')
  try {
   const reply = await readSitePreview(waiting)
   if (reply.code === 'OK') {
    setRequest(undefined)
    const observations = { ...(result.url === waiting.url && result.observations), ...reply.observations }
    setResult({ url: waiting.url, observations })
    onCaptured(observations)
    setMessage(Object.keys(reply.observations ?? {}).length ? 'Review the source values below and apply the fields you want to use.' : 'No source metadata was returned. You can fill in the form manually.')
   } else setMessage('Waiting for the source tab. Open the companion there, then select Return to Draft.')
  } catch (error) { setMessage((error as Error).message) }
  finally { setBusy(false) }
 }
 return <section className="settings-card" aria-label="Source Page Preview">
  <h2>Source Page Preview</h2>
  <div className="form-actions">
   <button className="button secondary" type="button" disabled={busy} onClick={() => void open()}>Preview Source Page</button>
   <Link className="clickable-text" to="/settings#settings-site-mappings" target="_blank" rel="noopener">Site Mappings</Link>
  </div>
  <label>Teach Where to Find This Field<select value={field} onChange={event => setField(event.target.value as StoryField)}>
   {Object.entries(storyFields).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
  </select></label>
  <div className="form-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => void open(field)}>Teach Selected Field</button>
   {waiting && <button className="button secondary" type="button" disabled={busy} onClick={() => void resume()}>Load Source Values</button>}
  </div>
  {message && <p role="status">{message}</p>}
  {result.url === page && onClassify && (['ao3_tags','fandoms','relationship_tags','character_tags','additional_tags'] as const).some(key => result.observations[key]) && <button className="button secondary" type="button" disabled={busy} onClick={() => {
   setBusy(true); setMessage('')
   void onClassify(result.observations).then(() => setMessage('Classified tags applied. You can edit their categories in the form.')).catch(error => setMessage(error.message)).finally(() => setBusy(false))
  }}>Apply Classified Tags</button>}
  {result.url === page && Object.entries(result.observations).map(([key, evidence]) => <div key={key}>
   <strong>{storyFields[key as StoryField]} · {evidence.via}</strong>
   <p>{evidence.text}</p>
   <button className="button secondary" type="button" onClick={() => onApply(key as StoryField, evidence.text)}>Apply {storyFields[key as StoryField]}</button>
  </div>)}
 </section>
}
