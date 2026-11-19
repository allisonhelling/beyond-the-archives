import { useEffect, useId, useState } from 'react'
import type { Story } from './model'
import { correspondingChapterProgress, loadStoryChapterGroups, writeStoryChapterGroup, type ChapterGroup } from './repository'

const states: Record<ChapterGroup['state'], string> = { confirmed: 'Content Compared', unmatched: 'Source-Exclusive', unknown: 'Unknown' }

function chapterIndex(story: Story) {
 const chapters = story.work.verified_chapters
 return chapters && typeof chapters === 'object' && !Array.isArray(chapters) ? chapters : {}
}
function ordinals(story: Story, chapters: string[]) {
 return Object.entries(chapterIndex(story)).filter(([, id]) => typeof id === 'string' && chapters.includes(id))
  .map(([ordinal]) => Number(ordinal)).sort((left, right) => left - right).join(', ')
}
function chapterIds(story: Story, value: string) {
 const index = chapterIndex(story)
 const positions = value.trim() ? value.split(',').map(part => part.trim()) : []
 if (positions.length > 100 || new Set(positions).size !== positions.length) throw new Error('Choose up to 100 different chapters on each side.')
 return positions.map(position => {
  const id = index[position]
  if (!/^[1-9]\d*$/.test(position) || typeof id !== 'string') throw new Error('Enter chapter numbers from the verified links shown for that source.')
  return id
 })
}

export function StoryChapterGroups({ source, target, revision, onChanged }: {
 source: Story; target: Story; revision: string; onChanged: () => Promise<void>
}) {
 const confirmationId = useId()
 const [left, right] = [source, target].sort((a, b) => a.id.localeCompare(b.id))
 const [groups, setGroups] = useState<ChapterGroup[]>()
 const [editing, setEditing] = useState<ChapterGroup>()
 const [leftInput, setLeftInput] = useState('')
 const [rightInput, setRightInput] = useState('')
 const [state, setState] = useState<ChapterGroup['state']>('unknown')
 const [confirmed, setConfirmed] = useState(false)
 const [preview, setPreview] = useState<number>()
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const [message, setMessage] = useState('')
 const leftId = left.id, rightId = right.id

 useEffect(() => {
  let current = true
  void loadStoryChapterGroups(leftId, rightId).then(value => { if (current) setGroups(value) }, (reason: Error) => { if (current) setError(reason.message) })
  return () => { current = false }
 }, [leftId, rightId, revision])

 async function run(action: () => Promise<void>) {
  setBusy(true); setError(''); setMessage('')
  try { await action() }
  catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save chapter correspondence.') }
  finally { setBusy(false) }
 }
 function edit(group?: ChapterGroup) {
  setEditing(group)
  setState(group?.state ?? 'unknown')
  setLeftInput(group ? ordinals(left, group.left_chapters) : '')
  setRightInput(group ? ordinals(right, group.right_chapters) : '')
  setConfirmed(false)
  setPreview(undefined)
 }
 async function save() {
  if (state === 'confirmed' && !confirmed) throw new Error('Confirm that you compared the chapter content.')
  await writeStoryChapterGroup(left, right, editing ?? { id: crypto.randomUUID(), version: 0 },
   { state, left_chapters: chapterIds(left, leftInput), right_chapters: chapterIds(right, rightInput) })
  setGroups(await loadStoryChapterGroups(left.id, right.id))
  edit()
 }
 async function transfer(apply: boolean) {
  if (!groups) return
  const progress = await correspondingChapterProgress(source.id, target.id, revision, groups, apply)
  if (apply) {
   setPreview(undefined)
   await onChanged()
   setMessage(progress > target.last_read_chapter ? `Target progress updated through Chapter ${progress}.` : 'Target progress stayed the same.')
  } else setPreview(progress)
 }
 const chaptersAvailable = Object.keys(chapterIndex(left)).length + Object.keys(chapterIndex(right)).length > 0
 return <section>
  <h3>Chapter Correspondence</h3>
  <p>Compare chapter content before confirming a group. Matching chapter numbers alone do not establish equivalence.</p>
  {groups?.map(group => <div className="form-actions" key={group.id}>
   <span>{ordinals(left, group.left_chapters) || '—'} ↔ {ordinals(right, group.right_chapters) || '—'} · {group.current ? states[group.state] : 'Chapter Index Changed'}</span>
   <button type="button" className="button secondary" disabled={busy} onClick={() => edit(group)}>Edit Group</button>
   <button type="button" className="button secondary" disabled={busy} onClick={() => void run(async () => {
    await writeStoryChapterGroup(left, right, group)
    setGroups(await loadStoryChapterGroups(left.id, right.id))
    edit()
   })}>Remove Group</button>
  </div>)}
  {groups && chaptersAvailable ? <form className="story-form" onSubmit={event => { event.preventDefault(); void run(save) }}>
   <label>Chapter Numbers for {left.metadata.title} ({left.source_url ? 'Website' : 'AO3'})<input value={leftInput} onChange={event => setLeftInput(event.target.value)} disabled={busy} placeholder="1, 2" /></label>
   <label>Chapter Numbers for {right.metadata.title} ({right.source_url ? 'Website' : 'AO3'})<input value={rightInput} onChange={event => setRightInput(event.target.value)} disabled={busy} placeholder="1" /></label>
   <label>Match Evidence<select value={state} disabled={busy} onChange={event => { setState(event.target.value as ChapterGroup['state']); setConfirmed(false) }}>
    {Object.entries(states).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
   </select></label>
   {state === 'confirmed' && <label htmlFor={confirmationId}><input type="checkbox" id={confirmationId} checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I compared the chapter content across both sources</label>}
   <div className="form-actions"><button className="button secondary" disabled={busy}>{editing ? 'Update Chapter Group' : 'Save Chapter Group'}</button>{editing && <button type="button" className="button secondary" disabled={busy} onClick={() => edit()}>Cancel Edit</button>}</div>
  </form> : groups && <p>These versions have no saved verified chapter links. Continue tracking each source separately.</p>}
  {groups?.some(group => group.current && group.state === 'confirmed') && <div className="form-actions">
   <button type="button" className="button secondary" disabled={busy} onClick={() => void run(() => transfer(false))}>Use This Version’s Progress</button>
   <button type="button" className="button secondary" disabled={busy} onClick={() => { setPreview(undefined); setMessage('Each version keeps its own progress.') }}>Keep Separate</button>
  </div>}
  {preview !== undefined && <div>
   <p>{preview > target.last_read_chapter ? `The selected source supports moving the target from Chapter ${target.last_read_chapter} to Chapter ${preview}. This leaves reading events intact.` : 'No additional contiguous target chapters are supported by the confirmed groups.'}</p>
   {preview > target.last_read_chapter && <button type="button" className="button primary" disabled={busy} onClick={() => void run(() => transfer(true))}>Mark Corresponding Chapters Read</button>}
  </div>}
  {error && <p role="alert">{error}</p>}
  {message && <p role="status">{message}</p>}
 </section>
}
