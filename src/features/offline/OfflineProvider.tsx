import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/auth-context'
import { useActivity } from '../../lib/use-activity'
import { clearOfflineSnapshot, offlineCleared, readOfflineSnapshot, saveOfflineSnapshot, type OfflineSnapshot } from './storage'
const Context = createContext<{ snapshot?: OfflineSnapshot; shellReady: boolean; error: string; refresh: () => Promise<void>; disconnect: () => Promise<void>; disconnecting: boolean }>({ shellReady: false, error: '', refresh: async () => {}, disconnect: async () => {}, disconnecting: false })
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { session, authenticated } = useAuth()
  const userId = session?.user.id
  const identity = useRef(userId)
  const generation = useRef(0)
  const [disconnecting, setDisconnecting] = useState(false)
  useActivity(disconnecting, 'Disconnecting reader…')
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
  const refresh = useCallback(async () => {
    if (!supabase || !authenticated || !userId || !navigator.onLine) return
    const requestGeneration = generation.current
    try {
      const [{ data, error }, association] = await Promise.all([
        supabase.rpc('reader_offline_snapshot').abortSignal(AbortSignal.timeout(20000)),
        supabase.rpc('reader_organizer_connection', { p_action: 'status' }).abortSignal(AbortSignal.timeout(20000)),
      ])
      if (error) throw error
      if (association.error) throw association.error
      const next = { ...(data as unknown as Omit<OfflineSnapshot, 'userId' | 'savedAt'>), userId, savedAt: new Date().toISOString() }
      if (identity.current !== userId || generation.current !== requestGeneration) return
      // Do not expose one account's local snapshot to another signed-in account.
      if (!next.readers || !next.stories) throw new Error('Invalid availability report.')
      const enabled = (association.data as { enabled?: boolean } | null)?.enabled
      if (enabled === false) { clearOfflineSnapshot(); setError(''); return }
      next.connected = typeof enabled === 'boolean' ? enabled : Boolean(next.readers.length || next.cloudBooks?.length)
      saveOfflineSnapshot(next); setSnapshot(next); setError('')
    } catch { if (identity.current === userId && generation.current === requestGeneration) setError('Could not update reader reports or retain them locally. Showing the last saved report, if available.') }
  }, [authenticated, userId])
  async function disconnect() {
    setDisconnecting(true); setError(''); generation.current++
    try {
      if (!supabase || !authenticated || !userId || !navigator.onLine) throw new Error('Sign in online to disconnect the reader.')
      const { error } = await supabase.rpc('reader_organizer_connection', { p_action: 'disable' })
      if (error) throw error
      // In-flight report reads must not restore the connection after disconnecting.
      generation.current++
      if (identity.current === userId) clearOfflineSnapshot()
    } catch {
      const message = 'Could not disconnect the reader. Sign in online and try again.'
      setError(message); throw new Error(message)
    } finally { setDisconnecting(false) }
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
  return <Context value={{ snapshot: userId && snapshot?.userId !== userId ? undefined : snapshot, shellReady, error, refresh, disconnect, disconnecting }}>{children}</Context>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useOffline() { return useContext(Context) }
