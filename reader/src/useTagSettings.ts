import { useEffect, useState } from 'react'
import { tagAppearance, type TagAppearance } from '../../src/features/library/display/display-settings'
import type { Connection } from './model'
import { loadSetting, setting } from './storage'
import { rpc } from './sync'

export function useTagSettings(connection: Connection | undefined, enabled: boolean, local: TagAppearance) {
 const [saved, setSaved] = useState<{account: string; appearance: TagAppearance}>(), [error, setError] = useState('')
 useEffect(() => {
  if (!connection || !enabled) return
  let active = true, pending = false
  async function refresh() {
   if (!active || pending || !navigator.onLine) return
   pending = true
   try {
    const result = await rpc(connection!, 'tag_get', '1')
    if (!Object.hasOwn(result, 'tagAppearance')) throw new Error('Update the organizer backend to enable tag-settings sync.')
    const snapshot = { account: connection!.account, appearance: tagAppearance(JSON.stringify({tagAppearance: result.tagAppearance})) }
    if (!active) return
    await setting('organizer-tag-appearance', snapshot)
    if (active) { setSaved(snapshot); setError('') }
   } catch (error) { if (active) setError(error instanceof Error ? error.message : 'Organizer settings could not be refreshed. Saved settings are retained.') }
   finally { pending = false }
  }
  void loadSetting<{account: string; appearance: TagAppearance}>('organizer-tag-appearance').then(cache => { if (active && cache?.account === connection.account) setSaved(cache); return refresh() }).catch(error => { if (active) setError(String(error)) })
  const timer = setInterval(() => void refresh(), 30000), focus = () => { void refresh() }
  window.addEventListener('online', focus); window.addEventListener('focus', focus)
  const foreground = () => { if (document.visibilityState === 'visible') focus() }
  document.addEventListener('visibilitychange', foreground)
  return () => { active = false; clearInterval(timer); window.removeEventListener('online', focus); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', foreground) }
 }, [connection, enabled])
 const cached = enabled && saved?.account === connection?.account ? saved : undefined
 return { appearance: cached?.appearance ?? local, error: enabled ? error : '', loaded: Boolean(cached) }
}
