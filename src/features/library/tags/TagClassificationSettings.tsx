import { useContext, useMemo, useState } from 'react'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { downloadFile } from '../../../lib/download'
import { AuthContext } from '../../auth/auth-context'
import { loadCatalog } from '../repository'
import type { Story } from '../model'
import { classificationKey, createTagClassifier, ruleScopes, tagCategories, type ClassificationRule, type RuleScope, type TagCategory } from './classification'
import { loadClassificationRevision, loadClassificationRules, loadTagEvidence, resetClassificationRules, saveClassificationRule } from './classification-repository'
import { useTagResolutions } from './useTagResolutions'

import { tagExplorerSection, classificationRulesSection } from '../../settings/settings-sections'

const evidenceLabels = { rule: 'Personal Rule', conflict: 'Needs Review', source: 'Source Category', canonical: 'Verified AO3 Evidence', structure: 'Tag Structure', unknown: 'Insufficient Evidence' }
type Entry = { story: Story; evidence: Awaited<ReturnType<typeof loadTagEvidence>> }
type RulesProps = { rules: ClassificationRule[]; revision: string; reload: () => Promise<void> }
function newRule(story: Entry, label: string, category: TagCategory): ClassificationRule {
 return { id: crypto.randomUUID(), version: 0, label, category, scope: 'story', site: story.evidence.site, story_id: story.story.id, fandom: story.story.metadata.fandoms[0] ?? null, priority: null, enabled: true }
}

