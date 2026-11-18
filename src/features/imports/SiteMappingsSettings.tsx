import { useState } from 'react'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { FilePicker } from '../../components/FilePicker'
import { downloadFile } from '../../lib/download'
import { formatDateTime } from '../../lib/dates'
import { sampleMode } from '../../lib/sample-mode'
import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../types/database'
import { exportMappings, importMappings, storyFields, type MappingRule } from './site-mapping'
import { loadSiteMappings } from './site-bulk-repository'
import { siteMappingsSettingsSection } from './settings-sections'

const scopeLabels = { exact: 'Exact URL', matching: 'Matching Story Pages', site: 'Site-Wide Defaults' }

export function SiteMappingsSettings() {
 const [rules, setRules] = useState<MappingRule[] | null>(null)
 const [pending, setPending] = useState<MappingRule[]>([])
 const [deleting, setDeleting] = useState<MappingRule>()
 const [confirmed, setConfirmed] = useState(false)
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 const [error, setError] = useState('')
 const hasBroad = pending.some(rule => rule.scope !== 'exact')
 async function run(action: () => Promise<void>) {
  setBusy(true); setError(''); setMessage('')
  try { await action() }
  catch (error) { setError(error instanceof Error ? error.message : 'Could not update site mappings. Try again.') }
  finally { setBusy(false) }
 }
 async function preview(file: File) {
  if (file.size > 250000) throw new Error('Choose a mapping file smaller than 250 KB.')
  setPending([]); setConfirmed(false)
  const rules = importMappings(await file.text())
  if (!rules.length) throw new Error('This file contains no site mappings.')
  setPending(rules)
 }
 async function write(parameters: Database['public']['Functions']['write_site_mapping']['Args']) {
  if (!supabase || sampleMode) throw new Error('Sign in to manage account mappings.')
  const { data, error } = await supabase.rpc('write_site_mapping', parameters)
  if (error) throw new Error('Could not save site mappings. Check your connection and retry.')
  if (!data) throw new Error('This rule changed on another device. Reload your mappings before retrying.')
 }
 return <section className="settings-card" id={siteMappingsSettingsSection.id} tabIndex={-1}>
  <h2>{siteMappingsSettingsSection.title}</h2>
  <p>Open a story page and click the Chrome/Edge companion to create a mapping or review a repair. Reusable rules are private to your account.</p>
  {sampleMode ? <p>Sign in to save and manage reusable rules. You can map a field for one use in the local companion.</p> : <>
   <div className="form-actions">
    <button type="button" className="button secondary" disabled={busy} onClick={() => void run(async () => setRules(await loadSiteMappings()))}>{rules ? 'Reload Site Mappings' : 'Load Site Mappings'}</button>
    {Boolean(rules?.length) && <button type="button" className="button secondary" disabled={busy} onClick={() => downloadFile(new Blob([exportMappings(rules ?? [])], { type: 'application/json' }), 'site-mappings.json')}>Export Site Mappings</button>}
    <FilePicker label="Import Site Mappings" accept=".json,application/json" disabled={busy} onChange={files => void run(() => preview(files[0]))} />
   </div>
   {rules?.length === 0 && <p>You have no saved mappings.</p>}
   {rules && rules.length > 0 && <ul>{rules.map(rule => <li key={rule.id}>
    <p><strong>{storyFields[rule.field]} · {scopeLabels[rule.scope]} · {rule.validation.health}</strong></p>
    <p>{new URL(rule.example).origin}{rule.prefix ?? (rule.scope === 'exact' ? new URL(rule.example).pathname : '')} · Last validation {formatDateTime(rule.validation.when)}</p>
    <p>{rule.validation.current || 'No extracted value available.'}</p>
    {rule.validation.health !== 'Working' && rule.previous && <p>Previously confirmed: {rule.previous}</p>}
    <div className="form-actions"><a className="button secondary" href={rule.validation.example} target="_blank" rel="noopener noreferrer">{rule.validation.health === 'Working' ? 'Open Example Page' : 'Open Page to Review Repair'}</a>
     <button type="button" className="button secondary" onClick={() => setDeleting(rule)} disabled={busy}>Delete Mapping</button></div>
   </li>)}</ul>}
   {pending.length > 0 && <div>
    <h3>Review Imported Mappings</h3>
    <ul>{pending.map(rule => <li key={rule.id}>{new URL(rule.example).origin}{rule.prefix ?? ''} · {storyFields[rule.field]} · {scopeLabels[rule.scope]}</li>)}</ul>
    {hasBroad && <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Enable Rules That Match Other Pages on These Sites</label>}
    <div className="form-actions">
     <button type="button" className="button primary" disabled={busy || hasBroad && !confirmed} onClick={() => void run(async () => {
      await write({ p_import: pending as unknown as Json })
      setPending([]); setMessage('Site mappings imported.')
      setRules(await loadSiteMappings())
     })}>Import Reviewed Mappings</button>
     <button type="button" className="button secondary" disabled={busy} onClick={() => setPending([])}>Cancel</button>
    </div>
   </div>}
  </>}
  {deleting && <ConfirmationDialog title="Delete Site Mapping" confirmLabel="Delete Mapping" pendingLabel="Deleting…" onClose={() => setDeleting(undefined)} onConfirm={async () => {
   await write({ p_id: deleting.id, p_version: deleting.version })
   setRules(current => current?.filter(rule => rule.id !== deleting.id) ?? null)
   setDeleting(undefined); setMessage('Mapping deleted.')
  }}><p>Delete this rule for {storyFields[deleting.field]}? Saved story values stay in your library.</p></ConfirmationDialog>}
  {error && <p role="alert">{error}</p>}
  {message && <p role="status">{message}</p>}
 </section>
}
