import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { updateEntry } from '../library/repository'
import { savedWorkIdentity, type Story } from '../library/model'
import type { OfflineMarking } from './storage'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/auth-context'
import { useActivity } from '../../lib/use-activity'
import { clearOfflineSnapshot, offlineCleared, readOfflineSnapshot, saveOfflineSnapshot, type OfflineSnapshot } from './storage'
const Context = createContext<{ snapshot?: OfflineSnapshot; shellReady: boolean; error: string; refresh: () => Promise<void>; disconnect: () => Promise<void>; disconnecting: boolean; forgetReport: (id: string) => Promise<void>; removingReport?: string; mark: (story: Story, field: 'favorite' | 'rec', value: boolean) => Promise<void> }>({ shellReady: false, error: '', refresh: async () => {}, disconnect: async () => {}, disconnecting: false, forgetReport: async () => {}, mark: async () => {} })
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { session, authenticated } = useAuth()
  const userId = session?.user.id
  const identity = useRef(userId)
  const generation = useRef(0)
  const [disconnecting, setDisconnecting] = useState(false)
  const [removingReport, setRemovingReport] = useState<string>()
  useActivity(Boolean(removingReport), 'Removing installation report…')
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
  const refreshing = useRef(false)
  const refresh = useCallback(async () => {
    if (!supabase || !authenticated || !userId || !navigator.onLine) return
    if (refreshing.current) return
    refreshing.current = true
    const requestGeneration = generation.current
    try {
      const retained = readOfflineSnapshot()
      for (const edit of retained?.userId === userId ? retained.pendingMarkings ?? [] : []) {
        if (identity.current !== userId || generation.current !== requestGeneration) return
        if (edit.entry) await updateEntry(edit.entry, edit.field === 'favorite' ? { is_favorite: edit.value } : { is_rec: edit.value }, edit.base ?? {})
        else if (edit.book) {
          const key = `${edit.book}/${edit.field}`
          const previous = await supabase.from('reader_cloud_values').select('revision').eq('key', key).maybeSingle()
          if (previous.error) throw previous.error
          if (identity.current !== userId || generation.current !== requestGeneration) return
          const result = await supabase.rpc('reader_cloud_apply', { p_id: edit.id, p_key: key, p_value: edit.value, p_base: previous.data?.revision ?? 0 })
          if (result.error) throw result.error
          if ((result.data as { conflict?: boolean })?.conflict) throw new Error('Marking changed during sync. Retry.')
        }
        if (identity.current !== userId || generation.current !== requestGeneration) return
        const current = readOfflineSnapshot()
        if (current?.userId === userId) saveOfflineSnapshot({ ...current, pendingMarkings: current.pendingMarkings?.filter(item => item.id !== edit.id) })
      }
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
    } catch { if (identity.current === userId && generation.current === requestGeneration) setError('Could not update reader reports or retain them locally. Showing the last saved report, if available.') } finally { refreshing.current = false }
  }, [authenticated, userId])
  async function mark(story: Story, field: 'favorite' | 'rec', value: boolean) {
    const current = readOfflineSnapshot()
    if (!current || userId && current.userId !== userId) throw new Error('Open the matching library to save markings.')
    const book = current.cloudBooks?.find(book => story.id === `reader-cloud-${book.id}` || Boolean((book.workCount ?? 0) <= 1 && savedWorkIdentity(book) && savedWorkIdentity(book) === String(story.work.ao3_work_id)))
    if (story.id.startsWith('reader-cloud-') && !book) throw new Error('Refresh the reader library before changing this work.')
    const edit: OfflineMarking = { id: crypto.randomUUID(), ...(!story.id.startsWith('reader-cloud-') ? { entry: story.id, base: { [field]: Boolean(field === 'favorite' ? story.is_favorite : story.is_rec) } } : book ? { book: book.id } : {}), field, value }
    generation.current++
    const next: OfflineSnapshot = { ...current, pendingMarkings: [...(current.pendingMarkings ?? []), edit],
      cloudBooks: current.cloudBooks?.map(item => item.id === book?.id || Boolean(book?.workId && item.workId === book.workId) ? { ...item, [field]: value } : item),
      stories: current.stories.map(item => item.id === story.id ? { ...item, [field === 'favorite' ? 'is_favorite' : 'is_rec']: value } : item) }
    saveOfflineSnapshot(next); setSnapshot(next)
    await refresh()
  }
  async function forgetReport(id: string) {
    setRemovingReport(id); setError('')
    const requestGeneration = ++generation.current
    try {
      if (!supabase || !authenticated || !userId || !navigator.onLine) throw new Error('Sign in online to remove a report.')
      const { error } = await supabase.rpc('reader_organizer_connection', { p_action: 'forget_report', p_installation: id })
      if (error) throw error
      if (identity.current !== userId || generation.current !== requestGeneration) return
      generation.current++
      const current = readOfflineSnapshot()
      if (current?.userId === userId) {
        const next = { ...current, readers: current.readers.filter(reader => reader.id !== id) }
        saveOfflineSnapshot(next); setSnapshot(next)
      }
    } catch {
      const message = 'Could not remove this installation report. Sign in online and try again.'
      if (identity.current === userId && generation.current === requestGeneration) setError(message)
      throw new Error(message)
    } finally { setRemovingReport(undefined) }
  }
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
  return <Context value={{ snapshot: userId && snapshot?.userId !== userId ? undefined : snapshot, shellReady, error, refresh, disconnect, disconnecting, forgetReport, removingReport, mark }}>{children}</Context>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useOffline() { return useContext(Context) }
