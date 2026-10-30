import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/auth-context'
import { clearOfflineSnapshot, offlineCleared, readOfflineSnapshot, saveOfflineSnapshot, type OfflineSnapshot } from './storage'
const Context = createContext<{ snapshot?: OfflineSnapshot; shellReady: boolean; error: string; refresh: () => Promise<void> }>({ shellReady: false, error: '', refresh: async () => {} })
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { session, authenticated } = useAuth()
  const userId = session?.user.id
  const identity = useRef(userId)
  useEffect(() => { identity.current = userId }, [userId])
  const [snapshot, setSnapshot] = useState(readOfflineSnapshot)
  const [error, setError] = useState('')
  const [shellReady, setShellReady] = useState(false)
  useEffect(() => {
    let active = true
    if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.ready.then(() => { if (active) setShellReady(true) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const clear = () => setSnapshot(undefined)
    window.addEventListener(offlineCleared, clear)
    return () => window.removeEventListener(offlineCleared, clear)
  }, [])
  async function refresh() {
    if (!supabase || !authenticated || !userId || !navigator.onLine) return
    try {
      const { data, error } = await supabase.rpc('reader_offline_snapshot').abortSignal(AbortSignal.timeout(20000))
      if (error) throw error
      const next = { ...(data as unknown as Omit<OfflineSnapshot, 'userId' | 'savedAt'>), userId, savedAt: new Date().toISOString() }
      if (identity.current !== userId) return
      // Do not expose one account's local snapshot to another signed-in account.
      if (!next.readers || !next.stories) throw new Error('Invalid availability report.')
      saveOfflineSnapshot(next); setSnapshot(next); setError('')
    } catch { setError('Could not update reader reports or retain them locally. Showing the last saved report, if available.') }
  }
  useEffect(() => {
    if (userId && snapshot && snapshot.userId !== userId) clearOfflineSnapshot()
    const timer = setTimeout(() => { void refresh() }, 0)
    const update = () => { if (!document.hidden) void refresh() }
    window.addEventListener('online', update); window.addEventListener('focus', update)
    return () => { clearTimeout(timer); window.removeEventListener('online', update); window.removeEventListener('focus', update) }
    // Account changes must fetch a fresh, owner-scoped snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authenticated])
  return <Context value={{ snapshot: userId && snapshot?.userId !== userId ? undefined : snapshot, shellReady, error, refresh }}>{children}</Context>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useOffline() { return useContext(Context) }
