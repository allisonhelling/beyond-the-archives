import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Collection, Story } from './model'
import { loadLibrary } from './repository'
type LibraryState = { stories: Story[]; collections: Collection[]; loading: boolean; error: string; refresh: () => Promise<void> }
const Context = createContext<LibraryState | null>(null)
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<{ stories: Story[]; collections: Collection[] }>({ stories: [], collections: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try { const next = await loadLibrary(); setData(next); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your library.'); throw e }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { let alive = true; loadLibrary().then(next => { if (alive) { setData(next); setError('') } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load library.') }).finally(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [])
  return <Context.Provider value={{ ...data, loading, error, refresh }}>{children}</Context.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary() { const value = useContext(Context); if (!value) throw new Error('Library provider missing'); return value }
