import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { desktopExtensionHelp } from './extension'
import { useDesktopCompanion } from './useDesktopCompanion'

/** Eligibility follows the companion protocol, including in narrow desktop windows. */
export function DesktopRetrievalGate({ children }: { children: ReactNode }) {
 const { connected, hasConnected, checking, reconnect } = useDesktopCompanion()
 return <>
 {!connected && <section className="settings-card">
  <h2>Desktop Companion Required</h2>
  <p>{desktopExtensionHelp}</p>
  <div className="form-actions">
   <Link className="clickable-text" to="/settings#settings-metadata">Companion Settings</Link>
   <Link className="clickable-text" to="/add?import=manual">Add a Story Manually</Link>
   <button className="button secondary" disabled={checking} onClick={reconnect}>{checking ? 'Checking Connection…' : 'Check Connection'}</button>
  </div>
 </section>}
 {hasConnected && <div hidden={!connected}>{children}</div>}
 </>
}
