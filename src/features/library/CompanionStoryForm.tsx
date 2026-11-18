import { useState } from 'react'
import { loadCompanionDraft } from '../imports/extension'
import { loadStories } from './repository'
import { StoryForm } from './StoryForm'
import type { Story } from './model'

type Draft = Awaited<ReturnType<typeof loadCompanionDraft>> & { story?: Story }

export function CompanionStoryForm({ id }: { id: string }) {
 const [draft, setDraft] = useState<Draft>()
 const [manual, setManual] = useState(false)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 async function restore() {
  setBusy(true); setError('')
  try {
   const draft = await loadCompanionDraft(id)
   const storyId = draft.draft?.storyId
   const [story] = storyId ? await loadStories([storyId]) : []
   if (storyId && (!story || story.source_url !== draft.url)) throw new Error('The story is unavailable in this account. Reopen the companion to check the draft.')
   setDraft({ ...draft, story })
  } catch (error) { setError((error as Error).message) }
  finally { setBusy(false) }
 }
 if (draft) return <StoryForm story={draft.story} companion={draft} />
 if (manual) return <StoryForm />
 return <section className="settings-card"><h2>Companion Story Draft</h2>
  <p>Resume the draft from your connected browser, or open a blank manual form.</p>
  <div className="form-actions">
   <button type="button" className="button primary" disabled={busy} onClick={() => void restore()}>{busy ? 'Restoring…' : 'Restore Draft'}</button>
   <button type="button" className="button secondary" disabled={busy} onClick={() => setManual(true)}>Open Manual Form</button>
  </div>
  {error && <p role="alert">{error}</p>}
 </section>
}
