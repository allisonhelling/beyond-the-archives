import { isLibrarySyncSafetyLimit } from './library-sync-state'
import { useActivity } from '../../lib/use-activity'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '../../components/Dialog'
import { sampleMode } from '../../lib/sample-mode'
import { librarySyncCommand, type LibrarySyncState } from './extension'

type SyncStatus = { state: LibrarySyncState | null; setState: (state: LibrarySyncState | null) => void; refresh: () => Promise<void> }
const Context = createContext<SyncStatus | null>(null)
export function LibrarySyncProvider({ children }: { children: ReactNode }) {
 const [state, updateState] = useState<LibrarySyncState | null>(null)
 const [dismissed, setDismissed] = useState(''), [opening, setOpening] = useState(false), [openError, setOpenError] = useState('')
 useActivity(state?.status === 'running' || opening, opening ? 'Opening your scan…' : 'Scanning your AO3 library…')
 const version = useRef(0), sampleConnected = useRef(false), alive = useRef(true), inFlight = useRef(false)
 const setState = useCallback((next: LibrarySyncState | null) => { version.current++; updateState(next) }, [])
 const refresh = useCallback(async () => {
  sampleConnected.current = true
  if (inFlight.current) return
  inFlight.current = true
  const request = version.current
  try {
   const reply = await librarySyncCommand('status')
   if (alive.current && request === version.current) updateState(reply.state ?? null)
  } finally { inFlight.current = false }
 }, [])
 useEffect(() => {
  alive.current = true
  const poll = () => { if (!sampleMode || sampleConnected.current) void refresh().catch(() => {}) }
  poll(); const timer = setInterval(poll, 5000)
  // A StrictMode effect replay can reuse the pending read. Real unmounts are
  // guarded by alive; explicit scan actions still invalidate reads via version.
  return () => { alive.current = false; clearInterval(timer) }
 }, [refresh])
 const safetyLimit = isLibrarySyncSafetyLimit(state)
 const alertKey = state?.status === 'paused' && state.error ? state.attentionId ?? `${state.id}:${state.pages}:${state.error}` : ''
 async function openTab() {
  setOpening(true); setOpenError('')
  try { await librarySyncCommand('open-tab', { scanId: state?.id }) }
  catch (error) { setOpenError(error instanceof Error ? error.message : 'Could not open the scan tab.') }
  finally { setOpening(false) }
 }
 const close = () => { setDismissed(alertKey); setOpenError('') }
 return <Context.Provider value={{ state, setState, refresh }}>
  {children}
  {alertKey && alertKey !== dismissed && <Dialog title={safetyLimit ? 'AO3 Scan Limit Reached' : state?.attention === 'login' ? 'AO3 Sign-In Required' : state?.attention === 'rate_limit' ? 'AO3 Request Restriction' : 'AO3 Scan Needs Attention'} onClose={close} busy={opening}>
   <div className="confirmation-description"><p>{state?.error}</p><p>{safetyLimit ? 'Saved pages are preserved. Return to Library Sync and choose Prepare Saved Batch, then import the batch to continue scanning. Rebuild and reload the companion first if that action is unavailable.' : 'Your scan is paused and saved pages are preserved. Open the scan tab to complete sign-in or check the restriction. After it clears, return to Library Sync and choose Resume Scan.'}</p></div>
   {openError && <p role="alert" className="error-message">{openError}</p>}
   <div className="form-actions">{!safetyLimit && <button type="button" className="button primary" disabled={opening} onClick={() => void openTab()}>{opening ? 'Opening…' : 'Open Tab'}</button>}<Link className="button secondary" to="/imports" onClick={close}>Review Scan</Link><button type="button" className="button secondary" disabled={opening} onClick={close}>Dismiss</button></div>
  </Dialog>}
 </Context.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useLibrarySyncStatus() { const context = useContext(Context); if (!context) throw new Error('Library sync provider missing'); return context }