function RuleEditor({ rule, onSave, onClose }: { rule: ClassificationRule; onSave: (rule: ClassificationRule) => Promise<void>; onClose: () => void }) {
 const [draft, setDraft] = useState(rule), [busy, setBusy] = useState(false), [error, setError] = useState('')
 const site = draft.scope === 'site' || draft.scope === 'site_fandom'
 const fandom = draft.scope === 'fandom' || draft.scope === 'site_fandom'
 async function save() {
  setBusy(true); setError('')
  try {
   await onSave({ ...draft, label: draft.label.trim(), site: site ? draft.site?.trim() || null : null, fandom: fandom ? draft.fandom?.trim() || null : null, story_id: draft.scope === 'story' ? draft.story_id : null })
   onClose()
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this rule.') }
  finally { setBusy(false) }
 }
 return <form className="story-form" onSubmit={event => { event.preventDefault(); void save() }}>
  <label>Tag<input required maxLength={10000} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} /></label>
  <label>Category<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as TagCategory })}>{Object.entries(tagCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
  <label>Scope<select value={draft.scope} onChange={event => setDraft({ ...draft, scope: event.target.value as RuleScope })}>{Object.entries(ruleScopes).map(([key, label]) => <option key={key} value={key} disabled={key === 'story' && !draft.story_id}>{label}</option>)}</select></label>
  {site && <label>Site<input required value={draft.site ?? ''} onChange={event => setDraft({ ...draft, site: event.target.value })} /><small>Use ao3 or the source origin, including https://.</small></label>}
  {fandom && <label>Fandom<input required maxLength={10000} value={draft.fandom ?? ''} onChange={event => setDraft({ ...draft, fandom: event.target.value })} /></label>}
  <details open={draft.priority !== null ? true : undefined}><summary>Priority Override</summary>
   <label>Priority<input type="number" min={-1000} max={1000} value={draft.priority ?? ''} onChange={event => setDraft({ ...draft, priority: event.target.value === '' ? null : Number(event.target.value) })} /><small>Leave blank for the scope default. Site priority is 30 and fandom priority is 20.</small></label>
  </details>
  <label className="check-label"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Enabled</label>
  <div className="form-actions"><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save Rule'}</button><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button></div>
  {error && <p role="alert">{error}</p>}
 </form>
}

function sourceSite(story: Story) {
 if (story.source_url) { try { return new URL(story.source_url).origin } catch { return '' } }
 return story.work.ao3_work_id ? 'ao3' : ''
}

function Explorer({ rules, reload }: RulesProps) {
 const [catalog, setCatalog] = useState<Story[]>([]), [selected, setSelected] = useState<Entry>(), [storyId, setStoryId] = useState('')
 const [search, setSearch] = useState(''), [source, setSource] = useState(''), [category, setCategory] = useState(''), [evidence, setEvidence] = useState('')
 const [correction, setCorrection] = useState<ClassificationRule>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
 const { records } = useTagResolutions(undefined, [], false)
 const fandomEvidence = selected?.evidence.canonicalFandoms
 const classify = useMemo(() => createTagClassifier(rules, [...records, ...(fandomEvidence ?? [])]), [rules, records, fandomEvidence])
 async function run(action: () => Promise<void>) {
  setError(''); setBusy(true)
  try { await action() }
  catch (e) { setError(e instanceof Error ? e.message : 'Could not load tag evidence.') }
  finally { setBusy(false) }
 }
 const context = selected && {
  storyId: selected.story.id, site: selected.evidence.site ?? '', fandoms: selected.evidence.tags.filter(tag => tag.sourceCategory === 'fandom').map(tag => tag.label),
  ...(selected.evidence.site === 'ao3' && { authority: 'ao3' as const, relationshipSyntax: true }),
 }
 const results = (selected && context ? selected.evidence.tags.map(tag => classify(tag, context)) : []).filter(result => classificationKey(result.label).includes(classificationKey(search))
  && (!category || result.category === category) && (!evidence || result.evidence === evidence))
 return <>
  <button className="button secondary" disabled={busy} onClick={() => void run(async () => setCatalog((await loadCatalog(undefined, true)).stories))}>Load Stories</button>
  {catalog.length > 0 && <div className="story-form">
   <label>Source<select value={source} disabled={busy} onChange={event => { setSource(event.target.value); setStoryId(''); setSelected(undefined); setCorrection(undefined) }}><option value="">All Sources</option>{[...new Set(catalog.map(sourceSite))].filter(Boolean).sort().map(site => <option key={site} value={site}>{site === 'ao3' ? 'AO3' : site}</option>)}</select></label>
   <label>Story<select value={storyId} disabled={busy} onChange={event => {
    const story = catalog.find(story => story.id === event.target.value)
    setStoryId(event.target.value); setSelected(undefined); setCorrection(undefined)
    if (story) void run(async () => setSelected({ story, evidence: await loadTagEvidence(story.id) }))
   }}><option value="">Choose a Story</option>{catalog.filter(story => !source || sourceSite(story) === source).map(story => <option key={story.id} value={story.id}>{story.metadata.title}</option>)}</select></label>
   {selected && <>
    <label>Search Tags<input value={search} onChange={event => setSearch(event.target.value)} /></label>
    <label>Effective Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="">All Categories</option>{Object.entries(tagCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Evidence<select value={evidence} onChange={event => setEvidence(event.target.value)}><option value="">All Evidence</option>{Object.entries(evidenceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
   </>}
  </div>}
  {selected && !results.length && <p>No source tags match these filters.</p>}
  {selected && results.length > 0 && <ul>{results.map((result, index) => <li key={index}>
   <strong>{result.label}</strong> · {tagCategories[result.category]}{result.needsReview && ' · Needs Review'}{result.sourceDisagrees && ' · Source Disagrees'}
   <details><summary>Why This Classification?</summary><p>{result.explanation}</p><p>Source category {result.sourceCategory ? tagCategories[result.sourceCategory] : 'unavailable'} · Source position {result.position ?? 'unavailable'} · Classifier v{result.version}</p>
    {result.canonical.map(record => <p key={record.category}>Verified AO3 {record.status} · {record.canonical_name}</p>)}
    {result.heuristic && <p>Relationship structure detected.</p>}
    {result.matches.map(rule => <p key={rule.id}>{ruleScopes[rule.scope]} · {tagCategories[rule.category]}{result.winningRules.includes(rule) && ' · Applies at Winning Priority'}</p>)}
   </details>
   <button className="text-button" onClick={() => setCorrection(result.matches.find(rule => rule.scope === 'story') ?? newRule(selected, result.label, result.category))}>Correct {result.label}</button>
  </li>)}</ul>}
  {correction && <RuleEditor key={correction.id} rule={correction} onSave={async rule => { await saveClassificationRule(rule); await reload() }} onClose={() => setCorrection(undefined)} />}
  {error && <p role="alert">{error}</p>}
 </>
}

function MyRules({ rules, reload, revision }: RulesProps) {
 const [search, setSearch] = useState(''), [editing, setEditing] = useState<ClassificationRule>(), [deleting, setDeleting] = useState<ClassificationRule>()
 const [error, setError] = useState(''), [reset, setReset] = useState<string>()
 const filtered = rules.filter(rule => classificationKey(rule.label).includes(classificationKey(search)))
 return <>
  <div className="story-form"><label>Search Rules<input value={search} onChange={event => setSearch(event.target.value)} /></label></div>
  <div className="form-actions">
   <button className="button secondary" onClick={() => { setError(''); void reload().catch(error => setError(error.message)) }}>Reload Rules</button>
   <button className="button secondary" disabled={!rules.length} onClick={() => downloadFile(new Blob([JSON.stringify({ version: 1, rules }, null, 2)], { type: 'application/json' }), 'classification-rules.json')}>Export Rules</button>
   <button className="button secondary" disabled={!rules.length} onClick={() => { setError(''); setReset(revision) }}>Reset All Rules</button>
  </div>
  {!filtered.length && <p>No matching rules. Choose a tag in Tag Explorer to create a rule.</p>}
  <ul>{filtered.map(rule => <li key={rule.id}>
   <p><strong>{rule.label}</strong> · {tagCategories[rule.category]} · {ruleScopes[rule.scope]}{rule.site && ` · ${rule.site}`}{rule.fandom && ` · ${rule.fandom}`} · {rule.enabled ? 'Enabled' : 'Disabled'}{rule.priority !== null && ` · Priority ${rule.priority}`}</p>
   <div className="form-actions"><button className="button secondary" onClick={() => setEditing(rule)}>Edit Rule</button><button className="button secondary" onClick={() => setDeleting(rule)}>Delete Rule</button></div>
  </li>)}</ul>
  {editing && <RuleEditor key={editing.id} rule={editing} onSave={async rule => { await saveClassificationRule(rule); await reload() }} onClose={() => setEditing(undefined)} />}
  {deleting && <ConfirmationDialog title="Delete Classification Rule" confirmLabel="Delete Rule" pendingLabel="Deleting…" onClose={() => setDeleting(undefined)} onConfirm={async () => {
   await saveClassificationRule(deleting, true); await reload(); setDeleting(undefined)
  }}><p>Delete the rule for {deleting.label}?</p></ConfirmationDialog>}
  {reset && <ConfirmationDialog title="Reset Classification Rules" confirmLabel="Reset All Rules" pendingLabel="Resetting…" onClose={() => setReset(undefined)} onConfirm={async () => {
   await resetClassificationRules(reset); await reload(); setReset(undefined)
  }}><p>Delete all classification rules in this account?</p></ConfirmationDialog>}
  {error && <p role="alert">{error}</p>}
 </>
}

function ClassificationTools({ userId }: { userId: string }) {
 const [snapshot, setSnapshot] = useState<{ rules: ClassificationRule[]; revision: string }>()
 const [error, setError] = useState(''), [busy, setBusy] = useState(false)
 const reload = async () => {
  const revision = await loadClassificationRevision()
  setSnapshot({ revision, rules: await loadClassificationRules(userId) })
 }
 const props = { rules: snapshot?.rules ?? [], revision: snapshot?.revision ?? '', reload }
 return <>
  <section className="settings-card" id={tagExplorerSection.id} tabIndex={-1}>
   <h2>{tagExplorerSection.title}</h2>
   {snapshot ? <Explorer {...props} /> : <button className="button secondary" disabled={busy} onClick={() => {
    setBusy(true); setError('')
    void reload().catch(error => setError(error.message)).finally(() => setBusy(false))
   }}>Load Classification Tools</button>}
   {error && <p role="alert">{error}</p>}
  </section>
  <section className="settings-card" id={classificationRulesSection.id} tabIndex={-1}>
   <h2>{classificationRulesSection.title}</h2>
   {snapshot ? <MyRules {...props} /> : <p>Load the classification tools to manage your rules.</p>}
  </section>
 </>
}

export function TagClassificationSettings() {
 const userId = useContext(AuthContext)?.session?.user.id
 return userId ? <ClassificationTools key={userId} userId={userId} /> : <section className="settings-card" id={tagExplorerSection.id} tabIndex={-1}><h2>{tagExplorerSection.title}</h2><p>Sign in to use classification tools.</p></section>
}
