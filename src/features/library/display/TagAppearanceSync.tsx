import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { displaySnapshot, sameTagAppearance, saveTagAppearance, subscribeDisplay, tagAppearance, type TagAppearance } from './display-settings'

// Tag appearance is shared by account; tile/page layouts remain browser-local.
export function TagAppearanceSync({ userId }: { userId: string }) {
 const [error, setError] = useState(''), [conflict, setConflict] = useState(false)
 const [resolve, setResolve] = useState<((keepLocal: boolean) => void)>()
 useEffect(() => {
  let active = true, inFlight = false, applying = false, base: TagAppearance | null | undefined, pending: TagAppearance | undefined
  const ownerKey = 'between-chapters:tag-appearance-owner', pendingKey = `between-chapters:tag-appearance-pending:${userId}`
  const same = sameTagAppearance
  let seed = tagAppearance(displaySnapshot()), ownerChanged = false
  try {
   const owner = localStorage.getItem(ownerKey)
   if (owner && owner !== userId) { seed = tagAppearance('{}'); ownerChanged = true }
   localStorage.setItem(ownerKey, userId)
   const queued = localStorage.getItem(pendingKey)
   if (queued) { const saved = JSON.parse(queued); pending = saved.appearance; base = saved.base }
  } catch { /* Normal display storage remains usable without a pending cache. */ }
  function apply(value: TagAppearance) { if (same(value, tagAppearance(displaySnapshot()))) return; applying = true; try { saveTagAppearance(value) } finally { applying = false } }
  if (ownerChanged) apply(pending ?? seed)
  function queue(appearance: TagAppearance) {
   pending = appearance
   try { localStorage.setItem(pendingKey, JSON.stringify({ appearance, base: base ?? null })) } catch { /* The saved display value is still retained. */ }
  }
  async function refresh() {
   if (!active || inFlight || !supabase || !navigator.onLine) return
   inFlight = true
   try {
    const { data, error } = await supabase.rpc('tag_appearance_settings')
    if (error) throw error
    if (!active) return
    const remote = (data as {tagAppearance: TagAppearance | null}).tagAppearance
    if (pending && base !== undefined && !same(remote, base) && !same(remote, pending)) {
     setConflict(true); setError('Tag settings changed on another device. Your local settings are retained.')
     setResolve(() => (keepLocal: boolean) => {
      base = remote; setConflict(false); setError('')
      if (keepLocal && pending) queue(pending)
      else { pending = undefined; localStorage.removeItem(pendingKey); apply(remote ?? tagAppearance('{}')) }
      void refresh()
     }); return
    }
    if (!pending && remote === null) { base = null; queue(seed) }
    if (pending) {
     const sent = pending
     const { error } = await supabase.rpc('tag_appearance_settings', { p_input: { tagAppearance: sent, base: base ?? remote } })
     if (error) throw error
     if (!active) return
     base = sent
     if (same(pending, sent)) { pending = undefined; localStorage.removeItem(pendingKey); apply(sent) }
     else queue(pending)
    } else { base = remote; if (remote) apply(remote) }
    setError(''); setConflict(false)
   } catch (error) { if (active) setError(`Tag settings sync paused: ${error instanceof Error ? error.message : 'Check your connection or backend migrations.'}`) }
   finally { inFlight = false }
  }
  const unsubscribe = subscribeDisplay(() => {
   if (applying || !active) return
   const appearance = tagAppearance(displaySnapshot())
   if (!same(appearance, base) && !same(appearance, pending)) { queue(appearance); void refresh() }
  })
  void refresh()
  const timer = setInterval(() => void refresh(), 30000), focus = () => { void refresh() }, foreground = () => { if (document.visibilityState === 'visible') focus() }
  window.addEventListener('focus', focus); window.addEventListener('online', focus); document.addEventListener('visibilitychange', foreground)
  return () => { active = false; unsubscribe(); clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('online', focus); document.removeEventListener('visibilitychange', foreground) }
 }, [userId])
 return error ? <aside className="notice" role="alert">{error}{conflict && <div className="form-actions"><button onClick={() => resolve?.(false)}>Use Organizer Settings</button><button onClick={() => resolve?.(true)}>Keep This Device’s Settings</button></div>}</aside> : null
}
