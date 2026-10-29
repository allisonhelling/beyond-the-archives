import { useActivity } from '../../lib/use-activity'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { defaultRatingInfo, RatingInfoContext } from '../library/rating-info'
import { personalRatingSettingsSection } from './settings-sections'

async function readAccountRatingInfo() {
 if (!supabase) throw new Error('Database is not configured.')
 const { data, error } = await supabase.rpc('personal_rating_settings')
 if (error) throw error
 return (data as { ratingInfo: string | null }).ratingInfo
}

const sampleKey = 'between-chapters:sample-rating-info'
const SettingsContext = createContext<{ text: string; base: string | null; loaded: boolean; error: string; save(text: string, base: string | null): Promise<void> } | null>(null)

export function PersonalRatingProvider({ children, userId }: { children: ReactNode; userId?: string }) {
 const revision = useRef(0), saving = useRef(false)
 const [saved, setSaved] = useState<string | null>(null), [loaded, setLoaded] = useState(false), [error, setError] = useState('')
 useEffect(() => {
  let active = true, pending = false
  async function refresh() {
   if (pending || saving.current) return
   const version = revision.current
   pending = true
   try {
    let text: string | null
    if (sampleMode) text = localStorage.getItem(sampleKey)
    else {
     if (!supabase || !userId) return
     text = await readAccountRatingInfo()
    }
    if (active && version === revision.current) { setSaved(text); setLoaded(true); setError('') }
   } catch { if (active) setError('Could not load your personal rating explanation. Try again when connected.') }
   finally { pending = false }
  }
  void refresh()
  const timer = setInterval(() => void refresh(), 30000)
  const focus = () => { void refresh() }
  window.addEventListener('focus', focus)
  return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focus) }
 }, [userId])
 const text = saved ?? defaultRatingInfo
 async function save(next: string, base: string | null) {
  if (next.length > 10000) throw new Error('Keep the rating explanation under 10,000 characters.')
  revision.current++; saving.current = true
  try {
   if (sampleMode) localStorage.setItem(sampleKey, next)
   else {
    if (!supabase || !userId || !loaded) throw new Error('Load your account settings before saving.')
    const { error } = await supabase.rpc('personal_rating_settings', { p_input: { text: next, base } })
    if (error?.code === '40001') {
     await readAccountRatingInfo().then(setSaved).catch(() => {})
     throw new Error('This explanation changed on another device. Choose Use saved explanation before editing it again. Your draft is kept here.')
    }
    if (error) throw new Error('Could not save your rating explanation. Try again.')
   }
   setSaved(next)
  } finally { saving.current = false }
 }
 return <SettingsContext value={{ text, base: saved, loaded, error, save }}><RatingInfoContext value={text}>{children}</RatingInfoContext></SettingsContext>
}

export function PersonalRatingSettings() {
 const settings = useContext(SettingsContext)
 const [draft, setDraft] = useState<{ text: string; base: string | null } | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
 useActivity(Boolean(busy), 'Saving rating settings…')
 return <section id={personalRatingSettingsSection.id} tabIndex={-1} className="settings-card"><h2>{personalRatingSettingsSection.title}</h2><p>Explain what each star means to you. Saved changes apply to your account in the app and paired Chrome and Safari bars. Leave blank to hide the info icon.</p><form className="story-form" onSubmit={event => {
  event.preventDefault(); if (!settings || busy) return
  setBusy(true); setMessage('')
  void settings.save(draft?.text ?? settings.text, draft ? draft.base : settings.base).then(() => { setDraft(null); setMessage('Personal rating explanation saved.') }).catch(error => setMessage(error instanceof Error ? error.message : 'Could not save.')).finally(() => setBusy(false))
 }}><label>Personal Rating Info Text<textarea rows={6} maxLength={10000} value={draft?.text ?? settings?.text ?? defaultRatingInfo} disabled={busy || !settings?.loaded} onChange={event => setDraft({ text: event.target.value, base: draft ? draft.base : settings?.base ?? null })} /></label><button className="button primary" disabled={busy || !settings?.loaded}>Save Rating Info</button><button type="button" className="button secondary" disabled={busy || !settings?.loaded} onClick={() => { setDraft(null); setMessage('') }}>Use Saved Explanation</button>{sampleMode && <p className="muted">Sample settings stay in this browser.</p>}{settings?.error && <p role="alert">{settings.error}</p>}{message && <p role="status">{message}</p>}</form></section>
}
